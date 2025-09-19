/**
 * Pathfinding module for computing routes between two locations
 * using the road network data from lines.geojson
 */

// Global debug flag for pathfinding - set to false to disable debug messages
let PATHFINDING_DEBUG = false;

class PathfindingEngine {
    constructor() {
        this.roadNetwork = null;
        this.graph = null;
        this.isLoaded = false;
        this.pathCache = new Map(); // Cache for computed paths
    }

    /**
     * Load and parse the road network GeoJSON data
     * @returns {Promise<void>}
     */
    async loadRoadNetwork() {
        try {
            if (PATHFINDING_DEBUG) console.log('Loading road network data...');
            const response = await fetch('lib/geojson/lines.geojson');
            if (!response.ok) {
                throw new Error(`Failed to load road network data: ${response.statusText}`);
            }
            
            this.roadNetwork = await response.json();
            this.buildGraph();
            this.isLoaded = true;
            if (PATHFINDING_DEBUG) console.log('Road network loaded successfully');
        } catch (error) {
            console.error('Error loading road network:', error);
            throw error;
        }
    }

    /**
     * Build a graph structure from the GeoJSON road network
     */
    buildGraph() {
        if (!this.roadNetwork || !this.roadNetwork.features) {
            throw new Error('Road network data not available');
        }

        this.graph = new Map(); // nodeId -> { coordinates: [lng, lat], neighbors: Set }

        if (PATHFINDING_DEBUG) console.log('Building graph from road network...');

        this.roadNetwork.features.forEach(feature => {
            const geometry = feature.geometry;
            const properties = feature.properties;

            // Skip if not a LineString or if it's not a road/path
            if (geometry.type !== 'LineString' || !properties.highway) {
                return;
            }

            const coordinates = geometry.coordinates;
            
            // Add nodes and edges for each segment
            for (let i = 0; i < coordinates.length - 1; i++) {
                const fromCoord = coordinates[i];
                const toCoord = coordinates[i + 1];
                
                const fromId = this.getNodeId(fromCoord);
                const toId = this.getNodeId(toCoord);
                
                // Calculate distance for edge weight
                const distance = this.calculateDistance(fromCoord, toCoord);
                
                // Add nodes if they don't exist
                if (!this.graph.has(fromId)) {
                    this.graph.set(fromId, {
                        coordinates: fromCoord,
                        neighbors: new Map() // neighborId -> { distance, properties }
                    });
                }
                
                if (!this.graph.has(toId)) {
                    this.graph.set(toId, {
                        coordinates: toCoord,
                        neighbors: new Map()
                    });
                }
                
                // Add bidirectional edges (assuming roads are bidirectional unless specified otherwise)
                const isOneWay = properties.oneway === 'yes' || properties.oneway === '1';
                
                this.graph.get(fromId).neighbors.set(toId, {
                    distance: distance,
                    properties: properties
                });
                
                if (!isOneWay) {
                    this.graph.get(toId).neighbors.set(fromId, {
                        distance: distance,
                        properties: properties
                    });
                }
            }
        });

        if (PATHFINDING_DEBUG) console.log(`Graph built with ${this.graph.size} nodes`);
    }

    /**
     * Generate a unique node ID from coordinates
     * @param {Array} coord - [longitude, latitude]
     * @returns {string}
     */
    getNodeId(coord) {
        // Round coordinates to avoid floating point precision issues
        const lng = Math.round(coord[0] * 1000000) / 1000000;
        const lat = Math.round(coord[1] * 1000000) / 1000000;
        return `${lng},${lat}`;
    }

    /**
     * Calculate distance between two coordinates using Haversine formula
     * @param {Array} coord1 - [longitude, latitude]
     * @param {Array} coord2 - [longitude, latitude]
     * @returns {number} Distance in meters
     */
    calculateDistance(coord1, coord2) {
        const R = 6371000; // Earth's radius in meters
        const lat1 = coord1[1] * Math.PI / 180;
        const lat2 = coord2[1] * Math.PI / 180;
        const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
        const deltaLng = (coord2[0] - coord1[0]) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Find the nearest node to given coordinates
     * @param {Array} targetCoord - [longitude, latitude]
     * @returns {string|null} Node ID of nearest node
     */
    findNearestNode(targetCoord) {
        let nearestNodeId = null;
        let minDistance = Infinity;

        for (const [nodeId, nodeData] of this.graph) {
            const distance = this.calculateDistance(targetCoord, nodeData.coordinates);
            if (distance < minDistance) {
                minDistance = distance;
                nearestNodeId = nodeId;
            }
        }

        return nearestNodeId;
    }

    /**
     * Find shortest path between two coordinates using Dijkstra's algorithm
     * @param {Array} startCoord - [longitude, latitude]
     * @param {Array} endCoord - [longitude, latitude]
     * @returns {Object} Path result with coordinates, distance, and route info
     */
    findPath(startCoord, endCoord) {
        if (!this.isLoaded || !this.graph) {
            throw new Error('Road network not loaded. Call loadRoadNetwork() first.');
        }

        // Find nearest nodes to start and end coordinates
        const startNodeId = this.findNearestNode(startCoord);
        const endNodeId = this.findNearestNode(endCoord);

        if (!startNodeId || !endNodeId) {
            throw new Error('Could not find suitable nodes near start or end coordinates');
        }

        if (PATHFINDING_DEBUG) console.log(`Finding path from node ${startNodeId} to ${endNodeId}`);

        // Dijkstra's algorithm
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();

        // Initialize distances
        for (const nodeId of this.graph.keys()) {
            distances.set(nodeId, Infinity);
            unvisited.add(nodeId);
        }
        distances.set(startNodeId, 0);

        while (unvisited.size > 0) {
            // Find unvisited node with minimum distance
            let currentNodeId = null;
            let minDistance = Infinity;
            
            for (const nodeId of unvisited) {
                if (distances.get(nodeId) < minDistance) {
                    minDistance = distances.get(nodeId);
                    currentNodeId = nodeId;
                }
            }

            if (currentNodeId === null || currentNodeId === endNodeId) {
                break;
            }

            unvisited.delete(currentNodeId);

            // Update distances to neighbors
            const currentNode = this.graph.get(currentNodeId);
            for (const [neighborId, edgeData] of currentNode.neighbors) {
                if (unvisited.has(neighborId)) {
                    const newDistance = distances.get(currentNodeId) + edgeData.distance;
                    if (newDistance < distances.get(neighborId)) {
                        distances.set(neighborId, newDistance);
                        previous.set(neighborId, currentNodeId);
                    }
                }
            }
        }

        // Reconstruct path
        const path = [];
        let currentNodeId = endNodeId;
        
        if (previous.get(currentNodeId) !== undefined || currentNodeId === startNodeId) {
            while (currentNodeId !== undefined) {
                const nodeData = this.graph.get(currentNodeId);
                path.unshift({
                    coordinates: nodeData.coordinates,
                    nodeId: currentNodeId
                });
                currentNodeId = previous.get(currentNodeId);
            }
        }

        if (path.length === 0) {
            throw new Error('No path found between the specified locations');
        }

        const totalDistance = distances.get(endNodeId);

        return {
            path: path,
            distance: totalDistance,
            startNode: startNodeId,
            endNode: endNodeId,
            success: true
        };
    }

    /**
     * Generate a cache key for a path between two locations
     * @param {Array} location1 - [longitude, latitude] of start point
     * @param {Array} location2 - [longitude, latitude] of end point
     * @returns {string} Cache key
     */
    generateCacheKey(location1, location2) {
        // Round coordinates to 6 decimal places (~0.1m precision) for cache key
        const precision = 6;
        const key1 = `${location1[0].toFixed(precision)},${location1[1].toFixed(precision)}`;
        const key2 = `${location2[0].toFixed(precision)},${location2[1].toFixed(precision)}`;
        // Always use the same key regardless of order (A->B = B->A)
        return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
    }

    /**
     * Main function to compute path between two locations
     * @param {Array} location1 - [longitude, latitude] of start location
     * @param {Array} location2 - [longitude, latitude] of end location
     * @returns {Promise<Object>} Path result
     */
    async computePath(location1, location2) {
        try {
            if (!this.isLoaded) {
                await this.loadRoadNetwork();
            }

            // Check cache first
            const cacheKey = this.generateCacheKey(location1, location2);
            if (this.pathCache.has(cacheKey)) {
                if (PATHFINDING_DEBUG) console.log(`Using cached path for key: ${cacheKey}`);
                return this.pathCache.get(cacheKey);
            }

            if (PATHFINDING_DEBUG) console.log(`Computing path from [${location1[0]}, ${location1[1]}] to [${location2[0]}, ${location2[1]}]`);
            
            const result = this.findPath(location1, location2);
            
            if (PATHFINDING_DEBUG) console.log(`Path found: ${result.path.length} waypoints, ${Math.round(result.distance)}m total distance`);
            
            // Cache the result
            this.pathCache.set(cacheKey, result);
            if (PATHFINDING_DEBUG) console.log(`Cached path with key: ${cacheKey}`);
            
            return result;
        } catch (error) {
            console.error('Error computing path:', error);
            const errorResult = {
                path: [],
                distance: 0,
                startNode: null,
                endNode: null,
                success: false,
                error: error.message
            };
            // Cache error results too to avoid retrying failed paths
            const cacheKey = this.generateCacheKey(location1, location2);
            this.pathCache.set(cacheKey, errorResult);
            return errorResult;
        }
    }

    /**
     * Clear the path cache
     */
    clearCache() {
        this.pathCache.clear();
        if (PATHFINDING_DEBUG) console.log('Path cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        return {
            size: this.pathCache.size,
            keys: Array.from(this.pathCache.keys())
        };
    }
}

// Create a global instance
const pathfinder = new PathfindingEngine();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PathfindingEngine, pathfinder };
}

// Make available globally
window.pathfinder = pathfinder;

/**
 * Example usage function - demonstrates how to use the pathfinding engine
 * You can call this from the browser console or integrate it into your application
 */
async function testPathfinding() {
    if (PATHFINDING_DEBUG) console.log('Testing pathfinding functionality...');
    
    try {
        // Example coordinates - you can replace these with any valid coordinates
        // These are roughly in the Rutgers area based on the GeoJSON data
        const startLocation = [-74.4383, 40.5009]; // Cleveland Avenue area
        const endLocation = [-74.4518, 40.5056];   // Truman Drive area
        
        if (PATHFINDING_DEBUG) console.log(`Finding path from [${startLocation[0]}, ${startLocation[1]}] to [${endLocation[0]}, ${endLocation[1]}]`);
        
        const result = await pathfinder.computePath(startLocation, endLocation);
        
        if (result.success) {
            if (PATHFINDING_DEBUG) {
                console.log('Path found successfully!');
                console.log(`Total distance: ${Math.round(result.distance)} meters`);
                console.log(`Number of waypoints: ${result.path.length}`);
                console.log('Path coordinates:', result.path.map(p => p.coordinates));
            }
            
            // You could also display this path on a map using Leaflet
            return result;
        } else {
            console.error('Pathfinding failed:', result.error);
            return null;
        }
    } catch (error) {
        console.error('Error in testPathfinding:', error);
        return null;
    }
}

/**
 * Function to display a pathfinding result on a Leaflet map
 * @param {Object} pathResult - Result from pathfinder.computePath()
 * @param {Object} map - Leaflet map instance
 * @param {Object} options - Display options (color, weight, etc.)
 */
function displayPathOnMap(pathResult, map, options = {}) {
    if (!pathResult || !pathResult.success || !map) {
        console.error('Invalid path result or map provided');
        return null;
    }

    const defaultOptions = {
        color: '#3388ff',
        weight: 5,
        opacity: 0.8,
        dashArray: null
    };

    const displayOptions = { ...defaultOptions, ...options };

    // Create polyline from path coordinates
    const coordinates = pathResult.path.map(point => point.coordinates);
    const polyline = L.polyline(coordinates, displayOptions);

    // Add to map
    polyline.addTo(map);

    // Add start and end markers
    const startMarker = L.marker(pathResult.path[0].coordinates)
        .addTo(map)
        .bindPopup('Start');
    
    const endMarker = L.marker(pathResult.path[pathResult.path.length - 1].coordinates)
        .addTo(map)
        .bindPopup(`End<br>Distance: ${Math.round(pathResult.distance)}m`);

    // Fit map to show the entire path
    map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

    return {
        polyline: polyline,
        startMarker: startMarker,
        endMarker: endMarker
    };
}

/**
 * Complete example: Find path and display on map
 * @param {Array} startCoord - [longitude, latitude]
 * @param {Array} endCoord - [longitude, latitude]
 * @param {Object} map - Leaflet map instance (optional)
 * @returns {Promise<Object>} Path result with map display objects
 */
async function findAndDisplayPath(startCoord, endCoord, map = null) {
    try {
        if (PATHFINDING_DEBUG) console.log(`Finding and displaying path from [${startCoord[0]}, ${startCoord[1]}] to [${endCoord[0]}, ${endCoord[1]}]`);
        
        const pathResult = await pathfinder.computePath(startCoord, endCoord);
        
        if (pathResult.success && map) {
            const mapDisplay = displayPathOnMap(pathResult, map);
            pathResult.mapDisplay = mapDisplay;
        }
        
        return pathResult;
    } catch (error) {
        console.error('Error in findAndDisplayPath:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Make functions available globally
window.testPathfinding = testPathfinding;
window.displayPathOnMap = displayPathOnMap;
window.findAndDisplayPath = findAndDisplayPath;

// Expose cache management functions globally
window.clearPathfindingCache = () => pathfinder.clearCache();
window.getPathfindingCacheStats = () => pathfinder.getCacheStats();
