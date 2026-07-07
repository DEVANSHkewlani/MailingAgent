import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Frameless design
    titleBarStyle: 'hidden', // Native OS buttons placement
    transparent: true, // Transparent backdrop blur channels
    hasShadow: true,
    vibrancy: 'under-window', // macOS glass effect
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // Load local Vite server in development
  const devUrl = 'http://localhost:5173/#/app'
  mainWindow.loadURL(devUrl)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Bind IPC translucency listeners ──────────────────────────────────────────

ipcMain.on('set-translucency', (_, payload: { intensity: number }) => {
  if (mainWindow) {
    const opacity = 1 - (payload.intensity / 100)
    // Clamp opacity to a safe range (minimum 15% so the window does not vanish)
    mainWindow.setOpacity(Math.max(0.15, opacity))
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
