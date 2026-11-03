'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resizeBounds, fitInArea, stepToward, randomSpot, PANEL_MIN, PANEL_MAX } = require('../src/geometry');
const { fetchUsage, parseUsage, pickOrganization, UsageError } = require('../src/usage');
const Sprite = require('../src/sprite');

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'expressions.default.json'), 'utf8'));
const start = { x: 100, y: 100, width: 300, height: 120 };

function response(status, body, type = 'application/json', headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name === 'content-type' ? type : headers[name]) },
    json: async () => body,
  };
}

test('dragging the east edge changes only the width', () => {
  assert.deepStrictEqual(resizeBounds(start, 'e', 50, 40), { x: 100, y: 100, width: 350, height: 120 });
});

test('dragging the west edge keeps the east edge in place', () => {
  const next = resizeBounds(start, 'w', -40, 0);
  assert.strictEqual(next.x + next.width, start.x + start.width);
  assert.strictEqual(next.width, 340);
});

test('dragging the north-west corner keeps the opposite corner in place', () => {
  const next = resizeBounds(start, 'nw', 20, 10);
  assert.strictEqual(next.x + next.width, 400);
  assert.strictEqual(next.y + next.height, 220);
});

test('size stays inside the limits and the opposite edge does not creep', () => {
  const tiny = resizeBounds(start, 'nw', 5000, 5000);
  assert.strictEqual(tiny.width, PANEL_MIN.width);
  assert.strictEqual(tiny.height, PANEL_MIN.height);
  assert.strictEqual(tiny.x + tiny.width, 400);
  const huge = resizeBounds(start, 'se', 9000, 9000);
  assert.strictEqual(huge.width, PANEL_MAX.width);
  assert.strictEqual(huge.height, PANEL_MAX.height);
});

test('a panel opened near a screen edge moves back inside', () => {
  const area = { x: 0, y: 0, width: 1366, height: 768 };
  assert.deepStrictEqual(
    fitInArea({ x: 1300, y: 740, width: 290, height: 96 }, area),
    { x: 1076, y: 672, width: 290, height: 96 },
  );
});

test('parses the account usage response', () => {
  const usage = parseUsage({
    five_hour: { utilization: 18, resets_at: '2026-11-03T05:20:00+00:00' },
    seven_day: { utilization: 81.5, resets_at: null },
  });
  assert.deepStrictEqual(usage, {
    five: { percent: 18, resetsAt: '2026-11-03T05:20:00+00:00' },
    week: { percent: 81.5, resetsAt: null },
  });
});

test('a response without any limit is a format problem, not zero usage', () => {
  assert.throws(() => parseUsage({ other: 1 }), (error) => error.kind === 'format');
});

test('prefers the active organization, then one that can chat', () => {
  const orgs = [{ uuid: 'api', capabilities: ['api'] }, { uuid: 'chat', capabilities: ['chat'] }];
  assert.strictEqual(pickOrganization(orgs, 'api').uuid, 'api');
  assert.strictEqual(pickOrganization(orgs, 'gone').uuid, 'chat');
});

async function kindOf(fetcher) {
  try {
    await fetchUsage(fetcher, null);
    return 'ok';
  } catch (error) {
    assert.ok(error instanceof UsageError);
    return error.kind;
  }
}

test('classifies failures so the app shows the right message', async () => {
  assert.strictEqual(await kindOf(async () => response(401, {})), 'signedOut');
  assert.strictEqual(await kindOf(async () => response(403, {})), 'signedOut');
  assert.strictEqual(await kindOf(async () => response(403, '', 'text/html')), 'blocked');
  assert.strictEqual(await kindOf(async () => { throw new Error('dns'); }), 'offline');
  const limited = await fetchUsage(async () => response(429, {}, 'application/json', { 'retry-after': '120' }), null)
    .catch((error) => error);
  assert.strictEqual(limited.kind, 'rateLimited');
  assert.strictEqual(limited.retryAfterSec, 120);
});

test('fetches organizations, then that organization usage', async () => {
  const asked = [];
  const usage = await fetchUsage(async (apiPath) => {
    asked.push(apiPath);
    return apiPath === '/api/organizations'
      ? response(200, [{ uuid: 'abc', capabilities: ['chat'] }])
      : response(200, { five_hour: { utilization: 5, resets_at: null }, seven_day: null });
  }, null);
  assert.deepStrictEqual(asked, ['/api/organizations', '/api/organizations/abc/usage']);
  assert.strictEqual(usage.five.percent, 5);
  assert.strictEqual(usage.week, null);
});

test('the default expressions are valid', () => {
  assert.strictEqual(Sprite.validatePack(pack), null);
});

test('expression moves from happy to exhausted as usage rises', () => {
  const at = (percent) => Sprite.stateForPercent(pack, percent).id;
  assert.deepStrictEqual(
    [0, 40, 41, 60, 61, 80, 81, 92, 93, 99, 100].map(at),
    ['happy', 'happy', 'content', 'content', 'worried', 'worried', 'tired', 'tired', 'exhausted', 'exhausted', 'limit'],
  );
});

test('colors stay muted', () => {
  for (const state of pack.states) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(state.color.slice(i, i + 2), 16));
    const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    assert.ok(saturation < 0.4, `${state.id} saturation ${saturation.toFixed(2)}`);
  }
});

test('a bad custom pack is rejected with a reason', () => {
  assert.match(Sprite.validatePack({ states: [] }), /upTo 100/);
  const shortRow = JSON.parse(JSON.stringify(pack));
  shortRow.states[0].frames[0][0] = '...';
  assert.match(Sprite.validatePack(shortRow), /16 pixeles/);
  const badPixel = JSON.parse(JSON.stringify(pack));
  badPixel.states[0].frames[0][0] = '?...............';
  assert.match(Sprite.validatePack(badPixel), /pixel desconocido/);
  const badActivity = JSON.parse(JSON.stringify(pack));
  badActivity.activities[0].frames[0] = ['...'];
  assert.match(Sprite.validatePack(badActivity), /laptop/);
});

test('the requested activities exist', () => {
  const ids = pack.activities.map((a) => a.id);
  for (const id of ['laptop', 'weights', 'nose', 'newspaper', 'pirouette']) assert.ok(ids.includes(id), id);
});

test('a tired character only does calm activities, and none when exhausted', () => {
  const at = (percent) => Sprite.activitiesFor(pack, percent).map((a) => a.id);
  assert.ok(at(20).includes('weights'));
  assert.ok(at(20).includes('pirouette'));
  assert.ok(!at(70).includes('weights'));
  assert.ok(at(70).includes('newspaper'));
  assert.deepStrictEqual(at(85).sort(), ['coffee', 'laptop']);
  assert.deepStrictEqual(at(95), []);
});

test('a walk moves by the given distance and lands exactly on its target', () => {
  const step = stepToward({ x: 0, y: 0 }, { x: 30, y: 40 }, 5);
  assert.deepStrictEqual(step, { x: 3, y: 4, arrived: false });
  assert.deepStrictEqual(stepToward({ x: 29, y: 40 }, { x: 30, y: 40 }, 5), { x: 30, y: 40, arrived: true });
});

test('a walk target always keeps the character inside the screen', () => {
  const area = { x: -100, y: 40, width: 800, height: 600 };
  for (const roll of [0, 0.5, 0.999]) {
    const spot = randomSpot(area, 44, 44, () => roll);
    assert.ok(spot.x >= area.x && spot.x + 44 <= area.x + area.width);
    assert.ok(spot.y >= area.y && spot.y + 44 <= area.y + area.height);
  }
});

test('a window past its reset counts as zero, and the worst window drives the mood', () => {
  const now = Date.parse('2026-11-03T00:00:00Z');
  const past = { percent: 90, resetsAt: '2026-11-02T00:00:00Z' };
  const future = { percent: 30, resetsAt: '2026-11-04T00:00:00Z' };
  assert.strictEqual(Sprite.livePercent(past, now), 0);
  assert.strictEqual(Sprite.livePercent(future, now), 30);
  assert.strictEqual(Sprite.worstPercent(past, future, now), 30);
  assert.strictEqual(Sprite.worstPercent(null, null, now), null);
});
