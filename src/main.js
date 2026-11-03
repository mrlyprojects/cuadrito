'use strict';
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, powerMonitor, screen, session, shell } = require('electron');
const { PANEL_MIN, resizeBounds, fitInArea, stepToward, randomSpot } = require('./geometry');
const { UsageError, fetchUsage } = require('./usage');
const Sprite = require('./sprite');
const I18n = require('./i18n');

const BASE_URL = 'https://claude.ai';
const PARTITION = 'persist:claude-account';
const MASCOT_PADDING = 6;
const MASCOT_SIZES = { sizeSmall: 32, sizeMedium: 48, sizeLarge: 64 };
const GLASS_LEVELS = { glassSolid: 0.96, glassSoft: 0.75, glassSemi: 0.45, glassClear: 0.18 };
const POLL_PANEL_MS = 30_000;
const POLL_MASCOT_MS = 60_000;
const POLL_MAX_MS = 10 * 60_000;
const DRAG_THRESHOLD = 4;
const WANDER_TICK_MS = 50;
const WALK_SPEED = 45; // pixels per second
const TIRED_WALK_SPEED = 22;
const TIRED_FROM = 60;
const TOO_TIRED_TO_WALK = 92;
const CURSOR_PAUSE_RADIUS = 90;

if (process.env.CUADRITO_USER_DATA) app.setPath('userData', process.env.CUADRITO_USER_DATA);

const demoUsage = process.env.CUADRITO_DEMO ? JSON.parse(process.env.CUADRITO_DEMO) : null;

let t = I18n.forLocale('en');
let settings;
let pack;
let packError = null;
let win = null;
let loginWin = null;
let tray = null;
let gesture = null;
let pollTimer = null;
let failures = 0;
let wander = null;
let usage = { status: 'loading', five: null, week: null, updatedAt: null };

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function customPackPath() {
  return path.join(app.getPath('userData'), 'expressions.json');
}

function loadSettings() {
  const defaults = {
    mode: 'panel',
    anchor: null,
    panelSize: { width: 290, height: 96 },
    mascotSize: MASCOT_SIZES.sizeMedium,
    glass: GLASS_LEVELS.glassSolid,
    activities: true,
    wander: false,
  };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function defaultPack() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'expressions.default.json'), 'utf8'));
}

function loadPack() {
  packError = null;
  pack = defaultPack();
  if (!fs.existsSync(customPackPath())) return;
  try {
    const custom = JSON.parse(fs.readFileSync(customPackPath(), 'utf8'));
    // Version 1 used a smaller grid and can never load; keep it aside instead of nagging on every start.
    if (custom.version === 1) {
      fs.renameSync(customPackPath(), `${customPackPath()}.v1.bak`);
      return;
    }
    const problem = Sprite.validatePack(custom);
    if (problem) packError = problem;
    else pack = custom;
  } catch (error) {
    packError = error.message;
  }
}

function watchCustomPack() {
  let debounce = null;
  fs.watchFile(customPackPath(), { interval: 1000 }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      loadPack();
      pushUpdate();
    }, 200);
  });
}

function openCustomPack() {
  if (!fs.existsSync(customPackPath())) {
    fs.copyFileSync(path.join(__dirname, 'expressions.default.json'), customPackPath());
  }
  shell.openPath(customPackPath());
}

function workAreaAt(point) {
  return screen.getDisplayNearestPoint(point).workArea;
}

function defaultAnchor() {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - settings.panelSize.width - 24, y: area.y + area.height - settings.panelSize.height - 24 };
}

function boundsForMode() {
  const size = settings.mode === 'panel'
    ? settings.panelSize
    : { width: settings.mascotSize + MASCOT_PADDING * 2, height: settings.mascotSize + MASCOT_PADDING * 2 };
  return fitInArea({ ...settings.anchor, ...size }, workAreaAt(settings.anchor));
}

function pushUpdate(extra = {}) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('ui:update', {
      mode: settings.mode,
      glass: settings.glass,
      mascotSize: settings.mascotSize,
      activities: settings.activities,
      usage,
      pack,
      packError,
      ...extra,
    });
  }
  updateTray();
}

function setMode(mode) {
  stopWander();
  settings.mode = mode;
  win.setBounds(boundsForMode());
  saveSettings();
  pushUpdate({ animate: mode === 'panel' });
  schedulePoll(mode === 'panel' ? 0 : pollInterval());
  syncWander();
}

function sendWalk(walking, facing) {
  if (win && !win.isDestroyed()) win.webContents.send('ui:walk', { walking, facing });
}

function restWander(ms) {
  wander.restUntil = Date.now() + ms;
  wander.target = null;
  if (wander.walking) {
    wander.walking = false;
    sendWalk(false, wander.facing);
  }
}

// Longer stops when activities are on, so it has time to do them.
function restAfterWalk() {
  return settings.activities ? 12_000 + Math.random() * 16_000 : 2000 + Math.random() * 6000;
}

function stepWander() {
  if (gesture || !win || win.isDestroyed()) return;
  const percent = Sprite.worstPercent(usage.five, usage.week, Date.now());
  if (percent !== null && percent >= TOO_TIRED_TO_WALK) {
    restWander(5000);
    return;
  }
  const { width, height } = win.getBounds();
  const cursor = screen.getCursorScreenPoint();
  // It waits for the pointer so it can be caught, and never slides under a click.
  if (Math.hypot(cursor.x - (wander.x + width / 2), cursor.y - (wander.y + height / 2)) < CURSOR_PAUSE_RADIUS) {
    restWander(1500);
    return;
  }
  if (Date.now() < wander.restUntil) return;
  if (!wander.target) {
    wander.target = randomSpot(workAreaAt({ x: Math.round(wander.x), y: Math.round(wander.y) }), width, height);
    wander.facing = wander.target.x < wander.x ? -1 : 1;
    wander.walking = true;
    sendWalk(true, wander.facing);
  }
  const speed = percent !== null && percent >= TIRED_FROM ? TIRED_WALK_SPEED : WALK_SPEED;
  const next = stepToward(wander, wander.target, (speed * WANDER_TICK_MS) / 1000);
  wander.x = next.x;
  wander.y = next.y;
  settings.anchor = { x: Math.round(next.x), y: Math.round(next.y) };
  win.setBounds({ ...settings.anchor, width, height });
  if (next.arrived) {
    restWander(restAfterWalk());
    saveSettings();
  }
}

function startWander() {
  const { x, y } = win.getBounds();
  wander = {
    x,
    y,
    facing: 1,
    target: null,
    walking: false,
    restUntil: Date.now() + 1500,
    timer: setInterval(stepWander, WANDER_TICK_MS),
  };
}

function stopWander() {
  if (!wander) return;
  clearInterval(wander.timer);
  const wasWalking = wander.walking;
  wander = null;
  if (wasWalking) sendWalk(false, 1);
}

function syncWander() {
  const shouldWalk = settings.wander && settings.mode === 'mascot';
  if (shouldWalk && !wander) startWander();
  if (!shouldWalk) stopWander();
}

function setWander(enabled) {
  settings.wander = enabled;
  saveSettings();
  syncWander();
}

function setActivities(enabled) {
  settings.activities = enabled;
  saveSettings();
  pushUpdate();
}

function toggleMode() {
  if (settings.mode === 'mascot') {
    setMode('panel');
    return;
  }
  win.webContents.send('ui:closing');
  setTimeout(() => setMode('mascot'), 130);
}

function createWindow() {
  win = new BrowserWindow({
    ...boundsForMode(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Never takes the focus from what you are typing in.
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Other topmost windows and fullscreen apps can push it behind; claim the top again.
  setInterval(() => {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
  }, 15_000);
}

function stepGesture() {
  const cursor = screen.getCursorScreenPoint();
  const dx = cursor.x - gesture.cursor.x;
  const dy = cursor.y - gesture.cursor.y;
  if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  gesture.moved = true;
  const start = gesture.bounds;
  win.setBounds(
    gesture.kind === 'resize'
      ? resizeBounds(start, gesture.dir, dx, dy)
      : { ...start, x: start.x + dx, y: start.y + dy },
  );
}

function beginGesture(_event, request) {
  if (!win || gesture) return;
  const isResize = request.kind === 'resize' && /^[nsew]{1,2}$/.test(request.dir || '');
  if (isResize && settings.mode !== 'panel') return;
  gesture = {
    kind: isResize ? 'resize' : 'drag',
    dir: request.dir,
    isTap: request.tap === true,
    moved: false,
    cursor: screen.getCursorScreenPoint(),
    bounds: win.getBounds(),
    timer: setInterval(stepGesture, 16),
  };
}

function endGesture() {
  if (!gesture) return;
  clearInterval(gesture.timer);
  const { moved, isTap, kind } = gesture;
  gesture = null;
  if (!moved) {
    if (isTap) toggleMode();
    return;
  }
  const bounds = win.getBounds();
  settings.anchor = { x: bounds.x, y: bounds.y };
  if (wander) {
    wander.x = bounds.x;
    wander.y = bounds.y;
    wander.target = null;
  }
  if (kind === 'resize') settings.panelSize = { width: bounds.width, height: bounds.height };
  saveSettings();
}

function pollInterval() {
  return settings.mode === 'panel' ? POLL_PANEL_MS : POLL_MASCOT_MS;
}

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(refresh, delay);
}

function accountSession() {
  return session.fromPartition(PARTITION);
}

async function activeOrgFromCookie() {
  const cookies = await accountSession().cookies.get({ url: BASE_URL, name: 'lastActiveOrg' });
  return cookies[0] ? cookies[0].value : null;
}

async function refresh() {
  if (demoUsage) {
    usage = { status: 'ok', updatedAt: Date.now(), ...demoUsage };
    pushUpdate();
    return;
  }
  clearTimeout(pollTimer);
  let delay = pollInterval();
  try {
    const fetcher = (apiPath) =>
      accountSession().fetch(BASE_URL + apiPath, { headers: { accept: 'application/json' } });
    const fresh = await fetchUsage(fetcher, await activeOrgFromCookie());
    failures = 0;
    usage = { status: 'ok', updatedAt: Date.now(), ...fresh };
    if (loginWin) loginWin.close();
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    failures += 1;
    usage = { ...usage, status: error.kind };
    delay = error.retryAfterSec
      ? error.retryAfterSec * 1000
      : Math.min(pollInterval() * 2 ** failures, POLL_MAX_MS);
    if (error.kind === 'signedOut') usage = { status: 'signedOut', five: null, week: null, updatedAt: null };
  }
  pushUpdate();
  schedulePoll(delay);
}

function openLogin() {
  if (loginWin) {
    loginWin.focus();
    return;
  }
  loginWin = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'Cuadrito',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const checkAfterNavigation = (_event, url) => {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'claude.ai' && !/^\/(login|magic-link|sso)/.test(pathname)) schedulePoll(300);
  };
  loginWin.webContents.on('did-navigate', checkAfterNavigation);
  loginWin.webContents.on('did-navigate-in-page', checkAfterNavigation);
  loginWin.on('closed', () => {
    loginWin = null;
    schedulePoll(0);
  });
  loginWin.loadURL(`${BASE_URL}/login`);
}

async function signOut() {
  await accountSession().clearStorageData();
  failures = 0;
  usage = { status: 'signedOut', five: null, week: null, updatedAt: null };
  pushUpdate();
}

function startPath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function radioItems(levels, current, apply) {
  return Object.entries(levels).map(([key, value]) => ({
    label: t(key),
    type: 'radio',
    checked: current === value,
    click: () => apply(value),
  }));
}

function buildMenu() {
  const signedIn = usage.status !== 'signedOut';
  return Menu.buildFromTemplate([
    { label: t('menuRefresh'), click: () => schedulePoll(0) },
    { type: 'separator' },
    {
      label: t('menuTransparency'),
      submenu: radioItems(GLASS_LEVELS, settings.glass, setGlass),
    },
    {
      label: t('menuSize'),
      submenu: radioItems(MASCOT_SIZES, settings.mascotSize, (size) => {
        settings.mascotSize = size;
        if (settings.mode === 'mascot') win.setBounds(boundsForMode());
        saveSettings();
        pushUpdate();
      }),
    },
    {
      label: t('menuActivities'),
      type: 'checkbox',
      checked: settings.activities,
      click: (item) => setActivities(item.checked),
    },
    {
      label: t('menuWander'),
      type: 'checkbox',
      checked: settings.wander,
      click: (item) => setWander(item.checked),
    },
    { label: t('menuExpressions'), click: openCustomPack },
    {
      label: t('menuAutostart'),
      type: 'checkbox',
      enabled: app.isPackaged,
      checked: app.getLoginItemSettings({ path: startPath() }).openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: startPath() }),
    },
    { type: 'separator' },
    signedIn
      ? { label: t('menuSignOut'), click: signOut }
      : { label: t('menuSignIn'), click: openLogin },
    { label: t('menuQuit'), click: () => app.quit() },
  ]);
}

function setGlass(value) {
  settings.glass = value;
  saveSettings();
  pushUpdate();
}

function cycleGlass() {
  const levels = Object.values(GLASS_LEVELS);
  const at = levels.indexOf(settings.glass);
  setGlass(levels[(at + 1) % levels.length]);
}

function currentState() {
  const percent = Sprite.worstPercent(usage.five, usage.week, Date.now());
  return percent === null ? Sprite.stateById(pack, 'unknown') : Sprite.stateForPercent(pack, percent);
}

function updateTray() {
  if (!tray) return;
  const state = currentState();
  const pixels = Sprite.rasterize(state.frames[0], Sprite.paletteFor(state), 2);
  const bgra = Buffer.from(pixels);
  for (let i = 0; i < bgra.length; i += 4) {
    [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
  }
  const iconSize = Sprite.GRID * 2;
  tray.setImage(nativeImage.createFromBitmap(bgra, { width: iconSize, height: iconSize, scaleFactor: 2 }));
  const percent = (limit) => {
    const live = Sprite.livePercent(limit, Date.now());
    return live === null ? '—' : `${Math.round(live)}%`;
  };
  tray.setToolTip(`Cuadrito · ${t('five')} ${percent(usage.five)} · ${t('week')} ${percent(usage.week)}`);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.on('click', () => {
    if (win) win.showInactive();
  });
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  updateTray();
}

function sendFromUi(event) {
  return win && event.sender === win.webContents;
}

function registerIpc() {
  ipcMain.on('gesture:begin', (event, request) => {
    if (sendFromUi(event)) beginGesture(event, request);
  });
  ipcMain.on('gesture:end', (event) => {
    if (sendFromUi(event)) endGesture();
  });
  ipcMain.on('menu:open', (event) => {
    if (sendFromUi(event)) buildMenu().popup({ window: win });
  });
  ipcMain.on('glass:cycle', (event) => {
    if (sendFromUi(event)) cycleGlass();
  });
  ipcMain.on('usage:refresh', (event) => {
    if (sendFromUi(event)) schedulePoll(0);
  });
  ipcMain.on('auth:signin', (event) => {
    if (sendFromUi(event)) openLogin();
  });
  ipcMain.on('ui:ready', (event) => {
    if (sendFromUi(event)) pushUpdate();
  });
}

async function start() {
  t = I18n.forLocale(app.getLocale());
  settings = loadSettings();
  if (!settings.anchor) settings.anchor = defaultAnchor();
  // Older versions offered other sizes; take the closest one.
  settings.mascotSize = Object.values(MASCOT_SIZES).reduce((best, size) =>
    Math.abs(size - settings.mascotSize) < Math.abs(best - settings.mascotSize) ? size : best);
  settings.panelSize = {
    width: Math.max(settings.panelSize.width, PANEL_MIN.width),
    height: Math.max(settings.panelSize.height, PANEL_MIN.height),
  };
  loadPack();
  watchCustomPack();

  // Sign-in pages reject user agents that name an embedded runtime.
  const ses = accountSession();
  ses.setUserAgent(ses.getUserAgent().replace(/\s(cuadrito|Electron)\/\S+/gi, ''));
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  registerIpc();
  createWindow();
  createTray();

  powerMonitor.on('suspend', () => clearTimeout(pollTimer));
  powerMonitor.on('resume', () => schedulePoll(1000));

  syncWander();
  app.on('before-quit', saveSettings);

  await refresh();
  if (usage.status === 'signedOut' && !demoUsage) openLogin();

  if (process.env.CUADRITO_SMOKE_DIR) {
    require('./smoke').run({ app, getWindow: () => win, getSettings: () => settings, setUsage: (next) => {
      usage = { status: 'ok', updatedAt: Date.now(), ...next };
      pushUpdate();
    }, setGlass, setMode, setWander });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) win.showInactive();
  });
  app.on('window-all-closed', () => {
    // The login window closing must not end the app; only Quit does.
  });
  app.whenReady().then(start);
}
