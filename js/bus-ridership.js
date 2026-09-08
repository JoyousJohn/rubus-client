// js/bus-ridership.js - extracted verbatim from js/map.js
let busRiderships = {};

let busRidershipCharts = {};
let currentRidershipChartBusId = null;

function shouldShowCapacityChart(busName) {
    const timeRiderships = busRiderships[busName];
    if (!timeRiderships || Object.keys(timeRiderships).length === 0) {
        return false;
    }
    
    const values = Object.values(timeRiderships);
    const allSame = values.every(value => value === values[0]);
    if (allSame) {
        return false; // Hide chart if all values are the same
    }
    
    // Count unique values
    const uniqueValues = new Set(values);
    if (uniqueValues.size < 5) {
        return false; // Hide chart if fewer than 5 unique values
    }
    
    return true; // Show chart if it has 5 or more unique values
}

function updateHistoricalCapacity(busName) {
    // Only proceed if this is a new bus selection or data needs refresh
    const currentMinute = new Date().getMinutes();
    const shouldRefresh = currentMinute % 5 === 1 && !busRiderships.lastUpdate || 
                         (currentMinute % 5 === 1 && new Date().getTime() - busRiderships.lastUpdate > 60000);
    
    const handleChartUpdate = () => {
        const shouldShow = shouldShowCapacityChart(busName);
        if (shouldShow) {
            createBusRidershipChart(busName);
            currentRidershipChartBusId = busName;
        } else {
            $('.bus-ridership-wrapper').hide();
        }
    };
                         
    if (Object.keys(busRiderships).length === 0 || shouldRefresh) {
        fetch('https://demo.rubus.live/bus_ridership')
            .then(response => response.json())
            .then(data => {
                const dataChanged = JSON.stringify(busRiderships) !== JSON.stringify(data);
                busRiderships = data;
                busRiderships.lastUpdate = new Date().getTime();
                if (!busRidershipCharts[busName] || dataChanged) {
                    if (popupBusName && popupBusName !== busName) {
                        console.warn('[bus-ridership] Dropped stale ridership response for ' + busName + '; current popup is ' + popupBusName);
                        return;
                    }
                    handleChartUpdate();
                }
                updateRubusResponseTime();
            })
            .catch(error => {
                console.error('Error fetching bus ridership data:', error);
                markRubusRequestsFailing();
            });
    } else if (!busRidershipCharts[busName]) {
        handleChartUpdate();
    }
}

function formatBusRidershipEntries(timeRiderships) {
    const easternOffset = getEasternOffsetMinutes();
    const entries = Object.entries(timeRiderships).map(([key, value]) => {
        const utcMinute = parseInt(key, 10);
        let easternMinutes = (utcMinute - easternOffset) % 1440;
        if (easternMinutes < 0) easternMinutes += 1440; // Handle day wraparound

        // Transit service day starts at 5:00 AM (300 mins); early morning hours sort at the end
        const sortMinutes = easternMinutes < 300 ? easternMinutes + 1440 : easternMinutes;

        const hours = Math.floor(easternMinutes / 60);
        const minutes = easternMinutes % 60;
        const hour12 = hours % 12 || 12;
        const ampm = hours < 12 ? 'AM' : 'PM';
        const minuteStr = minutes < 10 ? '0' + minutes : minutes;
        const formattedTime = `${hour12}:${minuteStr} ${ampm}`;

        return [formattedTime, value, sortMinutes];
    });

    entries.sort((a, b) => a[2] - b[2]);

    return {
        labels: entries.map(e => e[0]),
        values: entries.map(e => e[1])
    };
}

function createBusRidershipChart(busName) {
    
    // If chart already exists, just update its data if needed
    if (busRidershipCharts[busName]) {
        const timeRiderships = busRiderships[busName];
        if (!timeRiderships || !Object.keys(timeRiderships).length) {
            $('.bus-historical-capacity').hide();
            return;
        }

        const { labels: newLabels, values: newValues } = formatBusRidershipEntries(timeRiderships);

        // Only update if data has changed
        const currentLabels = busRidershipCharts[busName].data.labels;
        const currentValues = busRidershipCharts[busName].data.datasets[0].data;
        
        if (JSON.stringify(currentLabels) !== JSON.stringify(newLabels) || 
            JSON.stringify(currentValues) !== JSON.stringify(newValues)) {
            busRidershipCharts[busName].data.labels = newLabels;
            busRidershipCharts[busName].data.datasets[0].data = newValues;
            busRidershipCharts[busName].update();
        }
        
        $('.bus-historical-capacity').show();
        return;
    }

    if (!busRiderships[busName]) {
        $('.bus-historical-capacity').hide();
        return;
    }

    const timeRiderships = busRiderships[busName];
    if (!Object.keys(timeRiderships).length) {
        $('.bus-historical-capacity').hide();
        return;
    }

    const { labels, values } = formatBusRidershipEntries(timeRiderships);

    const ctx = document.createElement('canvas');
    $('.bus-historical-capacity').empty().css('height', '90px').append(ctx).show();
    
    busRidershipCharts[busName] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                // label: 'Passengers',
                data: values,
                borderColor: colorMappings[busData[busName].route],
                backgroundColor: function() {
                    const color = colorMappings[busData[busName].route];
                    if (color.startsWith('rgb')) {
                        return color.replace(')', ', 0.2)').replace('rgb', 'rgba');
                    } else {
                        const temp = document.createElement('div');
                        temp.style.color = color;
                        document.body.appendChild(temp);
                        const rgb = window.getComputedStyle(temp).color;
                        document.body.removeChild(temp);
                        return rgb.replace(')', ', 0.2)').replace('rgb', 'rgba');
                    }
                }(),
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} riders`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    display: false
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        padding: 5,
                        // Explicitly set which ticks to display
                        callback: function(value, index, values) {
                            const label = this.getLabelForValue(value);
                            if (!label) return '';
                            const timePart = String(label).split(' ')[0];
                            
                            // For intermediate labels, only show hour labels (:00)
                            if (timePart.endsWith(':00')) {
                                const [hour, period] = String(label).split(' ');
                                const hourNum = hour.split(':')[0];
                                return hourNum + ' ' + (period || '');
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });
}
