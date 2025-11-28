const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const dotenv = require('dotenv')
const User = require('./models/User.js')
dotenv.config();

const isPkg = typeof process.pkg !== "undefined";

// === Nut.js setup ===
function prepareNutBindings() {
  try {
    const osTmp = os.tmpdir();
    const destDir = path.join(osTmp, "nutjs");
    const destPath = path.join(destDir, "libnut.node");

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const srcPath = isPkg
      ? path.join(path.dirname(process.execPath), "node_modules/@nut-tree/libnut-win32/build/Release/libnut.node")
      : path.join(__dirname, "node_modules/@nut-tree/libnut-win32/build/Release/libnut.node");

    if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, destPath);
    process.env.LIBNUT_PATH = destPath;
  } catch (e) {
    console.error("❌ Nut bindings preparation error:", e);
  }
}
prepareNutBindings();

const { mouse, Button, keyboard, Key } = require("@nut-tree/nut-js");
mouse.config.mouseSpeed = 1500;

// === Express setup ===
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// === Asset copying ===
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

let servedRoot;
if (isPkg) {
  // console.log("📦 Running in PKG mode, extracting assets...");
  const tmpRoot = path.join(os.tmpdir(), `mymouse-assets-${process.pid}`);
  servedRoot = tmpRoot;
  ensureDir(tmpRoot);

  // Assets to extract - use direct paths in snapshot
  const assets = [
   { file: "index.html", snapshotPath: "index.html" },
  { file: "public/style.css", snapshotPath: "public/style.css" },
  { file: "public/script.js", snapshotPath: "public/script.js" },
  { file: "node_modules/socket.io/client-dist/socket.io.js", snapshotPath: "node_modules/socket.io/client-dist/socket.io.js" }
  ];

  for (const asset of assets) {
    const dest = path.join(tmpRoot, asset.file);
    ensureDir(path.dirname(dest));
    
    try {
      const snapshotPath = path.join(__dirname, asset.snapshotPath);
      const content = fs.readFileSync(snapshotPath);
      fs.writeFileSync(dest, content);
    } catch (e) {
      console.warn(`⚠️ Failed to copy ${asset.file}: ${e.message}`);
      console.warn(`   Tried: ${asset.snapshotPath}`);
    }
  }

  app.use("/public", express.static(path.join(servedRoot, "public")));
  app.use("/socket.io", express.static(path.join(servedRoot, "node_modules", "socket.io", "client-dist")));
  app.get("/", (req, res) => res.sendFile(path.join(servedRoot, "index.html")));
} else {
  const baseDir = __dirname;
  app.use("/public", express.static(path.join(baseDir, "public")));
  app.use("/socket.io", express.static(path.join(baseDir, "node_modules", "socket.io", "client-dist")));
  app.get("/", (req, res) => res.sendFile(path.join(baseDir, "index.html")));
}

// === IP route ===
app.get("/__ip__", (req, res) => {
  const nets = os.networkInterfaces();
  let ip = "127.0.0.1";
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) ip = net.address;
    }
  }
  res.send(ip);
});

// === Socket events ===
io.on("connection", (socket) => {
  console.log("✅ Telefon muvaffaqiyatli ulandi!");

  socket.on("move", async ({ dx, dy }) => {
    try {
      const pos = await mouse.getPosition();
      const speed = 3;
      await mouse.setPosition({ x: pos.x + dx * speed, y: pos.y + dy * speed });
    } catch (e) {
      console.error("Move error:", e);
    }
  });

  socket.on("scroll", async ({ dy }) => {
    try {
      if (dy > 0) await mouse.scrollDown(Math.abs(dy));
      else if (dy < 0) await mouse.scrollUp(Math.abs(dy));
    } catch (e) {
      console.error("Scroll error:", e);
    }
  });

  socket.on("click", async (btn) => {
    try {
      if (btn === "left") await mouse.click(Button.LEFT);
      else if (btn === "right") await mouse.click(Button.RIGHT);
    } catch (e) {
      console.error("Click error:", e);
    }
  });
  
socket.on("altTabStart", async () => {
    try {
      await keyboard.pressKey(Key.LeftAlt);
      await keyboard.pressKey(Key.Tab);
      await keyboard.releaseKey(Key.Tab);
    } catch (e) {
      console.error("ALT+TAB Start error:", e);
    }
  });

  socket.on("altTabNavigate", async ({ direction }) => {
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
      console.error("ALT+TAB Navigate error:", e);
    }
  });

  socket.on("altTabEnd", async () => {
    try {
      await keyboard.releaseKey(Key.LeftAlt);
    } catch (e) {
      console.error("ALT+TAB End error:", e);
    }
  });
  
  socket.on("disconnect", () => console.log("❌ Telefon uzildi!"));
});

// === Run Server ===
const startApp = async () => { 
  try { 
    // server listen
    const PORT = 3000;
    server.listen(PORT, "0.0.0.0", () => {
      const nets = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === "IPv4" && !net.internal) ips.push(net.address);
        }
      }
      console.log("\n🌐 MyMouse ishga tushirildi...");
      console.log("\n📱 Telefoningizdagi brauzer(Chrome) orqali shu manzillardan birini oching: ");
      ips.forEach((ip) => console.log(`   👉 http://${ip}:${PORT}`));
      console.log("\n 1. Telefoningizda Chrome ilovasini oching. \n 2. Qidiruv tizimiga tepada ko'rsatilgan IP adressni kiriting. \n 3. Ekranda chiqqan sichqonchaning Touchpad qismiga teginish orqali harakatlantiring.");
      console.log("\n 🎯 Funksiyalar:");
      console.log("   • 1 barmoq = Sichqonchani harakatlantirish");
      console.log("   • 2 barmoq yuqoriga/pastga = Scroll");
      console.log("   • 3 barmoq o'ngga/chapga = Switch Windows");
      console.log("\n ------------------------------------------------- \n DIQQAT: Kompyuteringiz va Telefoningiz bir xil \n  Wi-Figa ulanganligiga ishonch hosil qiling! \n ------------------------------------------------- ");
      console.log("\n O'chirish uchun ENTER tugmasini bosing...");
      console.log("\n --------------- \n dev: -offcodev- \n ---------------");
    
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on("line", () => process.exit(0));
    });
  } catch (error) {
    console.log('Xatolik yuz berdi:', error)
  }
}  

startApp()
