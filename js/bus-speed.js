// js/bus-speed.js - extracted verbatim from js/map.js
let speedTimeout = {};
let showBusSpeeds = true;

function clearBusSpeed(busName){
    if (speedTimeout[busName]){
        clearInterval(speedTimeout[busName]);
        delete speedTimeout[busName];
    }
}
window.clearBusSpeed = clearBusSpeed;

// Method to calculate speed in mph for a specific bus
async function calculateSpeed(busName) {

    const currentLatitude = busData[busName].lat;
    const currentLongitude = busData[busName].long;
    const currentTime = new Date().getTime() / 1000;  // Time in seconds

    // Check if we have previous data for this bus
    if (!busData[busName].previousLatitude) {
        // Initialize previous data for this bus
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime
        return null;
    }

    const previousData = busData[busName];
    const distance = haversine(previousData.previousLatitude, previousData.previousLongitude, currentLatitude, currentLongitude);

    // Calculate time diff and guard against background-resume gaps or clock anomalies
    const timeDiffSeconds = (currentTime - previousData.previousSpeedTime);
    if (timeDiffSeconds <= 0 || timeDiffSeconds > 30) {
        // Reset baseline on invalid/large gaps to avoid unrealistic speeds when resuming
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime;
        delete busData[busName].lastRawSpeed;
        delete busData[busName].recentRawSpeeds;
        return null;
    }
    const timeDiffHours = timeDiffSeconds / 3600;

    // console.log(distance)

    if (timeDiffHours === 0) {
        return;
    }

    const rawSpeed = distance / timeDiffHours;
    const MAX_REASONABLE_SPEED = 65; // mph
    const MAX_STEP_DELTA = 12;       // mph per hop max change relative to last accepted

    // Reject obvious GPS jumps
    if (rawSpeed > 100) {
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime;
        delete busData[busName].lastRawSpeed;
        delete busData[busName].recentRawSpeeds;
        if (busData[busName].visualSpeed !== undefined && busData[busName].visualSpeed > MAX_REASONABLE_SPEED) {
            busData[busName].visualSpeed = MAX_REASONABLE_SPEED;
        }
        return null;
    }

    // Maintain a short rolling window of recent raw speeds for robust smoothing
    if (!Array.isArray(busData[busName].recentRawSpeeds)) {
        busData[busName].recentRawSpeeds = [];
    }
    busData[busName].recentRawSpeeds.push(rawSpeed);
    if (busData[busName].recentRawSpeeds.length > 5) {
        busData[busName].recentRawSpeeds.shift();
    }

    // Rolling median to reduce effect of outliers
    const medianOf = (arr) => {
        const sorted = [...arr].sort((a,b) => a-b);
        const mid = Math.floor(sorted.length/2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
    };
    const smoothedSpeed = medianOf(busData[busName].recentRawSpeeds);

    // Enforce post-smoothing cap and step-rate limit
    let baselineSpeed = ('speed' in busData[busName]) ? (busData[busName].speed || 0) : 0;
    let proposedSpeed = Math.min(smoothedSpeed, MAX_REASONABLE_SPEED);
    if (baselineSpeed > 0) {
        const maxUp = baselineSpeed + MAX_STEP_DELTA;
        const maxDown = Math.max(0, baselineSpeed - MAX_STEP_DELTA * 1.5);
        proposedSpeed = Math.min(Math.max(proposedSpeed, maxDown), maxUp);
    }

    const acceptedSpeed = proposedSpeed;
    // console.log('averagedSpeed: ', averagedSpeed)

    // // Discard outlier speeds (e.g., resume or GPS jump) and reset baseline
    // if (realSpeed > 60) { // mph; higher is unrealistic for campus buses
    //     busData[busName].previousLatitude = currentLatitude;
    //     busData[busName].previousLongitude = currentLongitude;
    //     busData[busName].previousSpeedTime = currentTime;
    //     return null;
    // }

    if (!('visualSpeed' in busData[busName])) {
        busData[busName].speed = acceptedSpeed;
        busData[busName].visualSpeed = acceptedSpeed;
        if (popupBusName === busName) {
            updateBusPopupSpeedOrCapacity(busName);
        }
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        busData[busName].previousSpeedTime = currentTime;
        return
    }

    const currentVisualSpeed = busData[busName].visualSpeed;  // Use 0 if speed is not set
    const speedDiff = acceptedSpeed - currentVisualSpeed;
    // if (speedDiff < 1) return

    // Only animate if UI actually shows this bus's speed (popup or route panel)
    const isSpeedVisible = (typeof popupBusName !== 'undefined' && popupBusName === busName && showBusSpeeds) || (typeof panelRoute !== 'undefined' && panelRoute === busData[busName].route);
    if (!isSpeedVisible) {
        busData[busName].speed = acceptedSpeed;
        busData[busName].visualSpeed = acceptedSpeed;
        busData[busName].previousLatitude = currentLatitude;
        busData[busName].previousLongitude = currentLongitude;
        if (distance > 0.002) {
            busData[busName].previousSpeedTime = currentTime;
        }
        // Ensure no orphaned interval for invisible buses
        clearInterval(speedTimeout[busName]);
        delete speedTimeout[busName];
        return;
    }
    
    let totalUpdateSeconds = 7;
    if (acceptedSpeed < 10) {
        totalUpdateSeconds = 3; //decelerate faster
    }
    
    const denom = Math.max(Math.abs(speedDiff), 0.01);
    const updateIntervalMs = Math.min(2000, Math.max(50, (totalUpdateSeconds*1000) / denom));

    // if (popupBusName === busName) {
    //     console.log("speedDiff: ", speedDiff);
    //     console.log("updateIntervalMs: ", updateIntervalMs)
    // }

    // console.log(updateIntervalMs)

    const speedChangeDir = speedDiff > 0 ? 1 : -1;

    clearInterval(speedTimeout[busName]);

    // Set initial speed before starting the interval
    busData[busName].speed = acceptedSpeed;
    busData[busName].visualSpeed = currentVisualSpeed

    let elapsedMs = 0;
    speedTimeout[busName] = setInterval(() => {

        if (!busData[busName]) { // handle out of service
            clearInterval(speedTimeout[busName]);
            return;
        }

        busData[busName].visualSpeed += speedChangeDir;
        if (busData[busName].visualSpeed < 0) {
            busData[busName].visualSpeed = 0;
        }

        elapsedMs += updateIntervalMs;
        
        if (popupBusName === busName) {
            updateBusPopupSpeedOrCapacity(busName);
        }

        if (panelRoute === busData[busName].route) {
            $(`.route-bus-speed[bus-name="${busName}"]`).text(parseInt(busData[busName].visualSpeed) + 'mph | ' + busData[busName].capacity + '% full')
        }
        
        if (elapsedMs >= totalUpdateSeconds*1000) {
            clearInterval(speedTimeout[busName]);
        }
    }, updateIntervalMs); // Convert seconds to milliseconds


    // Update the previous data for this bus
    busData[busName].previousLatitude = currentLatitude;
    busData[busName].previousLongitude = currentLongitude;
    busData[busName].previousSpeedTime = currentTime;
    // busData[busName].secondsDiff = currentTime - previousData.previousTime;

}
