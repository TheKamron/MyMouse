const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode-terminal");

const VERSION = "1.1.0";
const isPkg = typeof process.pkg !== "undefined";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const paint = (color, text) => `${c[color]}${text}${c.reset}`;

function setStatus(text) {
  process.stdout.write(`\r\x1b[2K   ${text}`);
}

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

function prepareNutBindings() {
  try {
    const destDir = path.join(os.tmpdir(), "nutjs");
    const destPath = path.join(destDir, "libnut.node");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;
    const srcPath = path.join(baseDir, "node_modules/@nut-tree/libnut-win32/build/Release/libnut.node");

    if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, destPath);
    process.env.LIBNUT_PATH = destPath;
  } catch (e) {
    console.error(paint("red", "❌ Nut bindings xatosi: " + e.message));
  }
}
prepareNutBindings();

const { mouse, Button, keyboard, Key } = require("@nut-tree/nut-js");
mouse.config.mouseSpeed = 1500;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (isPkg) {
  const tmpRoot = path.join(os.tmpdir(), `mymouse-assets-${process.pid}`);
  fs.mkdirSync(tmpRoot, { recursive: true });

  const assets = [
    { file: "index.html", snapshotPath: "index.html" },
    { file: "public/style.css", snapshotPath: "public/style.css" },
    { file: "public/script.js", snapshotPath: "public/script.js" },
    { file: "node_modules/socket.io/client-dist/socket.io.js", snapshotPath: "node_modules/socket.io/client-dist/socket.io.js" },
  ];

  for (const asset of assets) {
    try {
      const snapshotPath = path.join(__dirname, asset.snapshotPath);
      const content = fs.readFileSync(snapshotPath);
      const dest = path.join(tmpRoot, asset.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
    } catch (e) {
      console.warn(paint("yellow", `⚠ ${asset.file} nusxalanmadi: ${e.message}`));
    }
  }

  app.use("/public", express.static(path.join(tmpRoot, "public")));
  app.use("/socket.io", express.static(path.join(tmpRoot, "node_modules", "socket.io", "client-dist")));
  app.get("/", (req, res) => res.sendFile(path.join(tmpRoot, "index.html")));
} else {
  app.use("/public", express.static(path.join(__dirname, "public")));
  app.use("/socket.io", express.static(path.join(__dirname, "node_modules", "socket.io", "client-dist")));
  app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
}

let clients = 0;

io.on("connection", (socket) => {
  clients++;
  setStatus(paint("green", "● Telefon ulandi!") + (clients > 1 ? paint("gray", ` (${clients} qurilma)`) : ""));

  socket.on("move", async ({ dx, dy } = {}) => {
    try {
      const pos = await mouse.getPosition();
      const speed = 3;
      await mouse.setPosition({
        x: Math.round(pos.x + clampNum(dx, -300, 300) * speed),
        y: Math.round(pos.y + clampNum(dy, -300, 300) * speed),
      });
    } catch (e) {
      console.error("\n" + paint("red", "Move error: " + e.message));
    }
  });

  socket.on("scroll", async ({ dy } = {}) => {
    try {
      const amount = Math.ceil(Math.abs(clampNum(dy, -100, 100)));
      if (dy > 0) await mouse.scrollDown(amount);
      else if (dy < 0) await mouse.scrollUp(amount);
    } catch (e) {
      console.error("\n" + paint("red", "Scroll error: " + e.message));
    }
  });

  socket.on("click", async (btn) => {
    try {
      if (btn === "left") await mouse.click(Button.LEFT);
      else if (btn === "right") await mouse.click(Button.RIGHT);
      else if (btn === "middle") await mouse.click(Button.MIDDLE);
    } catch (e) {
      console.error("\n" + paint("red", "Click error: " + e.message));
    }
  });

  socket.on("altTabStart", async () => {
    try {
      await keyboard.pressKey(Key.LeftAlt);
      await keyboard.pressKey(Key.Tab);
      await keyboard.releaseKey(Key.Tab);
    } catch (e) {
      console.error("\n" + paint("red", "Alt+Tab start error: " + e.message));
    }
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
    } catch (e) {
      console.error("\n" + paint("red", "Alt+Tab navigate error: " + e.message));
    }
  });

  socket.on("altTabEnd", async () => {
    try {
      await keyboard.releaseKey(Key.LeftAlt);
    } catch (e) {
      console.error("\n" + paint("red", "Alt+Tab end error: " + e.message));
    }
  });

  socket.on("disconnect", () => {
    clients--;
    setStatus(
      clients > 0
        ? paint("green", `● Telefon ulandi (${clients})`)
        : paint("yellow", "○ Telefon uzildi. Qayta ulanishni kuting...")
    );
  });
});

const BOX_W = 54;

function boxRow(text, color) {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "");
  const padTotal = Math.max(0, BOX_W - 2 - visible.length);
  const padLeft = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;
  return (
    paint("cyan", "│") +
    " ".repeat(padLeft) +
    (color ? paint(color, text) : text) +
    " ".repeat(padRight) +
    paint("cyan", "│")
  );
}

function printWelcome(urls) {
  const top = paint("cyan", "┌" + "─".repeat(BOX_W - 2) + "┐");
  const bottom = paint("cyan", "└" + "─".repeat(BOX_W - 2) + "┘");

  console.log("\n");
  console.log(top);
  console.log(boxRow(`MyMouse  v${VERSION}`, "bold"));
  console.log(boxRow("Telefoningiz — kompyuter sichqonchasi", "gray"));
  console.log(bottom);

  console.log(`
   ${paint("cyan", "1.")} Telefoningizda Chrome brauzerini oching
   ${paint("cyan", "2.")} QR kodni skanerlang YOKI manzilni kiriting:
`);

  qrcode.generate(urls[0], { small: true }, (qr) => console.log(qr.replace(/^/gm, "   ")));

  console.log("");
  urls.forEach((url, i) => {
    const label = i === 0 ? "👉" : "  ";
    console.log(`   ${label} ${paint("cyan", paint("bold", url))}`);
  });

  console.log(`
   ${paint("gray", "── Boshqaruv " + "─".repeat(40))}
     • 1 barmoq    →  kursorni harakatlantirish
     • 2 barmoq    →  scroll
     • 3 barmoq    →  oynalar almashtirish (Alt+Tab)
     • Tez bosish  →  chap klik
   ${paint("gray", "─".repeat(53))}

   ⚠️  Kompyuter va telefon bitta Wi-Fida bo'lishi shart!
`);
}

function startApp() {
  let PORT = Math.trunc(Number(process.env.PORT));
  if (!PORT || PORT < 1 || PORT > 65535) PORT = 3000;

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(paint("red", `\n❌ ${PORT}-port band. Boshqa dastur ishlatyapti.\n   Portni o'zgartirish uchun: set PORT=3001 va qayta ishga tushiring.`));
    } else {
      console.error(paint("red", `\n❌ Server xatosi: ${err.message}`));
    }
    process.exit(1);
  });

  server.listen(PORT, "0.0.0.0", () => {
    const ips = lanIPv4s().sort((a, b) => {
      const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
      return rank(a) - rank(b);
    });
    const urls = ips.map((ip) => `http://${ip}:${PORT}`);

    if (urls.length === 0) {
      urls.push(`http://localhost:${PORT}`);
      printWelcome(urls);
      console.log(paint("red", "   ❗ Wi-Fi tarmog'i topilmadi. Iltimos Wi-Fi'ga ulaning va qayta ishga tushiring.\n"));
    } else {
      printWelcome(urls);
    }

    setStatus(paint("yellow", "○ Telefon kutilmoqda... (QR kodni skanerlang)"));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on("line", () => {
      console.log("\n👋 MyMouse yopildi.");
      rl.close();
      server.close();
      process.exit(0);
    });
    rl.on("SIGINT", () => {
      console.log("\n👋 MyMouse yopildi.");
      process.exit(0);
    });
  });
}

startApp();
