(() => {
  const api = window.myMouse;

  const els = {
    qrImg: document.getElementById("qrImg"),
    qrBox: document.getElementById("qrBox"),
    wifiNote: document.getElementById("wifiNote"),
    urlList: document.getElementById("urlList"),
    serverPill: document.getElementById("serverPill"),
    pillText: document.getElementById("pillText"),
    dot: document.getElementById("dot"),
    clientCount: document.getElementById("clientCount"),
    port: document.getElementById("port"),
    toggleBtn: document.getElementById("toggleBtn"),
    feed: document.getElementById("feed"),
    toast: document.getElementById("toast"),
    langSelect: document.getElementById("langSelect"),
  };

  let lang = localStorage.getItem("mymouse-lang") || "uz";
  let langInitialized = false;
  let running = false;
  let toastTimer = null;

  function applyLang(l) {
    lang = l;
    localStorage.setItem("mymouse-lang", l);
    document.documentElement.lang = l;
    els.langSelect.value = l;
    applyStatic();
    if (lastState) render(lastState);
  }

  function t(key) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.uz;
    return dict[key] !== undefined ? dict[key] : (TRANSLATIONS.uz[key] || key);
  }

  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function eventText(ev) {
    if (ev.type === "click") {
      const key = { left: "eventLeftClick", right: "eventRightClick", middle: "eventMiddleClick" }[ev.detail] || "eventLeftClick";
      return t(key);
    }
    const keyMap = {
      connected: "eventConnected",
      disconnected: "eventDisconnected",
      started: "eventStarted",
      stopped: "eventStopped",
    };
    return t(keyMap[ev.type] || "eventConnected");
  }

  function addFeed(ev) {
    const node = document.createElement("div");
    node.className = "feed-item ok";
    const span = document.createElement("span");
    span.textContent = eventText(ev);
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = new Date(ev.ts).toLocaleTimeString();
    node.appendChild(span);
    node.appendChild(time);
    els.feed.prepend(node);
    while (els.feed.children.length > 8) els.feed.removeChild(els.feed.lastChild);
  }

  let lastState = null;

  function render(state) {
    lastState = state;

    if (!langInitialized && state.lang && TRANSLATIONS[state.lang]) {
      lang = state.lang;
      localStorage.setItem("mymouse-lang", lang);
      langInitialized = true;
    }
    document.documentElement.lang = lang;
    els.langSelect.value = lang;
    applyStatic();

    if (state.qrDataUrl) {
      els.qrImg.src = state.qrDataUrl;
      els.qrBox.classList.remove("placeholder");
    }

    els.wifiNote.classList.toggle("hidden", !!state.wifi);

    running = state.running;
    els.serverPill.classList.toggle("running", running);
    if (running) {
      els.pillText.textContent = state.clients > 0
        ? `${t("running")} · ${state.clients} ${t("device")}`
        : t("running");
      els.toggleBtn.textContent = t("stop");
      els.toggleBtn.classList.remove("primary");
      els.toggleBtn.classList.add("danger");
      els.port.disabled = true;
    } else {
      els.pillText.textContent = t("stopped");
      els.toggleBtn.textContent = t("start");
      els.toggleBtn.classList.remove("danger");
      els.toggleBtn.classList.add("primary");
      els.port.disabled = false;
    }
    els.toggleBtn.disabled = state.startedLoading;

    els.clientCount.textContent = state.clients;

    els.urlList.innerHTML = "";
    state.urls.forEach((url) => {
      const item = document.createElement("div");
      item.className = "url-item";

      const code = document.createElement("code");
      code.textContent = url;
      code.title = url;
      code.addEventListener("click", () => copyUrl(code, url));

      const copy = document.createElement("button");
      copy.className = "copy-btn";
      copy.textContent = t("copy");
      copy.addEventListener("click", () => copyUrl(code, url));

      item.appendChild(code);
      item.appendChild(copy);
      els.urlList.appendChild(item);
    });
  }

  function copyUrl(codeEl, url) {
    api.copy(url).then(() => {
      toast(t("copiedToast"));
      const btn = codeEl.nextElementSibling;
      if (btn) {
        btn.textContent = t("copied");
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = t("copy");
          btn.classList.remove("copied");
        }, 1200);
      }
    });
  }

  els.langSelect.addEventListener("change", () => {
    const l = els.langSelect.value;
    applyLang(l);
    api.setLang(l);
  });

  els.toggleBtn.addEventListener("click", async () => {
    if (running) {
      await api.stop();
      toast(t("stopToast"));
    } else {
      els.toggleBtn.disabled = true;
      els.toggleBtn.textContent = t("starting");
      const res = await api.start(els.port.value);
      if (res && !res.ok) {
        if (res.error === "port") {
          toast(t("portBusy"));
          els.port.focus();
        } else {
          toast(t("error") + (res.detail || t("unknown")));
        }
      }
    }
  });

  api.onState(render);
  api.onEvent((ev) => addFeed(ev));

  api.getState().then(render);
})();
