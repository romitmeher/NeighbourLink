const path = require("node:path");
const { app, BrowserWindow, dialog, session } = require("electron");
const { sharedSite, sameSite } = require("./policy.cjs");
const defaults = require("./config.json");

app.enableSandbox();
let window;
let site;

async function loadSite() {
  while (window && !window.isDestroyed()) {
    try {
      await window.loadURL(site.href);
      return;
    } catch {
      if (!window || window.isDestroyed()) return;
      const { response } = await dialog.showMessageBox(window, {
        type: "warning", buttons: ["Retry", "Close"], cancelId: 1,
        message: "NeighbourLink could not reach the shared server.",
        detail: "Check your connection and the server address " + site.origin
      });
      if (response === 1) { window.close(); return; }
    }
  }
}

function openWindow() {
  window = new BrowserWindow({
    width: 1200, height: 820, minWidth: 460, minHeight: 540,
    title: "NeighbourLink", autoHideMenuBar: true,
    webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false, webSecurity: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!sameSite(url, site.origin)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && !sameSite(url, site.origin)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("closed", () => { window = null; });
  void loadSite();
}

app.whenReady().then(() => {
  try {
    site = sharedSite(process.env.NEIGHBOURLINK_URL || defaults.url);
  } catch (err) {
    dialog.showErrorBox("Invalid NeighbourLink server", err.message);
    app.quit();
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  openWindow();
  app.on("activate", () => { if (!window) openWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
