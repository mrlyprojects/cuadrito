// Shared by the main process (tray icon, tests) and the sandboxed renderer.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sprite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GRID = 16;
  const PIXELS = '.BDAECSZKLMGPNOY';

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }

  function paletteFor(state) {
    const body = hexToRgb(state.color);
    return {
      B: body,
      D: mix(body, [0, 0, 0], 0.3),
      A: mix(body, [255, 255, 255], 0.35),
      E: [46, 42, 39],
      C: mix(body, [217, 120, 110], 0.5),
      S: [169, 198, 212],
      Z: [215, 211, 200],
      K: [74, 71, 68],
      L: [184, 179, 168],
      M: [142, 139, 133],
      G: [168, 200, 160],
      P: [230, 225, 211],
      N: [166, 161, 150],
      O: [239, 234, 224],
      Y: [185, 196, 138],
    };
  }

  // scale repeats each pixel, for the tray icon; the canvas scales through CSS.
  function rasterize(rows, palette, scale = 1) {
    const size = GRID * scale;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      const row = rows[Math.floor(y / scale)];
      for (let x = 0; x < size; x++) {
        const color = palette[row[Math.floor(x / scale)]];
        if (!color) continue;
        const at = (y * size + x) * 4;
        data[at] = color[0];
        data[at + 1] = color[1];
        data[at + 2] = color[2];
        data[at + 3] = 255;
      }
    }
    return data;
  }

  function framesProblem(name, frames) {
    if (!Array.isArray(frames) || frames.length === 0) return `${name}: sin frames`;
    for (const frame of frames) {
      if (!Array.isArray(frame) || frame.length !== GRID) return `${name}: cada frame lleva ${GRID} filas`;
      for (const row of frame) {
        if (typeof row !== 'string' || row.length !== GRID) return `${name}: cada fila lleva ${GRID} pixeles`;
        if ([...row].some((pixel) => !PIXELS.includes(pixel))) return `${name}: pixel desconocido en "${row}"`;
      }
    }
    return null;
  }

  function validatePack(pack) {
    if (!pack || !Array.isArray(pack.states)) return 'falta "states"';
    const byPercent = pack.states.filter((s) => typeof s.upTo === 'number');
    if (!byPercent.some((s) => s.upTo >= 100)) return 'ningun estado llega a upTo 100';
    if (!pack.states.some((s) => s.id === 'unknown')) return 'falta el estado "unknown"';
    for (const state of pack.states) {
      if (!/^#[0-9a-fA-F]{6}$/.test(state.color || '')) return `${state.id}: color invalido`;
      const problem = framesProblem(state.id, state.frames);
      if (problem) return problem;
    }
    if (pack.walk) {
      const problem = framesProblem('walk', pack.walk.frames);
      if (problem) return problem;
    }
    if (pack.activities !== undefined && !Array.isArray(pack.activities)) return '"activities" debe ser una lista';
    for (const activity of pack.activities || []) {
      const problem = framesProblem(activity.id, activity.frames);
      if (problem) return problem;
    }
    return null;
  }

  function stateForPercent(pack, percent) {
    const ordered = pack.states
      .filter((s) => typeof s.upTo === 'number')
      .sort((a, b) => a.upTo - b.upTo);
    return ordered.find((s) => percent <= s.upTo) || ordered[ordered.length - 1];
  }

  function stateById(pack, id) {
    return pack.states.find((s) => s.id === id);
  }

  // Past its limit the character is too tired for the activity.
  function activitiesFor(pack, percent) {
    return (pack.activities || []).filter(
      (a) => percent === null || typeof a.maxPercent !== 'number' || percent <= a.maxPercent,
    );
  }

  // A window past its reset time has started over, whatever the last reading said.
  function livePercent(limit, nowMs) {
    if (!limit) return null;
    if (limit.resetsAt && Date.parse(limit.resetsAt) <= nowMs) return 0;
    return limit.percent;
  }

  function worstPercent(five, week, nowMs) {
    const values = [livePercent(five, nowMs), livePercent(week, nowMs)].filter((v) => v !== null);
    return values.length ? Math.max(...values) : null;
  }

  return { GRID, paletteFor, rasterize, validatePack, stateForPercent, stateById, activitiesFor, livePercent, worstPercent };
});
