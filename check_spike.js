const fs = require("fs-extra");
const moment = require("moment");

// Configuration
const BASELINE_DAYS = 14;    // Days of history for baseline average
const RECENT_RUNS = 3;       // Number of recent runs to average
const SPIKE_THRESHOLD = 0.10; // 10% increase triggers alert

const DATA_FILE = "data.json";

async function checkSpikes() {
    if (!await fs.pathExists(DATA_FILE)) {
        console.error("Error: data.json not found");
        process.exit(1);
    }

    const allData = await fs.readJson(DATA_FILE);
    const categories = ["PHP Tests", "E2E Tests"];
    const spikes = [];

    for (const category of categories) {
        const categoryData = allData
            .filter(d => d.job_category === category)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (categoryData.length < RECENT_RUNS + 5) {
            console.log(`[${category}] Not enough data for analysis (${categoryData.length} records)`);
            continue;
        }

        // Recent average (last N runs)
        const recentRuns = categoryData.slice(0, RECENT_RUNS);
        const recentAvg = recentRuns.reduce((sum, d) => sum + d.duration, 0) / RECENT_RUNS;

        // Baseline average (last N days, excluding recent runs)
        const baselineStart = moment().subtract(BASELINE_DAYS, "days");
        const baselineData = categoryData
            .slice(RECENT_RUNS) // Exclude recent runs
            .filter(d => moment(d.created_at).isAfter(baselineStart));

        if (baselineData.length < 3) {
            console.log(`[${category}] Not enough baseline data (${baselineData.length} records in last ${BASELINE_DAYS} days)`);
            continue;
        }

        const baselineAvg = baselineData.reduce((sum, d) => sum + d.duration, 0) / baselineData.length;
        const percentageChange = (recentAvg - baselineAvg) / baselineAvg;

        console.log(`[${category}]`);
        console.log(`  Recent avg (last ${RECENT_RUNS} runs): ${(recentAvg / 60).toFixed(1)} min`);
        console.log(`  Baseline avg (last ${BASELINE_DAYS} days): ${(baselineAvg / 60).toFixed(1)} min`);
        console.log(`  Change: ${(percentageChange * 100).toFixed(1)}%`);

        if (percentageChange > SPIKE_THRESHOLD) {
            spikes.push({
                category,
                recentAvg: recentAvg / 60,
                baselineAvg: baselineAvg / 60,
                percentageChange: percentageChange * 100,
                threshold: SPIKE_THRESHOLD * 100
            });
            console.log(`  ⚠️  SPIKE DETECTED!`);
        } else {
            console.log(`  ✓ Within normal range`);
        }
        console.log();
    }

    if (spikes.length > 0) {
        console.log("=== SPIKES DETECTED ===");
        
        // Output for GitHub Actions
        const spikeDetails = spikes.map(s => 
            `**${s.category}**: ${s.recentAvg.toFixed(1)} min (was ${s.baselineAvg.toFixed(1)} min, +${s.percentageChange.toFixed(1)}%)`
        ).join("\n");
        
        // Set output for GitHub Actions
        if (process.env.GITHUB_OUTPUT) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `spike_detected=true\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `spike_details<<EOF\n${spikeDetails}\nEOF\n`);
        }
        
        process.exit(1);
    } else {
        console.log("All categories within normal range.");
        if (process.env.GITHUB_OUTPUT) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `spike_detected=false\n`);
        }
        process.exit(0);
    }
}

checkSpikes().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
