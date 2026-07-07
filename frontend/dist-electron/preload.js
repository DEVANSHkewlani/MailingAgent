"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose the translucency intensity channel safely to the React window context
electron_1.contextBridge.exposeInMainWorld('mailingDesktop', {
    setTranslucency: (payload) => {
        electron_1.ipcRenderer.send('set-translucency', payload);
    }
});
