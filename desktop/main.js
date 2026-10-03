/**
 * Flow Kit Desktop — Electron Main Process
 *
 * Cross-platform desktop runtime for Windows (x64) and macOS (Apple Silicon M-chip / Intel x64):
 * 1. Environment & PATH adaptation across macOS Homebrew (arm64 & x64) and Windows
 * 2. Python FastAPI Backend lifecycle (auto-spawn on port 8100, health check, graceful process-tree kill on exit)
 * 3. Chrome Extension loader (Manifest V3 bridge)
 * 4. Flow Kit Dashboard Window (React SPA on port 8100)
 * 5. Google Flow Window (embedded session with Google sign-in support)
 * 6. macOS standard application menus and clipboard integration (Cmd+C/V/X/A)
 */

const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog } = require('electron');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// ─── Environment & PATH Normalization ────────────────────────

// On macOS and Linux, GUI applications launched from Finder/Dock don't inherit
// full shell PATH. Augment PATH with Homebrew (Apple Silicon / Intel) and local bins.
if (process.platform !== 'win32') {
  const extraPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    path.join(process.env.HOME || '', '.local', 'bin'),
    path.join(process.env.HOME || '', '.cargo', 'bin'),
  ];
  const current = (process.env.PATH || '').split(path.delimiter);
  const merged = Array.from(new Set([...extraPaths, ...current])).filter((p) => p && fs.existsSync(p));
  process.env.PATH = merged.join(path.delimiter);
}

// ─── Path & Constants ────────────────────────────────────────

function resolveRootDir() {
  if (process.env.FLOW_AGENT_DIR && fs.existsSync(process.env.FLOW_AGENT_DIR)) {
    return path.resolve(process.env.FLOW_AGENT_DIR);
  }

  if (app.isPackaged) {
    const packagedResourcePath = path.join(process.resourcesPath, 'flowkit');
    if (fs.existsSync(packagedResourcePath)) {
      return packagedResourcePath;
    }
    if (fs.existsSync(path.join(process.cwd(), 'agent'))) {
      return process.cwd();
    }
    return process.resourcesPath;
  }

  return path.resolve(__dirname, '..');
}

const ROOT_DIR = resolveRootDir();
const BACKEND_URL = 'http://127.0.0.1:8100';
const HEALTH_URL = `${BACKEND_URL}/health`;
const FLOW_URL = 'https://flow.google.com/';
const EXTENSION_PATH = path.join(ROOT_DIR, 'extension');
const OUTPUT_PATH = path.join(ROOT_DIR, 'output');
const ICON_PATH = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Standard Chrome User-Agent to prevent Google Account Sign-In blocks
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

let mainWindow = null;
let splashWindow = null;
let flowWindow = null;
let pythonProcess = null;
let isQuitting = false;

// Set global fallback User-Agent
app.userAgentFallback = CHROME_UA;

// ─── Platform & Architecture Info ────────────────────────────

function getPlatformInfo() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  const arch = process.arch;

  let archLabel = arch;
  if (isMac) {
    archLabel = arch === 'arm64' ? 'Apple Silicon (M-Chip)' : (arch === 'x64' ? 'Intel' : arch);
    return `macOS ${archLabel}`;
  }
  if (isWin) {
    return `Windows (${arch})`;
  }
  return `Linux (${arch})`;
}

// ─── Python Environment Detection ───────────────────────────

function findPythonExecutable() {
  const isWin = process.platform === 'win32';

  // 1. Check virtual environments in ROOT_DIR
  const candidateVenvs = [
    isWin ? path.join(ROOT_DIR, 'venv', 'Scripts', 'python.exe') : path.join(ROOT_DIR, 'venv', 'bin', 'python'),
    isWin ? path.join(ROOT_DIR, 'venv', 'Scripts', 'python3.exe') : path.join(ROOT_DIR, 'venv', 'bin', 'python3'),
    isWin ? path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe') : path.join(ROOT_DIR, '.venv', 'bin', 'python'),
    isWin ? path.join(ROOT_DIR, '.venv', 'Scripts', 'python3.exe') : path.join(ROOT_DIR, '.venv', 'bin', 'python3'),
  ];

  for (const cand of candidateVenvs) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }

  // 2. On macOS / Linux: Check Homebrew and standard system python binaries
  if (!isWin) {
    const isArm64 = process.arch === 'arm64';
    const macCandidates = [
      // Prioritize Apple Silicon Homebrew paths if arm64
      ...(isArm64
        ? [
            '/opt/homebrew/bin/python3',
            '/opt/homebrew/bin/python3.12',
            '/opt/homebrew/bin/python3.11',
            '/opt/homebrew/bin/python3.10',
          ]
        : []),
      // Intel Mac Homebrew paths
      '/usr/local/bin/python3',
      '/usr/local/bin/python3.12',
      '/usr/local/bin/python3.11',
      '/usr/local/bin/python3.10',
      // Homebrew fallback if on x64 Rosetta
      '/opt/homebrew/bin/python3',
      // Standard Unix / macOS
      '/usr/bin/python3',
      '/usr/bin/python',
    ];

    for (const p of macCandidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    try {
      const detected = execSync('which python3 || which python', { encoding: 'utf8' }).trim().split('\n')[0];
      if (detected && fs.existsSync(detected)) {
        return detected;
      }
    } catch (_) {}
  } else {
    // Windows: Check where python.exe
    try {
      const detected = execSync('where python.exe', { encoding: 'utf8' }).trim().split('\r\n')[0];
      if (detected && fs.existsSync(detected)) {
        return detected;
      }
    } catch (_) {}
  }

  // Fallback to PATH resolution
  return isWin ? 'python.exe' : 'python3';
}

// ─── Backend Health Check ────────────────────────────────────

function checkHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, data: json });
        } catch {
          resolve({ ok: res.statusCode === 200, data: null });
        }
      });
    });

    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

// ─── Backend Process Management ──────────────────────────────

async function startBackend(onStatusUpdate) {
  const initialHealth = await checkHealth();
  if (initialHealth.ok) {
    if (onStatusUpdate) onStatusUpdate('Backend đã đang chạy trên cổng 8100...');
    return true;
  }

  const pythonExec = findPythonExecutable();
  if (onStatusUpdate) onStatusUpdate(`Đang khởi động Python (${path.basename(pythonExec)})...`);

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    FLOW_AGENT_DIR: ROOT_DIR,
  };

  try {
    pythonProcess = spawn(pythonExec, ['-m', 'agent.main'], {
      cwd: ROOT_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });

    pythonProcess.stdout.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      console.log(`[Python stdout] ${msg}`);
    });

    pythonProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      console.warn(`[Python stderr] ${msg}`);
    });

    pythonProcess.on('exit', (code, signal) => {
      console.log(`[Python] Exited with code ${code}, signal ${signal}`);
      pythonProcess = null;
    });
  } catch (err) {
    console.error('Failed to spawn Python process:', err);
    if (onStatusUpdate) onStatusUpdate(`Lỗi khởi động Python: ${err.message}`);
    return false;
  }

  // Poll until healthy
  const maxAttempts = 40;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onStatusUpdate) onStatusUpdate(`Đang kiểm tra kết nối server (${attempt}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, 600));

    const health = await checkHealth();
    if (health.ok) {
      if (onStatusUpdate) onStatusUpdate('Khởi động thành công! Đang tải giao diện...');
      return true;
    }
  }

  return false;
}

function stopBackend() {
  if (pythonProcess && pythonProcess.pid) {
    const pid = pythonProcess.pid;
    console.log(`Stopping Python process tree PID: ${pid}`);
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pid} /T /F`);
      } else {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch (_) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('Error killing Python process:', e.message);
    }
    pythonProcess = null;
  }
}

// ─── Windows Creation ────────────────────────────────────────

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#00000000',
    ...(fs.existsSync(ICON_PATH) ? { icon: ICON_PATH } : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
}

function updateSplashStatus(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status-update', text);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Flow Kit Desktop',
    backgroundColor: '#090a10',
    show: false,
    ...(fs.existsSync(ICON_PATH) ? { icon: ICON_PATH } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(BACKEND_URL);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://flow.google.com')) {
      openFlowWindow();
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setupAppMenu();
}

function openFlowWindow() {
  if (flowWindow && !flowWindow.isDestroyed()) {
    flowWindow.focus();
    return;
  }

  flowWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'Google Flow — Session Browser',
    backgroundColor: '#111827',
    ...(fs.existsSync(ICON_PATH) ? { icon: ICON_PATH } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:flowkit_google', // persists cookies & login session
    },
  });

  flowWindow.webContents.setUserAgent(CHROME_UA);
  flowWindow.loadURL(FLOW_URL);

  flowWindow.on('closed', () => {
    flowWindow = null;
  });
}

// ─── Application Menu ────────────────────────────────────────

function showAboutDialog(platformLabel) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Flow Kit Desktop',
    message: 'Flow Kit Desktop v1.0.0',
    detail: `Hệ thống tự động hóa sản xuất video AI chất lượng cao.\nNền tảng: ${platformLabel}\nTích hợp Google Flow, Veo 3 & Omni Flash.`,
  });
}

function setupAppMenu() {
  const isMac = process.platform === 'darwin';
  const platformLabel = getPlatformInfo();

  const template = [
    ...(isMac
      ? [
          {
            role: 'appMenu',
            submenu: [
              {
                label: 'Về Flow Kit Desktop',
                click: () => showAboutDialog(platformLabel),
              },
              { type: 'separator' },
              { role: 'services', label: 'Dịch vụ' },
              { type: 'separator' },
              { role: 'hide', label: 'Ẩn Flow Kit' },
              { role: 'hideOthers', label: 'Ẩn ứng dụng khác' },
              { role: 'unhide', label: 'Hiện tất cả' },
              { type: 'separator' },
              { role: 'quit', label: 'Thoát Flow Kit' },
            ],
          },
        ]
      : []),
    {
      label: 'Flow Kit',
      submenu: [
        {
          label: 'Mở Google Flow trong App',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => openFlowWindow(),
        },
        {
          label: 'Mở Google Flow trong Chrome ngoài',
          click: () => shell.openExternal(FLOW_URL),
        },
        { type: 'separator' },
        {
          label: 'Mở thư mục Video đầu ra (output)',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            if (!fs.existsSync(OUTPUT_PATH)) {
              fs.mkdirSync(OUTPUT_PATH, { recursive: true });
            }
            shell.openPath(OUTPUT_PATH);
          },
        },
        {
          label: 'Kiểm tra trạng thái hệ thống',
          click: async () => {
            const health = await checkHealth();
            const statusMsg = health.ok
              ? `Backend: OK (Port 8100)\nNền tảng: ${platformLabel}\nExtension kết nối: ${health.data?.extension_connected ? 'Đã kết nối' : 'Chưa kết nối'}\nPhiên bản: ${health.data?.version || '1.3'}`
              : `Backend: Không phản hồi trên port 8100!\nNền tảng: ${platformLabel}`;
            dialog.showMessageBox(mainWindow, {
              type: health.ok ? 'info' : 'error',
              title: 'Trạng thái Flow Kit',
              message: statusMsg,
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Khởi động lại Backend',
          click: async () => {
            stopBackend();
            await startBackend((t) => console.log(t));
            if (mainWindow) mainWindow.reload();
          },
        },
        ...(!isMac
          ? [
              { type: 'separator' },
              {
                label: 'Thoát ứng dụng',
                accelerator: 'CmdOrCtrl+Q',
                click: () => {
                  app.quit();
                },
              },
            ]
          : []),
      ],
    },
    {
      label: 'Chỉnh sửa',
      submenu: [
        { role: 'undo', label: 'Hoàn tác' },
        { role: 'redo', label: 'Làm lại' },
        { type: 'separator' },
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { role: 'delete', label: 'Xóa' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Chọn tất cả' },
      ],
    },
    {
      label: 'Giao diện',
      submenu: [
        { role: 'reload', label: 'Tải lại trang (F5)' },
        { role: 'forceReload', label: 'Tải lại cưỡng bức' },
        { role: 'toggleDevTools', label: 'Công cụ phát triển (DevTools)' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Cỡ chữ chuẩn' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ],
    },
    ...(isMac
      ? [
          {
            role: 'windowMenu',
            submenu: [
              { role: 'minimize', label: 'Thu nhỏ' },
              { role: 'zoom', label: 'Phóng to cửa sổ' },
              { type: 'separator' },
              { role: 'front', label: 'Đưa lên phía trước' },
            ],
          },
        ]
      : []),
    {
      label: 'Trợ giúp',
      submenu: [
        {
          label: 'Tài liệu hướng dẫn (CLAUDE.md)',
          click: () => {
            const docPath = path.join(ROOT_DIR, 'CLAUDE.md');
            if (fs.existsSync(docPath)) shell.openPath(docPath);
          },
        },
        {
          label: 'Về Flow Kit Desktop',
          click: () => showAboutDialog(platformLabel),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── IPC Handlers ────────────────────────────────────────────

ipcMain.on('open-flow-window', () => openFlowWindow());
ipcMain.on('open-external-url', (_, url) => shell.openExternal(url));
ipcMain.on('open-output-folder', () => {
  if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH, { recursive: true });
  shell.openPath(OUTPUT_PATH);
});

ipcMain.handle('get-system-status', async () => {
  return await checkHealth();
});

ipcMain.handle('restart-backend', async () => {
  stopBackend();
  const ok = await startBackend((t) => console.log(t));
  if (mainWindow && ok) mainWindow.reload();
  return ok;
});

// ─── App Lifecycle ───────────────────────────────────────────

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    try {
      app.dock.setIcon(ICON_PATH);
    } catch (_) {}
  }

  createSplashWindow();

  // Strip Electron identifier headers from requests to avoid Google Sign-In blocking
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    delete details.requestHeaders['X-Requested-With'];
    details.requestHeaders['User-Agent'] = CHROME_UA;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  // Load Chrome Extension into Electron
  if (fs.existsSync(EXTENSION_PATH)) {
    try {
      await session.defaultSession.loadExtension(EXTENSION_PATH, {
        allowFileAccess: true,
      });
      console.log('✓ Chrome Extension loaded successfully into Electron');
    } catch (err) {
      console.warn('Extension load notice:', err.message);
    }
  }

  // Start Python backend
  const backendReady = await startBackend(updateSplashStatus);

  if (backendReady) {
    createMainWindow();
  } else {
    updateSplashStatus('Không thể kết nối Backend. Vui lòng kiểm tra Python!');
    dialog.showErrorBox(
      'Khởi động thất bại',
      'Không thể khởi động tiến trình Python backend (FastAPI).\nVui lòng kiểm tra môi trường ảo venv hoặc cài đặt thư viện.'
    );
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
