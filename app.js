document.addEventListener('DOMContentLoaded', async () => {
    const ctx = document.getElementById('timeChart').getContext('2d');
    const loadingEl = document.createElement('div');
    loadingEl.textContent = 'Loading data...';
    loadingEl.style.textAlign = 'center';
    loadingEl.style.marginTop = '20px';
    document.querySelector('.chart-container').appendChild(loadingEl);

    let allData = [];
    let historyChart = null;
    let monthlyChart = null;

    function updateDashboard() {
        const selectedCategory = document.getElementById('jobCategory').value;
        const selectedPeriod = document.getElementById('timePeriod').value;
        
        const now = moment();
        let startDate;

        switch (selectedPeriod) {
            case 'week': startDate = now.clone().subtract(1, 'week'); break;
            case 'month': startDate = now.clone().subtract(1, 'month'); break;
            case '3months': startDate = now.clone().subtract(3, 'months'); break;
            case '6months': startDate = now.clone().subtract(6, 'months'); break;
            case 'year': startDate = now.clone().subtract(1, 'year'); break;
            default: startDate = now.clone().subtract(6, 'months');
        }

        const data = allData.filter(d => {
            const isCategory = d.job_category === selectedCategory;
            const isAfterStart = moment(d.created_at).isAfter(startDate);
            return isCategory && isAfterStart;
        });

        // Sort data by date ascending for the charts
        data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        const durations = data.map(d => d.duration / 60);

        // Stats
        const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
        const sortedDurations = [...durations].sort((a, b) => a - b);
        const p95 = durations.length ? sortedDurations[Math.floor(sortedDurations.length * 0.95)] : 0;

        document.getElementById('stat-avg').textContent = avg.toFixed(1);
        document.getElementById('stat-p95').textContent = p95.toFixed(1);
        document.getElementById('stat-total').textContent = data.length;

        // History Chart
        if (historyChart) historyChart.destroy();
        const ctx = document.getElementById('timeChart').getContext('2d');
        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => moment(d.created_at).format('MMM D, YYYY')),
                datasets: [{
                    label: 'Job Duration (minutes)',
                    data: durations,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const item = data[index];
                                return `[${item.branch}] ${item.display_title}: ${context.raw.toFixed(1)} mins`;
                            }
                        }
                    },
                    zoom: {
                        pan: { enabled: true, mode: 'x' },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                            onZoomComplete: () => {
                                document.getElementById('resetZoom').style.display = 'block';
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        window.open(data[index].url, '_blank');
                    }
                }
            }
        });

        // Monthly Chart
        if (monthlyChart) monthlyChart.destroy();
        const monthlyData = {};
        data.forEach(d => {
            const month = moment(d.created_at).format('YYYY-MM');
            if (!monthlyData[month]) monthlyData[month] = { total: 0, count: 0 };
            monthlyData[month].total += d.duration / 60;
            monthlyData[month].count += 1;
        });

        const months = Object.keys(monthlyData).sort();
        const averages = months.map(m => monthlyData[m].total / monthlyData[m].count);
        const monthLabels = months.map(m => moment(m, 'YYYY-MM').format('MMM YYYY'));

        const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
        monthlyChart = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Avg Duration (mins)',
                    data: averages,
                    backgroundColor: 'rgba(249, 115, 22, 0.6)',
                    borderColor: '#f97316',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        callbacks: { label: (context) => `Avg: ${context.raw.toFixed(1)} mins` }
                    }
                }
            }
        });
    }

    try {
        const response = await fetch('data.json');
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

    } catch (err) {
        console.error('Error loading data:', err);
        loadingEl.textContent = 'Error loading data. Make sure data.json exists.';
        loadingEl.style.color = '#ef4444';
    }
});
