const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("refToolDesktop", {
  isDesktop: true,
  platform: process.platform,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  registerMediaPath: (id, sourcePath) => ipcRenderer.invoke("media:register", { id, sourcePath }),
  saveProject: (projectJson, defaultName) => ipcRenderer.invoke("project:save", { projectJson, defaultName }),
  openProject: () => ipcRenderer.invoke("project:open"),
  saveFileCopy: (sourcePath, defaultName) => ipcRenderer.invoke("file:save-copy", { sourcePath, defaultName }),
});
