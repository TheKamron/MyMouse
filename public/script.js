async function initSocket() {
  try {
    const res = await fetch("/__ip__");
    const ip = (await res.text()).trim();
    const origin = `http://${ip}:3000`;

    console.log("[client] connecting to socket:", origin);
    const socket = io(origin);

    const touchpad = document.getElementById("touchpad");
    let mode = null;
    let lastX = 0;
    let lastY = 0;
    let tapTimeout = null;
    let threeFingerStartX = 0;
    let altTabActive = false;
    let lastSwipeTime = 0;

    socket.on("connect", () => console.log("[client] connected", socket.id));
    socket.on("disconnect", () => console.log("[client] disconnected"));

    // === TOUCH START ===
    touchpad.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        mode = "move";
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        tapTimeout = setTimeout(() => tapTimeout = null, 200);
      } else if (e.touches.length === 2) {
        mode = "scroll";
        lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        console.log("Scroll mode activated");
      } else if (e.touches.length === 3) {
        mode = "altTab";
        threeFingerStartX = (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3;
        altTabActive = true;
        lastSwipeTime = Date.now();
        
        // Hold ALT (open window switcher)
        socket.emit("altTabStart");
        console.log("ALT+TAB: Window switcher opened");
      }
    });

    // === TOUCH MOVE ===
    touchpad.addEventListener("touchmove", (e) => {
      e.preventDefault();
      
      if (mode === "move" && e.touches.length === 1) {
        // Single finger - move cursor
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        socket.emit("move", { dx, dy });
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        
      } else if (mode === "scroll" && e.touches.length === 2) {
        // Two fingers - scroll
        const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const dy = lastY - currentY;
        
        if (Math.abs(dy) > 2) {
          const scrollAmount = Math.round(dy * 5);
          socket.emit("scroll", { dy: scrollAmount });
          lastY = currentY;
          console.log("Scrolling:", scrollAmount);
        }
      } else if (mode === "altTab" && e.touches.length === 3 && altTabActive) {
        // Three fingers - navigate through windows
        const currentX = (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3;
        const dx = currentX - threeFingerStartX;
        const now = Date.now();
        
        // Debounce: only allow one swipe every 300ms to prevent too many rapid switches
        if (now - lastSwipeTime > 300) {
          if (dx > 50) {
            // Swipe left = next window (press TAB)
            socket.emit("altTabNavigate", { direction: "next" });
            threeFingerStartX = currentX;
            lastSwipeTime = now;
            console.log("ALT+TAB: Next window");
          } else if (dx < -50) {
            // Swipe right = previous window (press SHIFT+TAB)
            socket.emit("altTabNavigate", { direction: "prev" });
            threeFingerStartX = currentX;
            lastSwipeTime = now;
            console.log("ALT+TAB: Previous window");
          }
        }
      }
    }, { passive: false });

    // === TOUCH END ===
    touchpad.addEventListener("touchend", (e) => {
      if (tapTimeout && e.touches.length === 0) {
        socket.emit("click", "left");
      }
      tapTimeout = null;
      
      // If ALT+TAB was active and all fingers lifted, release ALT
      if (altTabActive && e.touches.length === 0) {
        socket.emit("altTabEnd");
        altTabActive = false;
        mode = null;
        console.log("ALT+TAB: Window selected");
        return;
      }
      
      if (e.touches.length === 0) {
        mode = null;
        console.log("Touch ended, mode reset");
      }
    });

    // Button clicks
    document.getElementById("left").addEventListener("click", () => socket.emit("click", "left"));
    document.getElementById("right").addEventListener("click", () => socket.emit("click", "right"));
    
  } catch (err) {
    console.error("Failed to init socket:", err);
    alert("Server bilan ulanishda xatolik. Iltimos firewall va Wi-Fi'ni tekshiring.\n\nError: " + (err && err.message));
  }
}

initSocket();