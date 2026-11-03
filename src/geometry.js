'use strict';

const PANEL_MIN = { width: 170, height: 66 };
const PANEL_MAX = { width: 760, height: 520 };

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

// dir is any combination of n, s, e, w; the opposite edge stays put.
function resizeBounds(start, dir, dx, dy, min = PANEL_MIN, max = PANEL_MAX) {
  let { x, y, width, height } = start;
  if (dir.includes('e')) width = clamp(start.width + dx, min.width, max.width);
  if (dir.includes('s')) height = clamp(start.height + dy, min.height, max.height);
  if (dir.includes('w')) {
    width = clamp(start.width - dx, min.width, max.width);
    x = start.x + start.width - width;
  }
  if (dir.includes('n')) {
    height = clamp(start.height - dy, min.height, max.height);
    y = start.y + start.height - height;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// Moves bounds inside area without changing their size.
function fitInArea(bounds, area) {
  return {
    ...bounds,
    x: clamp(bounds.x, area.x, Math.max(area.x, area.x + area.width - bounds.width)),
    y: clamp(bounds.y, area.y, Math.max(area.y, area.y + area.height - bounds.height)),
  };
}

// One step of a walk; lands exactly on target when it is closer than distance.
function stepToward(position, target, distance) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= distance) return { x: target.x, y: target.y, arrived: true };
  return {
    x: position.x + (dx / remaining) * distance,
    y: position.y + (dy / remaining) * distance,
    arrived: false,
  };
}

// A random top-left corner that keeps a window of this size inside area.
function randomSpot(area, width, height, random = Math.random) {
  return {
    x: Math.round(area.x + random() * Math.max(0, area.width - width)),
    y: Math.round(area.y + random() * Math.max(0, area.height - height)),
  };
}

module.exports = { PANEL_MIN, PANEL_MAX, clamp, resizeBounds, fitInArea, stepToward, randomSpot };
