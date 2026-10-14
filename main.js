const { app, BrowserWindow, ipcMain, clipboard, shell } = require("electron");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { mouse, Button, keyboard, Key } = require("@nut-tree/nut-js");

const VERSION = "1.1.0";

function prepareNutBindings() {
  try {
    const destDir = path.join(os.tmpdir(), "nutjs");
    const destPath = path.join(destDir, "libnut.node");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const candidates = [];
    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, "native", "libnut.node"));
      candidates.push(path.join(path.dirname(process.execPath), "node_modules/@nut-tree/libnut-win32/build/Release/libnut.node"));
    } else {
      candidates.push(path.join(__dirname, "node_modules/@nut-tree/libnut-win32/build/Release/libnut.node"));
    }

    let copied = false;
    for (const srcPath of candidates) {
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        copied = true;
        break;
      }
    }
    if (copied || fs.existsSync(destPath)) process.env.LIBNUT_PATH = destPath;
  } catch (e) {
    console.error("Nut bindings error: " + e.message);
  }
}
prepareNutBindings();
mouse.config.mouseSpeed = 1500;

let state = {
  running: false,
  port: 3000,
  clients: 0,
  urls: [],
  qrDataUrl: null,
  lastEvent: null,
  lang: "uz",
};

const configPath = app.isPackaged
  ? path.join(app.getPath("userData"), "config.json")
  : path.join(__dirname, "config.json");

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (cfg.lang && ["uz", "en", "ru"].includes(cfg.lang)) state.lang = cfg.lang;
    }
  } catch (e) {}
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ lang: state.lang }, null, 2));
  } catch (e) {}
}
loadConfig();

function lanIPv4s() {
  const out = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === "IPv4" && !net.internal && !out.includes(net.address)) {
        out.push(net.address);
      }
    }
  }
  return out;
}

function clampNum(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

function refreshUrls() {
  const ips = lanIPv4s().sort((a, b) => {
    const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
    return rank(a) - rank(b);
  });
  state.urls = ips.length ? ips.map((ip) => `http://${ip}:${state.port}`) : [`http://localhost:${state.port}`];
  if (state.urls.length) {
    QRCode.toDataURL(state.urls[0], { margin: 1, width: 320, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        state.qrDataUrl = url;
        emitState();
      })
      .catch(() => {});
  }
  emitState();
}

let server = null;
let io = null;

function buildStaticExpress() {
  const app = express();
  const tmpRoot = path.join(os.tmpdir(), `mymouse-web-${process.pid}`);
  fs.mkdirSync(tmpRoot, { recursive: true });

  const assets = [
    { file: "index.html", snapshotPath: "index.html" },
    { file: "public/style.css", snapshotPath: "public/style.css" },
    { file: "public/script.js", snapshotPath: "public/script.js" },
    { file: "node_modules/socket.io/client-dist/socket.io.js", snapshotPath: "node_modules/socket.io/client-dist/socket.io.js" },
  ];

  for (const asset of assets) {
    try {
      const src = path.join(__dirname, asset.snapshotPath);
      const content = fs.readFileSync(src);
      const dest = path.join(tmpRoot, asset.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
    } catch (e) {
      console.warn(asset.file + " not copied: " + e.message);
    }
  }

  app.use("/public", express.static(path.join(tmpRoot, "public")));
  app.use("/socket.io", express.static(path.join(tmpRoot, "node_modules", "socket.io", "client-dist")));
  app.get("/", (req, res) => res.sendFile(path.join(tmpRoot, "index.html")));

  server = http.createServer(app);
  io = new Server(server, { cors: { origin: "*" } });
}

function wireSockets() {
  io.on("connection", (socket) => {
    state.clients++;
    pushEvent("connected");
    emitState();

    socket.on("move", async ({ dx, dy } = {}) => {
      try {
        const pos = await mouse.getPosition();
        const speed = 3;
        await mouse.setPosition({
          x: Math.round(pos.x + clampNum(dx, -300, 300) * speed),
          y: Math.round(pos.y + clampNum(dy, -300, 300) * speed),
        });
      } catch (e) {}
    });

    socket.on("scroll", async ({ dy } = {}) => {
      try {
        const amount = Math.ceil(Math.abs(clampNum(dy, -100, 100)));
        if (dy > 0) await mouse.scrollDown(amount);
        else if (dy < 0) await mouse.scrollUp(amount);
      } catch (e) {}
    });

    socket.on("click", async (btn) => {
      try {
        if (btn === "left") { await mouse.click(Button.LEFT); pushEvent("click", "left"); }
        else if (btn === "right") { await mouse.click(Button.RIGHT); pushEvent("click", "right"); }
        else if (btn === "middle") { await mouse.click(Button.MIDDLE); pushEvent("click", "middle"); }
      } catch (e) {}
    });

    socket.on("altTabStart", async () => {
      try {
        await keyboard.pressKey(Key.LeftAlt);
        await keyboard.pressKey(Key.Tab);
        await keyboard.releaseKey(Key.Tab);
      } catch (e) {}
    });

    socket.on("altTabNavigate", async ({ direction } = {}) => {
      try {
        if (direction === "next") {
          await keyboard.pressKey(Key.Tab);
          await keyboard.releaseKey(Key.Tab);
        } else if (direction === "prev") {
          await keyboard.pressKey(Key.LeftShift);
          await keyboard.pressKey(Key.Tab);
          await keyboard.releaseKey(Key.Tab);
          await keyboard.releaseKey(Key.LeftShift);
        }
      } catch (e) {}
    });

    socket.on("altTabEnd", async () => {
      try {
        await keyboard.releaseKey(Key.LeftAlt);
      } catch (e) {}
    });

    socket.on("disconnect", () => {
      state.clients = Math.max(0, state.clients - 1);
      pushEvent("disconnected");
      emitState();
    });
  });
}

function setPort(p) {
  state.running = false;
  if (server) {
    try { io.close(); server.close(); } catch (e) {}
  }
  server = null;
  io = null;
  state.port = p;
  state.clients = 0;
  emitState();
}

function emitState() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("state", {
        ...state,
        wifi: lanIPv4s().length > 0,
      });
    }
  }
}

function pushEvent(type, detail) {
  state.lastEvent = { type, detail: detail || null, ts: Date.now() };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("event", state.lastEvent);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 560,
    minHeight: 520,
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "gui", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "gui", "index.html"));
  return win;
}

app.whenReady().then(() => {
  createWindow();
  refreshUrls();
  emitState();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  try { io && io.close(); } catch (e) {}
  try { server && server.close(); } catch (e) {}
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("start", async (_e, port) => {
  try {
    setPort(Number(port) || 3000);
    buildStaticExpress();
    wireSockets();
    await new Promise((resolve, reject) => {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") reject(new Error("PORT_IN_USE"));
        else reject(err);
      });
      server.listen(state.port, "0.0.0.0", () => resolve());
    });
    state.running = true;
    refreshUrls();
    pushEvent("started");
    emitState();
    return { ok: true };
  } catch (e) {
    if (e.message === "PORT_IN_USE") return { ok: false, error: "port" };
    return { ok: false, error: "generic", detail: e.message };
  }
});

ipcMain.handle("stop", () => {
  state.running = false;
  state.clients = 0;
  try { io && io.close(); } catch (e) {}
  try { server && server.close(); } catch (e) {}
  server = null;
  io = null;
  pushEvent("stopped");
  emitState();
  return { ok: true };
});

ipcMain.handle("get-state", () => ({ ...state, wifi: lanIPv4s().length > 0 }));

ipcMain.handle("set-lang", (_e, lang) => {
  if (["uz", "en", "ru"].includes(lang)) {
    state.lang = lang;
    saveConfig();
  }
  return state.lang;
});

ipcMain.handle("copy", (_e, text) => {
  clipboard.writeText(text || "");
  return true;
});

ipcMain.handle("open-external", (_e, url) => {
  if (url) shell.openExternal(url);
  return true;
});
