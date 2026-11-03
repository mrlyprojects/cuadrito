'use strict';
// Writes build/icon.png from the happy frame. Run with: npm run make:icon
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');
const Sprite = require('../src/sprite');

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'expressions.default.json'), 'utf8'));
const state = Sprite.stateById(pack, 'happy');
const scale = 32; // 16 * 32 = 512 px, enough for every target.
const pixels = Buffer.from(Sprite.rasterize(state.frames[0], Sprite.paletteFor(state), scale));
for (let i = 0; i < pixels.length; i += 4) {
  [pixels[i], pixels[i + 2]] = [pixels[i + 2], pixels[i]];
}
const size = Sprite.GRID * scale;
const image = nativeImage.createFromBitmap(pixels, { width: size, height: size });
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), image.toPNG());
app.exit(0);
