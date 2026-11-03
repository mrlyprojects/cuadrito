'use strict';
// Builds src/expressions.default.json. Run with: npm run gen:expressions
// The output is what people edit to customize the character, one text row per pixel row.

const fs = require('fs');
const path = require('path');

const SIZE = 16;

function blank() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
}

function put(grid, x, y, pixel) {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y][x] = pixel;
}

function line(grid, x1, x2, y, pixel) {
  for (let x = x1; x <= x2; x++) put(grid, x, y, pixel);
}

function box(grid, x1, x2, y1, y2, pixel) {
  for (let y = y1; y <= y2; y++) line(grid, x1, x2, y, pixel);
}

function body(grid, { dx = 0, dy = 0, left = 8, right = 8, legA = 2, legB = 2 } = {}) {
  line(grid, 4 + dx, 11 + dx, 5 + dy, 'A');
  put(grid, 3 + dx, 6 + dy, 'A');
  line(grid, 4 + dx, 12 + dx, 6 + dy, 'B');
  box(grid, 3 + dx, 12 + dx, 7 + dy, 11 + dy, 'B');
  line(grid, 4 + dx, 11 + dx, 12 + dy, 'D');
  if (left !== null) box(grid, 2 + dx, 2 + dx, left + dy, left + 1 + dy, 'B');
  if (right !== null) box(grid, 13 + dx, 13 + dx, right + dy, right + 1 + dy, 'B');
  if (legA) box(grid, 5 + dx, 6 + dx, 13 + dy, 12 + legA + dy, 'D');
  if (legB) box(grid, 9 + dx, 10 + dx, 13 + dy, 12 + legB + dy, 'D');
}

function eyes(grid, { dx = 0, dy = 0, shift = 0 } = {}) {
  box(grid, 5 + dx + shift, 5 + dx + shift, 7 + dy, 8 + dy, 'E');
  box(grid, 10 + dx + shift, 10 + dx + shift, 7 + dy, 8 + dy, 'E');
}

function closedEyes(grid, { dx = 0, dy = 0 } = {}) {
  line(grid, 4 + dx, 5 + dx, 8 + dy, 'E');
  line(grid, 10 + dx, 11 + dx, 8 + dy, 'E');
}

function cheeks(grid, { dx = 0, dy = 0 } = {}) {
  put(grid, 4 + dx, 9 + dy, 'C');
  put(grid, 11 + dx, 9 + dy, 'C');
}

function smile(grid, { dx = 0, dy = 0 } = {}) {
  line(grid, 7 + dx, 8 + dx, 10 + dy, 'E');
}

function frame(draw) {
  const grid = blank();
  draw(grid);
  return grid.map((row) => row.join(''));
}

function zee(grid, x, y) {
  line(grid, x, x + 3, y, 'Z');
  put(grid, x + 2, y + 1, 'Z');
  put(grid, x + 1, y + 2, 'Z');
  line(grid, x, x + 3, y + 3, 'Z');
}

const happy = frame((g) => { body(g); eyes(g); cheeks(g); smile(g); });
const happyBlink = frame((g) => { body(g); closedEyes(g); cheeks(g); smile(g); });
const calm = frame((g) => { body(g); eyes(g); });
const calmBlink = frame((g) => { body(g); closedEyes(g); });

function sweat(g, y) {
  box(g, 14, 14, y, y + 1, 'S');
}

function laptopFrame(leftArm, rightArm, spark) {
  return frame((g) => {
    body(g, { left: null, right: null });
    box(g, 5, 5, 8, 8, 'E');
    box(g, 10, 10, 8, 8, 'E');
    box(g, 4, 11, 10, 12, 'K');
    line(g, 7, 8, 11, 'L');
    line(g, 2, 13, 13, 'L');
    box(g, 3, 3, leftArm, leftArm + 1, 'D');
    box(g, 12, 12, rightArm, rightArm + 1, 'D');
    if (spark) put(g, spark[0], spark[1], 'G');
  });
}

function weightsFrame(barY, dy, effort) {
  return frame((g) => {
    body(g, { dy, left: null, right: null });
    if (effort) closedEyes(g, { dy });
    else eyes(g, { dy });
    box(g, 3, 3, barY + 1, 5 + dy, 'B');
    box(g, 12, 12, barY + 1, 5 + dy, 'B');
    line(g, 1, 14, barY, 'M');
    box(g, 0, 1, barY - 1, barY + 1, 'K');
    box(g, 14, 15, barY - 1, barY + 1, 'K');
  });
}

function noseFrame(arm, booger, { squint = false, shift = 0 } = {}) {
  return frame((g) => {
    body(g, { right: null });
    if (squint) {
      eyes(g);
      line(g, 9, 11, 8, 'E');
      box(g, 10, 10, 7, 7, 'B');
    } else {
      eyes(g, { shift });
    }
    arm.forEach(([x, y]) => put(g, x, y, 'D'));
    if (booger) put(g, booger[0], booger[1], 'Y');
  });
}

function paperFrame(shift, lifted) {
  return frame((g) => {
    body(g, { left: null, right: null });
    eyes(g, { shift });
    box(g, 1, 14, 9, 14, 'P');
    box(g, 7, 8, 9, 14, 'N');
    box(g, 7, 7, 9, 14, 'P');
    [10, 12].forEach((y) => {
      line(g, 2, 5, y, 'N');
      line(g, 10, 13, y, 'N');
    });
    if (lifted) {
      box(g, 9, 14, 8, 13, 'P');
      line(g, 10, 13, 9, 'N');
      line(g, 10, 12, 11, 'N');
      line(g, 9, 14, 14, 'K');
    }
  });
}

function coffeeFrame(mugY, sip, steamY) {
  return frame((g) => {
    body(g, { right: null });
    if (sip) closedEyes(g);
    else eyes(g);
    box(g, 12, 14, mugY, mugY + 2, 'O');
    put(g, 15, mugY + 1, 'O');
    put(g, 13, mugY, 'K');
    if (steamY !== null) put(g, 13, steamY, 'Z');
  });
}

const walkFrame = (legA, legB, dy) =>
  frame((g) => { body(g, { dy, legA, legB }); eyes(g, { dy, shift: 1 }); cheeks(g, { dy }); });

const dance = (left, right, dx) =>
  frame((g) => { body(g, { dx, left, right }); eyes(g, { dx }); cheeks(g, { dx }); smile(g, { dx }); });

const wave = (right) =>
  frame((g) => { body(g, { right }); eyes(g); cheeks(g); smile(g); });

const pack = {
  version: 2,
  legend: {
    '.': 'transparente / transparent',
    B: 'cuerpo / body',
    D: 'cuerpo oscuro / body shade',
    A: 'cuerpo claro / body light',
    E: 'ojos y boca / eyes and mouth',
    C: 'mejillas / cheeks',
    S: 'sudor / sweat',
    Z: 'zzz y signos / zzz and marks',
    K: 'objeto oscuro / dark object',
    L: 'objeto claro / light object',
    M: 'metal',
    G: 'chispa de codigo / code spark',
    P: 'papel / paper',
    N: 'tinta / ink',
    O: 'taza / mug',
    Y: 'moco / booger',
  },
  states: [
    {
      id: 'happy',
      upTo: 40,
      color: '#DFA088',
      animation: 'blink',
      frames: [happy, happyBlink],
    },
    {
      id: 'content',
      upTo: 60,
      color: '#D4B98E',
      animation: 'blink',
      frames: [calm, calmBlink],
    },
    {
      id: 'worried',
      upTo: 80,
      color: '#C49F80',
      animation: 'blink',
      frames: [
        frame((g) => { body(g); eyes(g); line(g, 7, 8, 10, 'D'); sweat(g, 5); }),
        frame((g) => { body(g); closedEyes(g); line(g, 7, 8, 10, 'D'); sweat(g, 5); }),
      ],
    },
    {
      id: 'tired',
      upTo: 92,
      color: '#B5877F',
      animation: 'loop',
      frameMs: 900,
      frames: [
        frame((g) => { body(g, { dy: 1, legA: 1, legB: 1 }); closedEyes(g, { dy: 1 }); sweat(g, 5); }),
        frame((g) => { body(g, { dy: 1, legA: 1, legB: 1 }); closedEyes(g, { dy: 1 }); box(g, 7, 8, 11, 12, 'E'); sweat(g, 7); }),
      ],
    },
    {
      id: 'exhausted',
      upTo: 99.99,
      color: '#9E8A92',
      animation: 'loop',
      frameMs: 800,
      frames: [
        frame((g) => { body(g, { dy: 2, left: 9, right: 9, legA: 1, legB: 1 }); closedEyes(g, { dy: 2 }); sweat(g, 6); put(g, 1, 7, 'S'); }),
        frame((g) => { body(g, { dy: 2, left: 9, right: 9, legA: 1, legB: 1 }); closedEyes(g, { dy: 2 }); sweat(g, 8); put(g, 1, 9, 'S'); }),
      ],
    },
    {
      id: 'limit',
      upTo: 100,
      color: '#8F9099',
      animation: 'loop',
      frameMs: 1000,
      frames: [
        frame((g) => { body(g, { dy: 3, left: 10, right: 10, legA: 0, legB: 0 }); closedEyes(g, { dy: 3 }); zee(g, 8, 2); }),
        frame((g) => { body(g, { dy: 3, left: 10, right: 10, legA: 0, legB: 0 }); closedEyes(g, { dy: 3 }); zee(g, 11, 0); }),
      ],
    },
    {
      id: 'unknown',
      color: '#A7A49C',
      animation: 'blink',
      frames: [
        frame((g) => { body(g); eyes(g); line(g, 12, 14, 0, 'Z'); put(g, 14, 1, 'Z'); put(g, 13, 2, 'Z'); put(g, 13, 4, 'Z'); }),
        frame((g) => { body(g); closedEyes(g); line(g, 12, 14, 0, 'Z'); put(g, 14, 1, 'Z'); put(g, 13, 2, 'Z'); put(g, 13, 4, 'Z'); }),
      ],
    },
  ],
  walk: {
    frameMs: 170,
    frames: [walkFrame(2, 1, 0), walkFrame(2, 2, 0), walkFrame(1, 2, 0), walkFrame(2, 2, 0)],
  },
  // maxPercent: above this usage the character is too tired for that activity.
  activities: [
    {
      id: 'laptop',
      maxPercent: 92,
      frameMs: 200,
      loops: 12,
      frames: [
        laptopFrame(9, 11, [13, 3]),
        laptopFrame(11, 9, null),
        laptopFrame(9, 11, [2, 4]),
        laptopFrame(11, 9, [12, 1]),
      ],
    },
    {
      id: 'weights',
      maxPercent: 60,
      frameMs: 300,
      loops: 5,
      frames: [
        weightsFrame(4, 1, true),
        weightsFrame(3, 1, true),
        weightsFrame(2, 0, false),
        weightsFrame(1, 0, false),
        weightsFrame(1, 0, false),
        weightsFrame(2, 0, false),
      ],
    },
    {
      id: 'nose',
      maxPercent: 80,
      frameMs: 420,
      loops: 1,
      frames: [
        noseFrame([[13, 8], [13, 9]], null),
        noseFrame([[12, 10], [11, 10], [10, 10]], null),
        noseFrame([[12, 10], [11, 10], [10, 10], [9, 10], [8, 9]], null, { squint: true }),
        noseFrame([[12, 10], [11, 10], [10, 10], [9, 10], [8, 9]], null, { squint: true }),
        noseFrame([[12, 10], [11, 10], [10, 10], [9, 9]], [9, 8], { shift: 1 }),
        noseFrame([[12, 10], [11, 10], [10, 10], [9, 9]], [9, 8], { shift: 1 }),
        noseFrame([[13, 8], [13, 9]], [12, 5]),
        noseFrame([[13, 8], [13, 9]], [14, 2]),
        noseFrame([[13, 8], [13, 9]], null),
      ],
    },
    {
      id: 'newspaper',
      maxPercent: 80,
      frameMs: 750,
      loops: 2,
      frames: [
        paperFrame(0, false),
        paperFrame(1, false),
        paperFrame(0, false),
        paperFrame(-1, false),
        paperFrame(0, true),
        paperFrame(0, false),
      ],
    },
    {
      id: 'coffee',
      maxPercent: 92,
      frameMs: 600,
      loops: 2,
      frames: [
        coffeeFrame(9, false, 7),
        coffeeFrame(9, false, 6),
        coffeeFrame(7, false, 5),
        coffeeFrame(7, true, 4),
        coffeeFrame(7, true, null),
        coffeeFrame(9, false, 7),
      ],
    },
    {
      id: 'pirouette',
      maxPercent: 60,
      frameMs: 180,
      loops: 2,
      spin: true,
      frames: [dance(6, 6, 0), dance(5, 5, 0), dance(6, 6, 0), dance(5, 5, 0)],
    },
    {
      id: 'dance',
      maxPercent: 60,
      frameMs: 260,
      loops: 6,
      frames: [dance(6, 9, 0), dance(8, 8, 1), dance(9, 6, 0), dance(8, 8, -1)],
    },
    {
      id: 'wave',
      maxPercent: 80,
      frameMs: 260,
      loops: 4,
      frames: [wave(5), wave(7)],
    },
  ],
};

fs.writeFileSync(
  path.join(__dirname, '..', 'src', 'expressions.default.json'),
  JSON.stringify(pack, null, 2) + '\n',
);
