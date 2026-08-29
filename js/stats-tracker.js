// js/stats-tracker.js - device-local user action tracking, backed by IndexedDB.
// Captures only visits, bus views, stop views, and building taps. Data never
// leaves the device. Wraps window.sa_event so Simple Analytics keeps working.
const LocalStats = (function() {
    if (typeof window.indexedDB === 'undefined') {
        throw new Error('[stats] indexedDB required but unavailable');
    }
    if (typeof window.sa_event !== 'function') {
        throw new Error('[stats] window.sa_event missing before wrap');
    }
    const DB_NAME = 'rubus_analytics';
    const DB_VERSION = 1;
    const TRACKED_EVENTS = new Set(['load', 'view_bus', 'view_stop', 'building_tap']);
    const RETENTION_DAYS = 90;
    const FLUSH_INTERVAL_MS = 5000;
    const FLUSH_BATCH = 50;

    let db = null;
    let pending = [];
    let flushTimer = null;
    let realSaEvent = null;
    let localSaEvent = null;

    function easternDay(ts) {
        try {
            const s = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(ts).toISOString().slice(0, 10);
        } catch (e) {
            return new Date(ts).toISOString().slice(0, 10);
        }
    }

    function getBucket(ev) {
        const p = ev.props || {};
        switch (ev.name) {
            case 'view_bus': return String(p.route || '');
            case 'view_stop': return String(p.stop_name || '');
            case 'building_tap': return String(p.building || '');
            default: return '';
        }
    }

    function makeUid() {
        return 'rubus-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function openDB() {
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                const d = e.target.result;
                if (!d.objectStoreNames.contains('events')) {
                    const events = d.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
                    events.createIndex('ts', 'ts');
                    events.createIndex('name', 'name');
                    events.createIndex('day', 'day');
                    events.createIndex('name_ts', ['name', 'ts']);
                }
                if (!d.objectStoreNames.contains('daily')) {
                    d.createObjectStore('daily', { keyPath: ['name', 'day', 'bucket'] });
                }
                if (!d.objectStoreNames.contains('meta')) {
                    d.createObjectStore('meta', { keyPath: 'key' });
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    }

    function ensureMeta() {
        if (!db) return;
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        store.get('install').onsuccess = function(e) {
            if (!e.target.result) store.add({ key: 'install', value: Date.now() });
        };
        store.get('uid').onsuccess = function(e) {
            if (!e.target.result) store.add({ key: 'uid', value: makeUid() });
        };
        store.get('retentionDays').onsuccess = function(e) {
            if (!e.target.result) store.add({ key: 'retentionDays', value: RETENTION_DAYS });
        };
    }

    function pruneOldEvents() {
        if (!db) return;
        const cutoff = Date.now() - RETENTION_DAYS * 86400000;
        const cutoffDay = easternDay(cutoff);
        const tx = db.transaction('events', 'readwrite');
        const store = tx.objectStore('events');
        const dayIndex = store.index('day');
        dayIndex.openCursor(IDBKeyRange.upperBound(cutoffDay)).onsuccess = function(e) {
            const cursor = e.target.result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
    }

    function flush() {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        if (!pending.length) return;
        const batch = pending;
        pending = [];
        if (!db) {
            pending = batch.concat(pending);
            scheduleFlush();
            return;
        }
        let tx;
        try {
            tx = db.transaction(['events', 'daily'], 'readwrite');
        } catch (e) {
            pending = batch.concat(pending);
            scheduleFlush();
            return;
        }
        const eventsStore = tx.objectStore('events');
        const dailyStore = tx.objectStore('daily');
        const bumps = {};
        batch.forEach(function(ev) {
            eventsStore.add({ name: ev.name, ts: ev.ts, day: ev.day, props: ev.props });
            const bucket = getBucket(ev);
            const key = ev.name + '\u0000' + ev.day + '\u0000' + bucket;
            if (!bumps[key]) {
                bumps[key] = { name: ev.name, day: ev.day, bucket: bucket, count: 0, lastTs: 0 };
            }
            bumps[key].count++;
            bumps[key].lastTs = Math.max(bumps[key].lastTs, ev.ts);
        });
        Object.keys(bumps).forEach(function(keyStr) {
            const bump = bumps[keyStr];
            const req = dailyStore.get([bump.name, bump.day, bump.bucket]);
            req.onsuccess = function(e) {
                const existing = e.target.result;
                if (existing) {
                    existing.count += bump.count;
                    existing.lastTs = Math.max(existing.lastTs, bump.lastTs);
                    dailyStore.put(existing);
                } else {
                    dailyStore.add({ name: bump.name, day: bump.day, bucket: bump.bucket, count: bump.count, lastTs: bump.lastTs });
                }
            };
        });
        let done = false;
        let requeued = false;
        function requeue() {
            if (requeued || done) return;
            requeued = true;
            pending = batch.concat(pending);
            scheduleFlush();
        }
        tx.oncomplete = function() { done = true; };
        tx.onerror = requeue;
        tx.onabort = requeue;
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(function() { flushTimer = null; flush(); }, FLUSH_INTERVAL_MS);
    }

    function track(name, props) {
        if (!TRACKED_EVENTS.has(name)) return;
        const ts = Date.now();
        pending.push({ name: name, ts: ts, day: easternDay(ts), props: props || {} });
        if (pending.length >= FLUSH_BATCH) {
            flush();
        } else {
            scheduleFlush();
        }
    }

    function getDailyStats(opts) {
        opts = opts || {};
        const names = opts.names || Array.from(TRACKED_EVENTS);
        const startDay = opts.startDay || easternDay(0);
        const endDay = opts.endDay || easternDay(Date.now());
        return new Promise(function(resolve, reject) {
            if (!db) {
                reject(new Error('stats db not ready'));
                return;
            }
            const tx = db.transaction('daily', 'readonly');
            const store = tx.objectStore('daily');
            const out = [];
            store.openCursor().onsuccess = function(e) {
                const cursor = e.target.result;
                if (cursor) {
                    const r = cursor.value;
                    if (names.indexOf(r.name) >= 0 && r.day >= startDay && r.day <= endDay) {
                        out.push(r);
                    }
                    cursor.continue();
                } else {
                    resolve(out);
                }
            };
            tx.onerror = function() { reject(tx.error); };
        });
    }

    function rewrapSaEvent() {
        if (!localSaEvent) return;
        const current = window.sa_event;
        if (typeof current === 'function' && current !== localSaEvent) {
            realSaEvent = current;
            window.sa_event = localSaEvent;
        }
    }

    function wrapSaEvent() {
        realSaEvent = window.sa_event || function() {};
        localSaEvent = function(name, props) {
            track(name, props);
            if (typeof realSaEvent === 'function') {
                return realSaEvent(name, props);
            }
        };
        window.sa_event = localSaEvent;
    }

    async function init() {
        let persisted = false;
        try {
            if (navigator.storage && navigator.storage.persist) {
                persisted = await navigator.storage.persist();
            }
        } catch (e) {
            persisted = false;
        }
        if (!persisted && navigator.storage && navigator.storage.persisted) {
            try { persisted = await navigator.storage.persisted(); } catch (e) {}
        }
        if (!persisted) {
            console.warn('[stats] storage NOT persisted; may be evicted (e.g. iOS 7-day cap)');
        }
        try {
            db = await openDB();
            db.onversionchange = function() { db.close(); db = null; };
            ensureMeta();
            pruneOldEvents();
        } catch (e) {
            db = null;
            console.error('[stats] IndexedDB unavailable; stats not persisted', e);
        }
        wrapSaEvent();
        if (db) scheduleFlush();
        window.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') flush();
        });
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
    }

    init();

    return {
        track: track,
        getDailyStats: getDailyStats,
        flush: flush,
        rewrapSaEvent: rewrapSaEvent
    };
})();
