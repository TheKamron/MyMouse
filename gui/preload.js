const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("myMouse", {
  getState: () => ipcRenderer.invoke("get-state"),
  start: (port) => ipcRenderer.invoke("start", port),
  stop: () => ipcRenderer.invoke("stop"),
  copy: (text) => ipcRenderer.invoke("copy", text),
  setLang: (lang) => ipcRenderer.invoke("set-lang", lang),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onState: (cb) => {
    const l = (_e, s) => cb(s);
    ipcRenderer.on("state", l);
    return () => ipcRenderer.removeListener("state", l);
  },
  onEvent: (cb) => {
    const l = (_e, ev) => cb(ev);
    ipcRenderer.on("event", l);
    return () => ipcRenderer.removeListener("event", l);
  },
});
