const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

test('HTML head uses the local Relo SVG favicon', () => {
  assert.match(indexHtml, /rel="icon"[^>]+href="\/relo-logo\.svg"/);
});

test('dashboard brand links to the dashboard root', () => {
  assert.match(appJs, /<a class="brand dashboard-brand" href="\/"/);
});

test('dashboard brand has a hover shake and reduced-motion guard', () => {
  assert.match(stylesCss, /\.dashboard-brand:hover \.brand-mark/);
  assert.match(stylesCss, /@keyframes relo-logo-shake/);
  assert.match(stylesCss, /prefers-reduced-motion: reduce/);
});
