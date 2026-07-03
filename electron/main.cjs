const { app, BrowserWindow, Menu, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = Boolean(process.env.ELECTRON_START_URL);
const scheme = "ref-tool";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function getOutDir() {
  return app.isPackaged
    ? path.join(app.getAppPath(), "out")
    : path.join(__dirname, "..", "out");
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function resolveStaticFile(url) {
  const outDir = getOutDir();
  const requestUrl = new URL(url);
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === "/" || pathname === "") pathname = "/index.html";
  let filePath = path.normalize(path.join(outDir, pathname));
  const relativePath = path.relative(outDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    filePath = path.join(outDir, "index.html");
  }

  if (!(await fileExists(filePath))) {
    filePath = path.join(outDir, "index.html");
  }

  return filePath;
}

async function registerStaticProtocol() {
  protocol.handle(scheme, async (request) => {
    const filePath = await resolveStaticFile(request.url);
    const body = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    return new Response(body, {
      headers: {
        "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
      },
    });
  });
}

function createMenu(window) {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open GitHub Repository",
          click: () => shell.openExternal("https://github.com/jiaweichenvfx-pixel/ref_tool"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#2b2b2f",
    title: "Ref Tool",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  createMenu(window);
  window.webContents.on("will-navigate", (event, url) => {
    const allowedUrl = isDev
      ? process.env.ELECTRON_START_URL
      : `${scheme}://app/`;

    if (!url.startsWith(allowedUrl)) {
      event.preventDefault();
    }
  });
  window.once("ready-to-show", () => window.show());

  if (isDev) {
    await window.loadURL(process.env.ELECTRON_START_URL);
  } else {
    await window.loadURL(`${scheme}://app/`);
  }
}

app.whenReady().then(async () => {
  if (!isDev) await registerStaticProtocol();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
