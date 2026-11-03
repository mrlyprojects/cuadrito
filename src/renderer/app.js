'use strict';
const api = window.cuadrito;
const t = I18n.forLocale(navigator.language);
const motionOk = !matchMedia('(prefers-reduced-motion: reduce)').matches;

const body = document.body;
const root = document.getElementById('root');
const card = document.getElementById('card');
const buddy = document.getElementById('buddy');
const sprite = document.getElementById('sprite');
const context = sprite.getContext('2d');
const notice = document.getElementById('notice');
const noticeText = document.getElementById('notice-text');
const signin = document.getElementById('signin');
const updated = document.getElementById('updated');

const rows = {
  five: bindRow('limit-five', t('five')),
  week: bindRow('limit-week', t('week')),
};

let latest = null;
let currentStateId = null;
let frameIndex = 0;
let frameTimer = null;
let lastWorst = null;
let lastPackText = null;
let currentState = null;
let currentActivity = null;
let lastActivityId = null;
let activityTimer = null;
let isWalking = false;

function bindRow(id, label) {
  const el = document.getElementById(id);
  el.querySelector('.name').textContent = label;
  return {
    el,
    fill: el.querySelector('.fill'),
    pct: el.querySelector('.pct'),
    reset: el.querySelector('.reset'),
  };
}

function formatSpan(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatAge(ms) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} s` : formatSpan(ms);
}

function drawRows(rows, state) {
  const pixels = Sprite.rasterize(rows, Sprite.paletteFor(state));
  context.putImageData(new ImageData(pixels, Sprite.GRID, Sprite.GRID), 0, 0);
}

function drawFrame(state) {
  drawRows(state.frames[frameIndex % state.frames.length], state);
}

function nextBlinkDelay() {
  return 2500 + Math.random() * 3500;
}

function animate(state) {
  clearTimeout(frameTimer);
  frameIndex = 0;
  drawFrame(state);
  if (!motionOk || state.frames.length < 2) return;
  if (state.animation === 'loop') {
    const step = () => {
      frameIndex += 1;
      drawFrame(state);
      frameTimer = setTimeout(step, state.frameMs || 700);
    };
    frameTimer = setTimeout(step, state.frameMs || 700);
    return;
  }
  const blink = () => {
    frameIndex = 1;
    drawFrame(state);
    frameTimer = setTimeout(() => {
      frameIndex = 0;
      drawFrame(state);
      frameTimer = setTimeout(blink, nextBlinkDelay());
    }, 140);
  };
  frameTimer = setTimeout(blink, nextBlinkDelay());
}

function canAct() {
  return motionOk && latest && latest.mode === 'mascot' && latest.activities && !isWalking;
}

function endActivity() {
  buddy.classList.remove('spin');
  currentActivity = null;
  clearTimeout(frameTimer);
  if (currentState) animate(currentState);
}

function queueActivity() {
  clearTimeout(activityTimer);
  activityTimer = setTimeout(startActivity, 6000 + Math.random() * 12000);
}

function playFrames(item, onDone) {
  const total = item.loops ? item.frames.length * item.loops : Infinity;
  let at = 0;
  const step = () => {
    if (at >= total) {
      onDone();
      return;
    }
    // Reads currentState each frame, so the color follows usage mid-activity.
    drawRows(item.frames[at % item.frames.length], currentState);
    at += 1;
    frameTimer = setTimeout(step, item.frameMs || 300);
  };
  clearTimeout(frameTimer);
  step();
}

function startActivity() {
  if (!canAct() || currentActivity || !currentState) {
    queueActivity();
    return;
  }
  const worst = Sprite.worstPercent(latest.usage.five, latest.usage.week, Date.now());
  const options = Sprite.activitiesFor(latest.pack, worst);
  const fresh = options.filter((a) => a.id !== lastActivityId);
  const choices = fresh.length ? fresh : options;
  if (worst === null || choices.length === 0) {
    queueActivity();
    return;
  }
  currentActivity = choices[Math.floor(Math.random() * choices.length)];
  lastActivityId = currentActivity.id;
  if (currentActivity.spin) buddy.classList.add('spin');
  playFrames(currentActivity, () => {
    endActivity();
    queueActivity();
  });
}

function hop() {
  if (!motionOk) return;
  buddy.classList.remove('hop');
  void buddy.offsetWidth;
  buddy.classList.add('hop');
}

function renderRow(row, limit, pack, now) {
  const live = Sprite.livePercent(limit, now);
  if (live === null) {
    row.fill.style.width = '0%';
    row.pct.textContent = '—';
    row.reset.textContent = '';
    row.el.title = '';
    return;
  }
  const state = Sprite.stateForPercent(pack, live);
  row.fill.style.width = `${live}%`;
  row.fill.style.backgroundColor = state.color;
  row.pct.textContent = `${Math.round(live)}%`;
  const resetMs = limit.resetsAt ? Date.parse(limit.resetsAt) : null;
  row.reset.textContent = resetMs === null ? '' : resetMs <= now ? t('over') : formatSpan(resetMs - now);
  row.el.title = resetMs === null
    ? ''
    : t('resetsOn', { d: new Date(resetMs).toLocaleString(navigator.language, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) });
}

function noticeFor(status, packError) {
  if (status === 'signedOut') return t('signedOut');
  if (status === 'offline' || status === 'rateLimited' || status === 'blocked' || status === 'format') return t(status);
  if (status === 'loading') return t('loading');
  if (packError) return t('badExpressions', { e: packError });
  return '';
}

function render() {
  if (!latest) return;
  const { usage, pack, packError } = latest;
  const now = Date.now();

  renderRow(rows.five, usage.five, pack, now);
  renderRow(rows.week, usage.week, pack, now);

  const worst = Sprite.worstPercent(usage.five, usage.week, now);
  const state = worst === null ? Sprite.stateById(pack, 'unknown') : Sprite.stateForPercent(pack, worst);
  currentState = state;
  if (state.id !== currentStateId) {
    currentStateId = state.id;
    if (!currentActivity && !isWalking) animate(state);
  }
  if (lastWorst !== null && worst !== null && worst > lastWorst) hop();
  lastWorst = worst;

  const message = noticeFor(usage.status, packError);
  notice.hidden = !message;
  noticeText.textContent = message;
  noticeText.title = message;
  // Only the sign-in message may take the room of the limits: there are none to show.
  notice.classList.toggle('compact', usage.status !== 'signedOut');
  signin.hidden = usage.status !== 'signedOut';
  rows.five.el.hidden = usage.status === 'signedOut';
  rows.week.el.hidden = usage.status === 'signedOut';

  if (usage.updatedAt) {
    const age = now - usage.updatedAt;
    updated.textContent = age < 5000 ? t('updatedNow') : t('updatedAgo', { t: formatAge(age) });
  } else {
    updated.textContent = '';
  }

  const percentText = (limit) => {
    const live = Sprite.livePercent(limit, now);
    return live === null ? '—' : `${Math.round(live)}%`;
  };
  buddy.title = `${t('five')} ${percentText(usage.five)} · ${t('week')} ${percentText(usage.week)}`;
}

function applyLayout() {
  const { width, height } = root.getBoundingClientRect();
  if (!latest) return;
  if (latest.mode === 'mascot') {
    buddy.style.width = buddy.style.height = `${latest.mascotSize}px`;
    return;
  }
  const isTall = height / width > 0.85;
  card.classList.toggle('tall', isTall);
  card.classList.toggle('narrow', width < 235 && !isTall);
  card.classList.toggle('short', height < 84);

  const scale = isTall
    ? Math.min(width / 210, height / 210)
    : Math.min(width / 280, height / 92);
  root.style.setProperty('--scale', String(Math.min(Math.max(scale, 0.85), 2.6)));

  // Whole multiples of the grid keep the pixels square.
  const room = isTall ? Math.min(width * 0.5, height * 0.4) : Math.min(height - 22, width * 0.26);
  const size = Math.max(28, Math.floor(room / Sprite.GRID) * Sprite.GRID);
  buddy.style.width = buddy.style.height = `${size}px`;
}

api.onUpdate((update) => {
  // An edited expressions file arrives as a new pack: draw it right away.
  const packText = JSON.stringify(update.pack);
  if (packText !== lastPackText) {
    lastPackText = packText;
    currentStateId = null;
  }
  latest = update;
  body.className = `mode-${update.mode}`;
  root.style.setProperty('--glass', String(update.glass));
  card.classList.toggle('thin', update.glass < 0.6);
  applyLayout();
  render();
  if (currentActivity && !canAct()) endActivity();
  if (update.animate && motionOk) {
    card.classList.remove('closing');
    card.classList.remove('opening');
    void card.offsetWidth;
    card.classList.add('opening');
  }
});

api.onClosing(() => {
  if (motionOk) card.classList.add('closing');
});

api.onWalk(({ walking, facing }) => {
  isWalking = walking;
  sprite.classList.toggle('flip', facing < 0);
  if (currentActivity) endActivity();
  if (walking && motionOk && latest && latest.pack.walk) {
    playFrames(latest.pack.walk, () => {});
  } else if (currentState) {
    clearTimeout(frameTimer);
    animate(currentState);
  }
});

card.addEventListener('animationend', () => {
  card.classList.remove('opening', 'closing');
});

new ResizeObserver(applyLayout).observe(root);
setInterval(render, 1000);

function beginGesture(event, request) {
  if (event.button !== 0) return;
  const target = event.currentTarget;
  target.setPointerCapture(event.pointerId);
  api.beginGesture(request);
  const finish = () => {
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    target.removeEventListener('lostpointercapture', finish);
    api.endGesture();
  };
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
  target.addEventListener('lostpointercapture', finish);
}

buddy.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
  beginGesture(event, { kind: 'drag', tap: true });
});
card.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button')) return;
  beginGesture(event, { kind: 'drag' });
});
for (const handle of document.querySelectorAll('.handle')) {
  handle.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    beginGesture(event, { kind: 'resize', dir: handle.dataset.dir });
  });
}

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api.openMenu();
});

document.getElementById('glass').title = t('glass');
document.getElementById('refresh').title = t('refresh');
signin.textContent = t('signIn');
document.getElementById('glass').addEventListener('click', () => api.cycleGlass());
document.getElementById('refresh').addEventListener('click', () => api.refresh());
signin.addEventListener('click', () => api.signIn());

queueActivity();
api.ready();
