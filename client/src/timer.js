const EventEmitter = require('events');

class TimerManager extends EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.startTime = null;
        this.entry = null;
        this.settings = {};
        this.tickInterval = null;
    }

    setRunning(entry, settings) {
        this.isRunning = true;
        this.entry = entry;
        this.startTime = new Date(entry.start_time);
        this.settings = settings || {};
        this.startTick();
    }

    start() {
        // Actual API call is done in main.js IPC handler
        this.isRunning = true;
    }

    stop() {
        this.clear();
    }

    clear() {
        this.isRunning = false;
        this.startTime = null;
        this.entry = null;
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    startTick() {
        if (this.tickInterval) clearInterval(this.tickInterval);
        this.tickInterval = setInterval(() => {
            if (!this.startTime) return;
            const elapsed = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
            const h = Math.floor(elapsed / 3600);
            const m = Math.floor((elapsed % 3600) / 60);
            const s = elapsed % 60;
            const formatted = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            this.emit('tick', formatted);
        }, 1000);
    }

    getElapsed() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
}

module.exports = TimerManager;
