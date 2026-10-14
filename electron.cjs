const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
app.whenReady().then(() => {
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save artwork', defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });
  const open = () => {
    const window = new BrowserWindow({ width: 1440, height: 940, minWidth: 850, minHeight: 620, backgroundColor: '#191b20', autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadFile(path.join(__dirname, 'app/index.html'));
  };
  open();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
