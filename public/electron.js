const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const os = require('os');

let mainWindow;

// Set custom app data path to avoid permission issues
const appDataPath = path.join(os.homedir(), '.app-achatrevente');
app.setPath('userData', appDataPath);

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  console.log('Loading URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  // Handle loading errors with retry
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load: ${errorDescription} (${errorCode})`);
    if (isDev) {
      setTimeout(() => {
        console.log('Retrying to load...');
        mainWindow.loadURL(startUrl);
      }, 2000);
    }
  });

  // Log console messages
  mainWindow.webContents.on('console-message', (level, message, line, sourceId) => {
    if (isDev) {
      console.log(`[Renderer Console] ${message}`);
    }
  });

  // Open dev tools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// App event handlers
app.on('ready', () => {
  console.log('App ready, creating window...');
  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('App quitting...');
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Create application menu
const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { 
          label: 'Reload', 
          accelerator: 'CmdOrCtrl+R', 
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        { 
          label: 'Zoom In', 
          accelerator: 'CmdOrCtrl+Plus', 
          click: () => {
            if (mainWindow) mainWindow.webContents.zoomFactor += 0.1;
          }
        },
        { 
          label: 'Zoom Out', 
          accelerator: 'CmdOrCtrl+Minus', 
          click: () => {
            if (mainWindow) mainWindow.webContents.zoomFactor -= 0.1;
          }
        },
        { 
          label: 'Reset Zoom', 
          accelerator: 'CmdOrCtrl+0', 
          click: () => {
            if (mainWindow) mainWindow.webContents.zoomFactor = 1;
          }
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};
