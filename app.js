/* PR Execution Time Tracker — Chart.js app
   Palette & typography match the observability redesign.
*/

const COLORS = {
    accent: '#4fc3d1',
    accentFill: 'rgba(79, 195, 209, 0.12)',
    amber: '#f5a524',
    amberFill: 'rgba(245, 165, 36, 0.35)',
    grid: '#1b1f25',
    tick: '#5c6167',
    ink: '#e6e8eb',
    panel: '#0a0b0d',
    border: '#1f2328',
    red: '#f47174',
    green: '#67d29b',
};

const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

// Apply Chart.js global defaults
Chart.defaults.font.family = MONO;
Chart.defaults.font.size = 11;
Chart.defaults.color = COLORS.tick;

document.addEventListener('DOMContentLoaded', async () => {
    const timeCanvas = document.getElementById('timeChart');
    const loadingEl = document.createElement('div');
    loadingEl.textContent = 'Loading data…';
    loadingEl.style.cssText = `
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        font-family: ${MONO}; font-size: 12px; color: ${COLORS.tick};
    `;
    timeCanvas.parentElement.appendChild(loadingEl);

    let allData = [];
    let historyChart = null;
    let monthlyChart = null;

    function updateDashboard() {
        const selectedCategory = document.getElementById('jobCategory').value;
        const selectedPeriod = document.getElementById('timePeriod').value;

        const now = moment();
        let startDate;
        switch (selectedPeriod) {
            case 'week':     startDate = now.clone().subtract(1, 'week'); break;
            case 'month':    startDate = now.clone().subtract(1, 'month'); break;
            case '3months':  startDate = now.clone().subtract(3, 'months'); break;
            case '6months':  startDate = now.clone().subtract(6, 'months'); break;
            case 'year':     startDate = now.clone().subtract(1, 'year'); break;
            case '2years':   startDate = now.clone().subtract(2, 'years'); break;
            default:         startDate = now.clone().subtract(6, 'months');
        }

        const data = allData
            .filter(d => d.job_category === selectedCategory && moment(d.created_at).isAfter(startDate))
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const durations = data.map(d => d.duration / 60);

        // ---- Stats ----
        const setNum = (id, v, digits = 1) => {
            document.getElementById(id).textContent = Number.isFinite(v) ? v.toFixed(digits) : '—';
        };

        if (!durations.length) {
            ['stat-avg', 'stat-p50', 'stat-p95', 'stat-max', 'stat-trend', 'stat-total']
                .forEach(id => (document.getElementById(id).textContent = '—'));
        } else {
            const sorted = [...durations].sort((a, b) => a - b);
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            const max = sorted[sorted.length - 1];

            // Trend: first 20% vs last 20%
            const chunk = Math.max(1, Math.floor(durations.length * 0.2));
            const firstAvg = durations.slice(0, chunk).reduce((a, b) => a + b, 0) / chunk;
            const lastAvg = durations.slice(-chunk).reduce((a, b) => a + b, 0) / chunk;
            const delta = firstAvg ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;

            setNum('stat-avg', avg);
            setNum('stat-p50', p50);
            setNum('stat-p95', p95);
            setNum('stat-max', max);
            document.getElementById('stat-total').textContent = data.length.toLocaleString();

            const trendEl = document.getElementById('stat-trend');
            trendEl.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1);
            trendEl.classList.toggle('down', delta > 1);   // slower is bad
            trendEl.classList.toggle('up', delta < -1);    // faster is good
        }

        // ---- Panel meta (date range) ----
        const panelRange = document.getElementById('panel-range');
        if (data.length) {
            panelRange.textContent =
                moment(data[0].created_at).format('MMM D, YYYY') +
                ' — ' +
                moment(data[data.length - 1].created_at).format('MMM D, YYYY');
        } else {
            panelRange.textContent = '';
        }

        // ---- History line chart ----
        if (historyChart) historyChart.destroy();
        historyChart = new Chart(timeCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.map(d => moment(d.created_at).format('MMM D, YYYY')),
                datasets: [{
                    label: 'Duration (min)',
                    data: durations,
                    borderColor: COLORS.accent,
                    backgroundColor: (ctx) => {
                        const { ctx: c, chartArea } = ctx.chart;
                        if (!chartArea) return COLORS.accentFill;
                        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        g.addColorStop(0, 'rgba(79, 195, 209, 0.28)');
                        g.addColorStop(1, 'rgba(79, 195, 209, 0)');
                        return g;
                    },
                    borderWidth: 1.5,
                    pointRadius: 1.5,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: COLORS.panel,
                    pointHoverBorderColor: COLORS.accent,
                    pointHoverBorderWidth: 1.5,
                    fill: true,
                    tension: 0.25,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        ticks: {
                            color: COLORS.tick,
                            font: { family: MONO, size: 10 },
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8,
                        },
                        grid: { color: COLORS.grid, drawTicks: false },
                        border: { color: COLORS.border },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: COLORS.tick,
                            font: { family: MONO, size: 10 },
                            padding: 8,
                        },
                        grid: { color: COLORS.grid, drawTicks: false },
                        border: { display: false },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: COLORS.panel,
                        borderColor: COLORS.accent,
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 2,
                        titleColor: COLORS.ink,
                        titleFont: { family: MONO, size: 11, weight: '600' },
                        bodyColor: COLORS.ink,
                        bodyFont: { family: MONO, size: 11 },
                        displayColors: false,
                        callbacks: {
                            title: (items) => items[0]?.label ?? '',
                            label: (ctx) => {
                                const item = data[ctx.dataIndex];
                                return [
                                    `duration  ${ctx.raw.toFixed(1)} min`,
                                    `branch    ${item.branch}`,
                                    `pr        ${(item.display_title || '').slice(0, 48)}`,
                                ];
                            },
                        },
                    },
                    zoom: {
                        pan: { enabled: true, mode: 'x' },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                            onZoomComplete: () => {
                                document.getElementById('resetZoom').style.display = 'inline-block';
                            },
                        },
                    },
                },
                onClick: (_event, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        if (data[idx]?.url) window.open(data[idx].url, '_blank');
                    }
                },
            },
        });

        // ---- Monthly bar chart ----
        if (monthlyChart) monthlyChart.destroy();
        const monthlyBuckets = {};
        data.forEach(d => {
            const key = moment(d.created_at).format('YYYY-MM');
            if (!monthlyBuckets[key]) monthlyBuckets[key] = { total: 0, count: 0 };
            monthlyBuckets[key].total += d.duration / 60;
            monthlyBuckets[key].count += 1;
        });
        const months = Object.keys(monthlyBuckets).sort();
        const averages = months.map(m => monthlyBuckets[m].total / monthlyBuckets[m].count);
        const monthLabels = months.map(m => moment(m, 'YYYY-MM').format('MMM YYYY'));

        monthlyChart = new Chart(document.getElementById('monthlyChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Avg duration (min)',
                    data: averages,
                    backgroundColor: COLORS.amberFill,
                    borderColor: COLORS.amber,
                    borderWidth: 1,
                    borderRadius: 2,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: {
                            color: COLORS.tick,
                            font: { family: MONO, size: 10 },
                            maxRotation: 0,
                            autoSkip: true,
                        },
                        grid: { display: false },
                        border: { color: COLORS.border },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: COLORS.tick,
                            font: { family: MONO, size: 10 },
                            padding: 8,
                        },
                        grid: { color: COLORS.grid, drawTicks: false },
                        border: { display: false },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: COLORS.panel,
                        borderColor: COLORS.amber,
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 2,
                        titleColor: COLORS.ink,
                        titleFont: { family: MONO, size: 11, weight: '600' },
                        bodyColor: COLORS.ink,
                        bodyFont: { family: MONO, size: 11 },
                        displayColors: false,
                        callbacks: {
                            label: (ctx) => `avg  ${ctx.raw.toFixed(1)} min`,
                        },
                    },
                },
            },
        });
    }

    try {
        const dataUrl = new URL(`${import.meta.env.BASE_URL}data.json`, window.location.origin).toString();
        const response = await fetch(dataUrl, {
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} while loading ${dataUrl}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const bodyPreview = (await response.text()).slice(0, 120).replace(/\s+/g, ' ');
            throw new Error(
                `Expected JSON from ${dataUrl} but got "${contentType}". Response starts with: ${bodyPreview}`
            );
        }

        allData = await response.json();
        loadingEl.remove();

        const jobSelector = document.getElementById('jobCategory');
        const periodSelector = document.getElementById('timePeriod');

        updateDashboard();

        jobSelector.addEventListener('change', updateDashboard);
        periodSelector.addEventListener('change', updateDashboard);

        document.getElementById('resetZoom').addEventListener('click', () => {
            if (historyChart) {
                historyChart.resetZoom();
                document.getElementById('resetZoom').style.display = 'none';
            }
        });

        // Footer sync time
        const footSync = document.getElementById('foot-sync');
        if (footSync) footSync.textContent = 'Last sync: ' + moment().format('MMM D, YYYY HH:mm');

    } catch (err) {
        console.error('Error loading data:', err);
        loadingEl.textContent = 'Error loading data. Check data.json URL/base path and server rewrite rules.';
        loadingEl.style.color = COLORS.red;
    }
});
