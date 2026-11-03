'use strict';
// Visual check driven by `npm run smoke`: draws every state and writes PNGs. No real mouse input.
const fs = require('fs');
const path = require('path');
const { screen } = require('electron');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const inHours = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function capture(win, dir, name) {
  await wait(250);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
}

async function tap(win, x, y) {
  win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await wait(60);
  win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  await wait(400);
}

async function run({ app, getWindow, getSettings, setUsage, setGlass, setMode, setWander }) {
  const dir = process.env.CUADRITO_SMOKE_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const win = getWindow();
  await wait(800);

  setMode('mascot');
  for (const percent of [12, 50, 72, 88, 97, 100]) {
    setUsage({ five: { percent, resetsAt: inHours(2) }, week: { percent: 3, resetsAt: inHours(40) } });
    await capture(win, dir, `mascot-${percent}`);
  }

  await tap(win, 20, 20);
  const expanded = getSettings().mode;
  console.log(`tap on character expands: ${expanded === 'panel'} (mode ${expanded})`);

  setUsage({ five: { percent: 18, resetsAt: inHours(1.5) }, week: { percent: 81, resetsAt: inHours(30) } });
  await capture(win, dir, 'panel-default');
  setGlass(0.45);
  await capture(win, dir, 'panel-semi');
  setGlass(0.96);

  for (const [name, width, height] of [['small', 170, 66], ['wide', 620, 110], ['tall', 240, 300]]) {
    win.setBounds({ ...win.getBounds(), width, height });
    await capture(win, dir, `panel-${name}`);
  }

  win.setBounds({ ...win.getBounds(), width: 290, height: 96 });
  await wait(150);
  await tap(win, 24, 40);
  await wait(300);
  const collapsed = getSettings().mode;
  console.log(`tap on character collapses: ${collapsed === 'mascot'} (mode ${collapsed})`);

  setUsage({ five: { percent: 10, resetsAt: inHours(2) }, week: { percent: 3, resetsAt: inHours(40) } });
  await win.webContents.executeJavaScript('startActivity()');
  await wait(200);
  const playing = await win.webContents.executeJavaScript('currentActivity && currentActivity.id');
  console.log(`plays an activity: ${Boolean(playing)} (${playing})`);
  await capture(win, dir, 'activity');

  const before = win.getBounds();
  setWander(true);
  const samples = [];
  for (let i = 0; i < 20; i++) {
    await wait(500);
    const { x, y } = win.getBounds();
    samples.push(`${(await win.webContents.executeJavaScript('isWalking')) ? 'W' : '-'}${x},${y}`);
  }
  const after = win.getBounds();
  console.log(`wander samples: ${samples.join(' ')}`);
  console.log(`cursor: ${JSON.stringify(screen.getCursorScreenPoint())}`);
  console.log(`wander moves the window: ${before.x !== after.x || before.y !== after.y}  size kept: ${before.width === after.width}`);
  setWander(false);
  await wait(100);
  console.log(`wander stops: ${!(await win.webContents.executeJavaScript('isWalking'))}`);

  console.log(`window on top: ${win.isAlwaysOnTop()}  bounds: ${JSON.stringify(win.getBounds())}`);
  app.exit(0);
}

module.exports = { run };
