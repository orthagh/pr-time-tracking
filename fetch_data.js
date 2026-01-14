const { Octokit } = require("@octokit/rest");
const fs = require("fs-extra");
const moment = require("moment");
const { execSync } = require("child_process");

const STATE_FILE = "state.json";
const DATA_FILE = "data.json";

async function run() {
    const args = process.argv.slice(2);
    const mode = args.includes("--newer") ? "newer" : "older";

    const GITHUB_TOKEN = process.env.GH_TOKEN || execSync("gh auth token").toString().trim();
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    const owner = "glpi-project";
    const repo = "glpi";
    const workflow_id = 22080;
    const branches = ["main", "11.0/bugfixes"];
    const jobCategories = {
        "PHP Tests": ["Test on PHP"],
        "E2E Tests": ["E2E", "Playwright"]
    };

    let state = { currentMonth: moment().format("YYYY-MM") };
    if (await fs.pathExists(STATE_FILE)) {
        state = await fs.readJson(STATE_FILE);
    }

    let allData = [];
    if (await fs.pathExists(DATA_FILE)) {
        allData = await fs.readJson(DATA_FILE);
    }

    // Use a composite key to track existing records (runId + category)
    const existingKeys = new Set(allData.map(d => `${d.id}_${d.job_category}`));
    const twoYearsAgo = moment().subtract(2, "years").startOf("month");

    console.log(`Mode: ${mode}`);
    console.log(`Branches: ${branches.join(", ")}`);
    console.log(`Tracking Categories: ${Object.keys(jobCategories).join(", ")}`);

    let currentMonth = mode === "newer" ? moment() : moment(state.currentMonth, "YYYY-MM");
    let stopFetching = false;

    while (!stopFetching) {
        const dateRange = `${currentMonth.format("YYYY-MM")}-01..${currentMonth.endOf("month").format("YYYY-MM-DD")}`;
        console.log(`--- Processing Month: ${currentMonth.format("MMMM YYYY")} (${dateRange}) ---`);
        
        for (const branch of branches) {
            console.log(`> Branch: ${branch}`);
            let page = 1;
            while (true) {
                console.log(`  Fetching page ${page}...`);
                const { data: runs } = await octokit.actions.listWorkflowRuns({
                    owner,
                    repo,
                    workflow_id,
                    per_page: 100,
                    page,
                    status: "success",
                    branch,
                    created: dateRange
                });

                if (runs.workflow_runs.length === 0) break;

                for (const run of runs.workflow_runs) {
                    console.log(`  Processing run ${run.id} (${run.created_at}) [${run.display_title}]...`);

                    try {
                        const { data: jobs } = await octokit.actions.listJobsForWorkflowRun({
                            owner,
                            repo,
                            run_id: run.id
                        });

                        for (const [category, prefixes] of Object.entries(jobCategories)) {
                            const key = `${run.id}_${category}`;
                            if (existingKeys.has(key)) continue;

                            // Find all jobs matching any of the prefixes for this category
                            const matchingJobs = jobs.jobs.filter(j => 
                                prefixes.some(prefix => j.name.startsWith(prefix)) && j.status === "completed"
                            );
                            
                            if (matchingJobs.length > 0) {
                                // Sum durations of all matching jobs
                                let totalDurationSeconds = 0;
                                const jobNames = [];
                                
                                for (const job of matchingJobs) {
                                    const start = moment(job.started_at);
                                    const end = moment(job.completed_at);
                                    totalDurationSeconds += end.diff(start, "seconds");
                                    jobNames.push(job.name);
                                }

                                if (totalDurationSeconds >= 60) {
                                    allData.push({
                                        id: run.id,
                                        created_at: run.created_at,
                                        duration: totalDurationSeconds,
                                        sha: run.head_sha,
                                        url: run.html_url,
                                        pr: run.pull_requests.length > 0 ? run.pull_requests[0].number : null,
                                        display_title: run.display_title,
                                        job_name: jobNames.join(", "),
                                        job_category: category,
                                        branch: branch
                                    });
                                    existingKeys.add(key);
                                }
                            }
                        }

                    } catch (err) {
                        console.error(`  Error fetching jobs for run ${run.id}: ${err.message}`);
                    }
                }

                page++;
                // Save partially after each page
                allData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                await fs.writeJson(DATA_FILE, allData, { spaces: 2 });
            }
        }

        if (mode === "newer") {
            stopFetching = true;
        } else {
            currentMonth.subtract(1, "month");
            state.currentMonth = currentMonth.format("YYYY-MM");
            await fs.writeJson(STATE_FILE, state, { spaces: 2 });

            if (currentMonth.isBefore(twoYearsAgo)) {
                console.log("Reached two year limit. Done.");
                stopFetching = true;
            }
        }
    }

    allData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    await fs.writeJson(DATA_FILE, allData, { spaces: 2 });
    console.log(`Process complete. Total records: ${allData.length}`);
}

run().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
