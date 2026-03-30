const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, Notification, powerMonitor, screen, systemPreferences } = require('electron');
const path = require('path');
const Store = require('electron-store');
const ApiClient = require('./src/api-client');
const ScreenshotCapture = require('./src/screenshot');
const TimerManager = require('./src/timer');
const IdleDetector = require('./src/idle-detector');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

const store = new Store({
    defaults: {
        serverUrl: 'http://localhost:3847',
        token: null,
        user: null,
        minimizeToTray: true,
        launchMinimized: false
    }
});

let mainWindow = null;
let loginWindow = null;
let tray = null;
let api = null;
let screenshotCapture = null;
let timerManager = null;
let idleDetector = null;
let isQuitting = false;

// ── Create Login Window ──
function createLoginWindow() {
    if (loginWindow) { loginWindow.focus(); return; }

    loginWindow = new BrowserWindow({
        width: 420,
        height: 520,
        resizable: false,
        frame: false,
        transparent: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    loginWindow.loadFile('renderer/login.html');
    loginWindow.on('closed', () => { loginWindow = null; });
}

// ── Create Main Widget Window ──
function createMainWindow() {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); return; }

    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workAreaSize;

    mainWindow = new BrowserWindow({
        width: 380,
        height: 480,
        x: screenW - 400,
        y: screenH - 520,
        resizable: true,
        frame: false,
        transparent: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('renderer/index.html');

    mainWindow.on('close', (e) => {
        if (!isQuitting && store.get('minimizeToTray')) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── System Tray ──
function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    let trayIcon;
    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) throw new Error('empty');
    } catch {
        // Create a simple colored icon if file doesn't exist
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon.isEmpty() ? createDefaultTrayIcon() : trayIcon);
    tray.setToolTip('Epoch Dash');
    updateTrayMenu();

    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
}

function createDefaultTrayIcon() {
    // Create a 16x16 icon programmatically
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const x = i % size, y = Math.floor(i / size);
        const cx = size/2, cy = size/2, r = 6;
        const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
        if (dist <= r) {
            canvas[i*4] = 0;     // R
            canvas[i*4+1] = 212; // G
            canvas[i*4+2] = 255; // B
            canvas[i*4+3] = 255; // A
        }
    }
    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu(isRunning = false, elapsed = '') {
    const template = [];

    if (isRunning) {
        template.push({ label: `⏱ ${elapsed || 'Running...'}`, enabled: false });
        template.push({ label: '⏹ Stop Timer', click: () => stopTimerFromTray() });
    } else {
        template.push({ label: '▶ Start Timer', click: () => startTimerFromTray() });
    }

    template.push({ type: 'separator' });
    template.push({ label: '🌐 Open Dashboard', click: () => {
        const serverUrl = store.get('serverUrl');
        require('electron').shell.openExternal(serverUrl);
    }});
    template.push({ label: '📊 Show Widget', click: () => {
        if (mainWindow) mainWindow.show();
        else createMainWindow();
    }});
    template.push({ type: 'separator' });
    template.push({ label: '⚙ Server: ' + store.get('serverUrl'), enabled: false });
    template.push({ type: 'separator' });
    template.push({ label: 'Quit', click: () => {
        isQuitting = true;
        app.quit();
    }});

    const menu = Menu.buildFromTemplate(template);
    tray.setContextMenu(menu);
    tray.setToolTip(isRunning ? `Epoch Dash - ${elapsed}` : 'Epoch Dash');
}

// ── Timer Control from Tray ──
async function startTimerFromTray() {
    if (!api || !api.token) return;
    try {
        await timerManager.start();
        updateTrayMenu(true);
        if (mainWindow) mainWindow.webContents.send('timer-update', { running: true });
    } catch(e) {
        console.error('Start timer error:', e);
    }
}

async function stopTimerFromTray() {
    if (!api || !api.token) return;
    try {
        await timerManager.stop();
        screenshotCapture.stop();
        updateTrayMenu(false);
        if (mainWindow) mainWindow.webContents.send('timer-update', { running: false });
    } catch(e) {
        console.error('Stop timer error:', e);
    }
}

// ── IPC Handlers ──
function setupIPC() {
    ipcMain.handle('get-store', (_, key) => store.get(key));
    ipcMain.handle('set-store', (_, key, value) => { store.set(key, value); return true; });

    ipcMain.handle('login', async (_, serverUrl, email, password) => {
        try {
            store.set('serverUrl', serverUrl);
            api = new ApiClient(serverUrl);
            const data = await api.login(email, password);
            store.set('token', data.token);
            store.set('user', data.user);
            api.token = data.token;

            // Initialize managers
            initManagers();

            // Close login, open main
            if (loginWindow) loginWindow.close();
            createMainWindow();

            return { success: true, user: data.user };
        } catch(e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('logout', () => {
        store.delete('token');
        store.delete('user');
        if (timerManager) timerManager.stop();
        if (screenshotCapture) screenshotCapture.stop();
        if (mainWindow) mainWindow.close();
        createLoginWindow();
        return true;
    });

    ipcMain.handle('get-status', async () => {
        if (!api || !api.token) return { running: null, settings: {} };
        try {
            return await api.get('/timer/status');
        } catch(e) {
            return { running: null, settings: {} };
        }
    });

    ipcMain.handle('get-projects', async () => {
        if (!api || !api.token) return [];
        try { return await api.get('/projects'); } catch { return []; }
    });

    ipcMain.handle('start-timer', async (_, projectId, description) => {
        try {
            const data = await api.post('/timer/start', {
                project_id: projectId || null,
                description: description || ''
            });
            timerManager.setRunning(data.entry, data.settings);

            // Start screenshot capture based on settings
            if (data.settings.screenshots_enabled === 'true') {
                const interval = parseInt(data.settings.screenshot_interval || '5') * 60 * 1000;
                screenshotCapture.start(interval, data.entry.id, data.settings);
            }

            updateTrayMenu(true);
            return { success: true, entry: data.entry };
        } catch(e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('stop-timer', async () => {
        try {
            const data = await api.post('/timer/stop');
            timerManager.clear();
            screenshotCapture.stop();
            updateTrayMenu(false);
            return { success: true, data };
        } catch(e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-server-url', () => store.get('serverUrl'));

    ipcMain.handle('close-window', () => {
        if (mainWindow) mainWindow.hide();
    });

    ipcMain.handle('minimize-window', () => {
        if (mainWindow) mainWindow.minimize();
    });

    // Manual screenshot test — capture one screenshot immediately
    ipcMain.handle('test-screenshot', async () => {
        if (!screenshotCapture) return { success: false, error: 'Not initialized' };
        try {
            await screenshotCapture.capture();
            return { success: true };
        } catch(e) {
            return { success: false, error: e.message };
        }
    });
}

// ── Initialize Managers ──
function initManagers() {
    const serverUrl = store.get('serverUrl');
    const token = store.get('token');

    if (!api) api = new ApiClient(serverUrl);
    api.token = token;

    timerManager = new TimerManager();
    screenshotCapture = new ScreenshotCapture(api);
    idleDetector = new IdleDetector(powerMonitor);

    // Tray timer update
    timerManager.on('tick', (elapsed) => {
        updateTrayMenu(true, elapsed);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('timer-tick', elapsed);
        }
    });

    // Idle detection
    idleDetector.on('idle', (idleSeconds) => {
        if (timerManager.isRunning) {
            screenshotCapture.pause();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('idle-detected', idleSeconds);
            }
        }
    });

    idleDetector.on('active', () => {
        if (timerManager.isRunning) {
            screenshotCapture.resume();
        }
    });

    // Screenshot notification with size info
    screenshotCapture.on('captured', (info) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('screenshot-captured', info);
        }
        // Show desktop notification if enabled
        const user = store.get('user');
        if (info) {
            console.log(`📸 Full desktop captured: ${info.width}×${info.height} (${info.sizeKB}KB)`);
        }
    });

    // Handle permission requests (macOS)
    screenshotCapture.on('permission-needed', (type) => {
        if (type === 'screen-recording') {
            dialog.showMessageBox(mainWindow || loginWindow, {
                type: 'warning',
                title: 'Screen Recording Permission Needed',
                message: 'Epoch Dash needs Screen Recording permission to capture desktop screenshots.',
                detail: 'Go to System Preferences → Security & Privacy → Privacy → Screen Recording, and enable Epoch Dash. Then restart the app.',
                buttons: ['OK']
            });
        }
    });

    // Check for running timer
    checkRunningTimer();
}

async function checkRunningTimer() {
    try {
        const status = await api.get('/timer/status');
        if (status.running) {
            timerManager.setRunning(status.running, status.settings);
            if (status.settings.screenshots_enabled === 'true') {
                const interval = parseInt(status.settings.screenshot_interval || '5') * 60 * 1000;
                screenshotCapture.start(interval, status.running.id, status.settings);
            }
            updateTrayMenu(true);
        }
    } catch(e) {
        console.error('Check timer error:', e);
    }
}

// ── App Lifecycle ──
app.whenReady().then(() => {
    // macOS: Check screen recording permission
    if (process.platform === 'darwin') {
        const hasAccess = systemPreferences.getMediaAccessStatus('screen');
        if (hasAccess !== 'granted') {
            console.warn('⚠️ Screen Recording permission not granted. Screenshots will be empty.');
            console.warn('  Go to: System Preferences → Security & Privacy → Privacy → Screen Recording');
        }
    }

    setupIPC();
    createTray();

    const token = store.get('token');
    if (token) {
        api = new ApiClient(store.get('serverUrl'));
        api.token = token;
        initManagers();
        if (!store.get('launchMinimized')) {
            createMainWindow();
        }
    } else {
        createLoginWindow();
    }
});

app.on('window-all-closed', () => {
    // Don't quit — keep running in tray
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('activate', () => {
    if (!mainWindow && store.get('token')) {
        createMainWindow();
    }
});

// Second instance — show existing window
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});
