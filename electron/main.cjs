const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require("electron");
const { createReadStream } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = Boolean(process.env.ELECTRON_START_URL);
const scheme = "ref-tool";
const mediaScheme = "ref-media";
const mediaPaths = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function parseRangeHeader(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

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
  {
    scheme: mediaScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
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

  protocol.handle(mediaScheme, async (request) => {
    const requestUrl = new URL(request.url);
    const id = decodeURIComponent(requestUrl.hostname || requestUrl.pathname.replace(/^\//, ""));
    const sourcePath = mediaPaths.get(id);

    if (!sourcePath) return new Response("Media path is not registered", { status: 404 });

    try {
      const stats = await fs.stat(sourcePath);
      if (!stats.isFile()) return new Response("Media path is not a file", { status: 404 });
      const extension = path.extname(sourcePath).toLowerCase();
      const contentType = MIME_TYPES[extension] ?? "application/octet-stream";
      const range = parseRangeHeader(request.headers.get("range"), stats.size);

      if (range) {
        const stream = createReadStream(sourcePath, { start: range.start, end: range.end });
        return new Response(stream, {
          status: 206,
          headers: {
            "accept-ranges": "bytes",
            "content-length": String(range.end - range.start + 1),
            "content-range": `bytes ${range.start}-${range.end}/${stats.size}`,
            "content-type": contentType,
          },
        });
      }

      const stream = createReadStream(sourcePath);

      return new Response(stream, {
        headers: {
          "accept-ranges": "bytes",
          "content-length": String(stats.size),
          "content-type": contentType,
        },
      });
    } catch {
      return new Response("Media file is missing", { status: 404 });
    }
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeProjectPayload(value) {
  if (!isPlainObject(value)) return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.groups)) return null;
  return {
    ...value,
    version: Number.isFinite(value.version) ? value.version : 2,
    savedAt: Number.isFinite(value.savedAt) ? value.savedAt : Date.now(),
  };
}

function registerDesktopIpc() {
  ipcMain.handle("media:register", async (_event, payload) => {
    const id = typeof payload?.id === "string" ? payload.id : "";
    const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath : "";
    if (!id || !sourcePath) return { ok: false, missing: true };

    try {
      const stats = await fs.stat(sourcePath);
      if (!stats.isFile()) return { ok: false, missing: true };
      mediaPaths.set(id, sourcePath);
      return {
        ok: true,
        url: `${mediaScheme}://${encodeURIComponent(id)}`,
        size: stats.size,
        lastModified: stats.mtimeMs,
      };
    } catch {
      mediaPaths.delete(id);
      return { ok: false, missing: true };
    }
  });

  ipcMain.handle("project:save", async (event, payload) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const defaultName = typeof payload?.defaultName === "string" ? payload.defaultName : "Untitled.reftool";
    const project = sanitizeProjectPayload(payload?.projectJson);
    if (!project) return { ok: false, canceled: false, error: "Invalid project data" };

    const result = await dialog.showSaveDialog(owner ?? undefined, {
      title: "Save Ref Tool Project",
      defaultPath: defaultName.endsWith(".reftool") ? defaultName : `${defaultName}.reftool`,
      filters: [
        { name: "Ref Tool Project", extensions: ["reftool"] },
        { name: "JSON", extensions: ["json"] },
      ],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    await fs.writeFile(result.filePath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle("project:open", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner ?? undefined, {
      title: "Open Ref Tool Project",
      properties: ["openFile"],
      filters: [
        { name: "Ref Tool Project", extensions: ["reftool", "json"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };

    const filePath = result.filePaths[0];
    try {
      const data = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(data);
      const project = sanitizeProjectPayload(parsed);
      if (!project) return { ok: false, canceled: false, error: "Invalid project file" };
      return { ok: true, path: filePath, project };
    } catch (error) {
      return { ok: false, canceled: false, error: error instanceof Error ? error.message : "Unable to open project" };
    }
  });

  ipcMain.handle("file:save-copy", async (event, payload) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath : "";
    const defaultName = typeof payload?.defaultName === "string" ? payload.defaultName : path.basename(sourcePath);
    if (!sourcePath) return { ok: false, canceled: false, error: "Missing source path" };

    try {
      const stats = await fs.stat(sourcePath);
      if (!stats.isFile()) return { ok: false, canceled: false, error: "Source is not a file" };
    } catch {
      return { ok: false, canceled: false, error: "Source file is missing" };
    }

    const result = await dialog.showSaveDialog(owner ?? undefined, {
      title: "Save File As",
      defaultPath: defaultName || path.basename(sourcePath),
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    await fs.copyFile(sourcePath, result.filePath);
    return { ok: true, path: result.filePath };
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
  await registerStaticProtocol();
  registerDesktopIpc();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
