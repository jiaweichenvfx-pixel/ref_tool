const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("refToolDesktop", {
  isDesktop: true,
  platform: process.platform,
});
