import { contextBridge, ipcRenderer } from 'electron'

// Expose the translucency intensity channel safely to the React window context
contextBridge.exposeInMainWorld('mailingDesktop', {
  setTranslucency: (payload: { intensity: number }) => {
    ipcRenderer.send('set-translucency', payload)
  }
})
