const EventEmitter = require('events');

class IdleDetector extends EventEmitter {
    constructor(powerMonitor) {
        super();
        this.powerMonitor = powerMonitor;
        this.pollInterval = null;
        this.idleThreshold = 300; // 5 minutes default
        this.isIdle = false;
        this.startPolling();
    }

    setThreshold(minutes) {
        this.idleThreshold = minutes * 60;
    }

    startPolling() {
        this.pollInterval = setInterval(() => {
            const idleTime = this.powerMonitor.getSystemIdleTime();

            if (!this.isIdle && idleTime >= this.idleThreshold) {
                this.isIdle = true;
                this.emit('idle', idleTime);
            } else if (this.isIdle && idleTime < 5) {
                this.isIdle = false;
                this.emit('active');
            }
        }, 15000); // Check every 15 seconds
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}

module.exports = IdleDetector;
