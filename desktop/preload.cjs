const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("neighbourLinkDesktop", { isDesktop: true });
