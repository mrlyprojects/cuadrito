'use strict';
// Runs the app against throwaway settings and demo data; never touches the network or a real login.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');

const out = process.argv[2] || path.join(os.tmpdir(), 'cuadrito-smoke');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cuadrito-data-'));
const result = spawnSync(electron, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CUADRITO_USER_DATA: userData,
    CUADRITO_SMOKE_DIR: out,
    CUADRITO_DEMO: JSON.stringify({ five: { percent: 12, resetsAt: null }, week: { percent: 3, resetsAt: null } }),
  },
});
fs.rmSync(userData, { recursive: true, force: true });
console.log(`captures in ${out}`);
process.exit(result.status === null ? 1 : result.status);
