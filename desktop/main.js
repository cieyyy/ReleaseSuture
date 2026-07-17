import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
} from 'electron';
import { runDesktopScan } from './service.js';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererPath = path.join(desktopDirectory, 'index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
let mainWindow = null;

app.enableSandbox();
app.commandLine.appendSwitch('disable-http-cache');

function isTrustedSender(event) {
  return event.senderFrame?.url === rendererUrl;
}

function trustedHandler(handler) {
  return async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('已拒绝来自非本地界面的请求');
    return handler(...args);
  };
}

function suggestedOutput(casePath) {
  return path.join(path.dirname(casePath), `${path.basename(casePath)}-release-suture-report`);
}

function registerIpc() {
  ipcMain.handle('desktop:select-case', trustedHandler(async () => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: '选择本地脱敏证据目录',
      buttonLabel: '选择证据目录',
      properties: ['openDirectory', 'dontAddToRecent'],
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;
    const casePath = selection.filePaths[0];
    return { casePath, suggestedOutputPath: suggestedOutput(casePath) };
  }));

  ipcMain.handle('desktop:select-output', trustedHandler(async (defaultPath) => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: '选择本地报告目录',
      buttonLabel: '选择报告目录',
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;
    return selection.filePaths[0];
  }));

  ipcMain.handle('desktop:run-scan', trustedHandler(async (payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('扫描参数无效');
    return runDesktopScan({ casePath: payload.casePath, outputPath: payload.outputPath });
  }));
}

function lockDownSession(window) {
  const currentSession = window.webContents.session;
  currentSession.setPermissionCheckHandler(() => false);
  currentSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  currentSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('file://') });
  });

  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0a0f1c',
    icon: path.join(desktopDirectory, '..', 'assets', 'release-suture.ico'),
    title: 'ReleaseSuture · 离线发布体检台',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(desktopDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
    },
  });

  lockDownSession(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(rendererPath).catch((error) => {
    dialog.showErrorBox('ReleaseSuture 启动失败', `本地界面无法加载：${error.message}`);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
