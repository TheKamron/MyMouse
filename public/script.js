(() => {
  const socket = io({ reconnectionDelayMax: 3000 });

  const touchpad = document.getElementById("touchpad");
  const statusEl = document.getElementById("status");

  let mode = null;
  let lastX = 0;
  let lastY = 0;
  let tapTimer = null;
  let tapValid = false;
  let travel = 0;
  let threeFingerStartX = 0;
  let altTabActive = false;
  let lastSwipeTime = 0;

  function setStatus(cls, text) {
    statusEl.className = "status " + cls;
    statusEl.textContent = text;
  }

  setStatus("warn", "⏳ Connecting...");
  socket.on("connect", () => setStatus("ok", "● Connected"));
  socket.on("disconnect", () => setStatus("err", "○ Disconnected — reconnecting..."));

  let accX = 0;
  let accY = 0;
  let framePending = false;

  function flushMove() {
    socket.emit("move", { dx: accX, dy: accY });
    accX = accY = 0;
    framePending = false;
  }

  function queueMove(dx, dy) {
    accX += dx;
    accY += dy;
    if (!framePending) {
      framePending = true;
      requestAnimationFrame(flushMove);
    }
  }

  function cancelTap() {
    clearTimeout(tapTimer);
    tapTimer = null;
    tapValid = false;
  }

  const avgY = (touches) =>
    Array.from(touches).reduce((s, t) => s + t.clientY, 0) / touches.length;

  const avgX = (touches) =>
    Array.from(touches).reduce((s, t) => s + t.clientX, 0) / touches.length;

  touchpad.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      mode = "move";
      travel = 0;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      cancelTap();
      tapValid = true;
      tapTimer = setTimeout(cancelTap, 250);
    } else if (e.touches.length === 2) {
      cancelTap();
      mode = "scroll";
      lastY = avgY(e.touches);
    } else if (e.touches.length === 3) {
      cancelTap();
      mode = "altTab";
      threeFingerStartX = avgX(e.touches);
      altTabActive = true;
      lastSwipeTime = Date.now();
      socket.emit("altTabStart");
    }
  });

  touchpad.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();

      if (mode === "move" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        travel += Math.abs(dx) + Math.abs(dy);
        if (travel > 15) cancelTap();
        queueMove(dx, dy);
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else if (mode === "scroll" && e.touches.length === 2) {
        const currentY = avgY(e.touches);
        const dy = lastY - currentY;
        if (Math.abs(dy) > 2) {
          socket.emit("scroll", { dy: Math.round(dy * 5) });
          lastY = currentY;
        }
      } else if (mode === "altTab" && e.touches.length === 3 && altTabActive) {
        const currentX = avgX(e.touches);
        const dx = currentX - threeFingerStartX;
        const now = Date.now();

        if (now - lastSwipeTime > 300) {
          if (dx > 50) {
            socket.emit("altTabNavigate", { direction: "next" });
            threeFingerStartX = currentX;
            lastSwipeTime = now;
          } else if (dx < -50) {
            socket.emit("altTabNavigate", { direction: "prev" });
            threeFingerStartX = currentX;
            lastSwipeTime = now;
          }
        }
      }
    },
    { passive: false }
  );

  touchpad.addEventListener("touchend", (e) => {
    if (altTabActive && e.touches.length === 0) {
      altTabActive = false;
      cancelTap();
      socket.emit("altTabEnd");
      mode = null;
      return;
    }

    if (tapValid && e.touches.length === 0) {
      socket.emit("click", "left");
    }
    cancelTap();

    if (e.touches.length === 1 && mode !== "move") {
      mode = "move";
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2 && mode === "scroll") {
      lastY = avgY(e.touches);
    } else if (e.touches.length === 0) {
      mode = null;
    }
  });

  document.getElementById("left").addEventListener("click", () => socket.emit("click", "left"));
  document.getElementById("right").addEventListener("click", () => socket.emit("click", "right"));

  document.addEventListener("contextmenu", (e) => e.preventDefault());
})();
