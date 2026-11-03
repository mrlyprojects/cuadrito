'use strict';
// Draws every mood and activity frame on one sheet. Run with: npx electron scripts/preview.js <out.png>
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');
const Sprite = require('../src/sprite');

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'expressions.default.json'), 'utf8'));
const SCALE = 6;
const GAP = 8;
const CELL = Sprite.GRID * SCALE + GAP;
const BACKGROUND = [132, 126, 120]; // BGR

const moods = pack.states;
const happy = Sprite.stateById(pack, 'happy');
const lines = [
  ...moods.map((state) => ({ state, frames: state.frames })),
  { state: happy, frames: pack.walk.frames },
  ...pack.activities.map((activity) => ({ state: happy, frames: activity.frames })),
];
const columns = Math.max(...lines.map((l) => l.frames.length));
const width = columns * CELL + GAP;
const height = lines.length * CELL + GAP;
const sheet = Buffer.alloc(width * height * 4);
for (let i = 0; i < sheet.length; i += 4) {
  [sheet[i], sheet[i + 1], sheet[i + 2]] = BACKGROUND;
  sheet[i + 3] = 255;
}

lines.forEach((entry, row) => {
  entry.frames.forEach((frame, column) => {
    const pixels = Sprite.rasterize(frame, Sprite.paletteFor(entry.state), SCALE);
    const size = Sprite.GRID * SCALE;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = (y * size + x) * 4;
        if (pixels[from + 3] === 0) continue;
        const to = ((GAP + row * CELL + y) * width + GAP + column * CELL + x) * 4;
        sheet[to] = pixels[from + 2];
        sheet[to + 1] = pixels[from + 1];
        sheet[to + 2] = pixels[from];
      }
    }
  });
});

fs.writeFileSync(process.argv[2], nativeImage.createFromBitmap(sheet, { width, height }).toPNG());
app.exit(0);
