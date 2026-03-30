const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ttApi', {
    // Store
    getStore: (key) => ipcRenderer.invoke('get-store', key),
    setStore: (key, val) => ipcRenderer.invoke('set-store', key, val),

    // Auth
    login: (serverUrl, email, password) => ipcRenderer.invoke('login', serverUrl, email, password),
    logout: () => ipcRenderer.invoke('logout'),

    // Timer
    getStatus: () => ipcRenderer.invoke('get-status'),
    getProjects: () => ipcRenderer.invoke('get-projects'),
    startTimer: (projectId, description) => ipcRenderer.invoke('start-timer', projectId, description),
    stopTimer: () => ipcRenderer.invoke('stop-timer'),

    // Server
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),

    // Window controls
    closeWindow: () => ipcRenderer.invoke('close-window'),
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),

    // Screenshot test
    testScreenshot: () => ipcRenderer.invoke('test-screenshot'),

    // Events from main process
    onTimerTick: (callback) => ipcRenderer.on('timer-tick', (_, elapsed) => callback(elapsed)),
    onTimerUpdate: (callback) => ipcRenderer.on('timer-update', (_, data) => callback(data)),
    onScreenshotCaptured: (callback) => ipcRenderer.on('screenshot-captured', () => callback()),
    onIdleDetected: (callback) => ipcRenderer.on('idle-detected', (_, seconds) => callback(seconds)),

    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
