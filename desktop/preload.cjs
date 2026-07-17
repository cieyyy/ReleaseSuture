const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('releaseSutureDesktop', Object.freeze({
  selectCase: () => ipcRenderer.invoke('desktop:select-case'),
  selectOutput: (defaultPath) => ipcRenderer.invoke('desktop:select-output', defaultPath),
  runScan: (payload) => ipcRenderer.invoke('desktop:run-scan', {
    casePath: payload?.casePath,
    outputPath: payload?.outputPath,
  }),
}));
