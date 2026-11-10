// Offline + update flow, and that every file the service worker and manifest need exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, serve, openApp } from './helpers.mjs';

test('every file referenced by sw.js, the manifest and index.html exists', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'([^']+\.(?:html|webmanifest|png|css|js))'/g)].map(m => m[1]);
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const fromHtml = [...html.matchAll(/(?:href|src)="((?:icons|css|js)\/[^"]+)"/g)].map(m => m[1]);
  // Every script and stylesheet the page loads must be cached for offline use.
  for (const f of fromHtml.filter(f => !f.startsWith('icons/'))) assert.ok(listed.includes(f), `sw.js does not cache ${f}`);
  const all = [...new Set([...listed, ...man.icons.map(i => i.src), ...fromHtml])];
  assert.ok(all.length >= 17, `only ${all.length} files found`);
  for (const f of all) assert.ok(fs.existsSync(path.join(ROOT, f)), `missing file: ${f}`);
  assert.match(sw, /const V='[^']+'/, 'sw.js must define a cache version V');
});

test('works offline and offers a new version', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-'));
  fs.cpSync(ROOT, dir, { recursive: true, filter: s => !/node_modules|\.git$|\.git\//.test(s) });
  const srv = await serve(dir);
  const app = await openApp(srv.url);
  try {
    const { page, context } = app;
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cached = await page.evaluate(async () => { const k = await caches.keys(); return (await (await caches.open(k[0])).keys()).length; });
    assert.ok(cached >= 19, `only ${cached} files cached`);

    await page.reload();
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.title(), 'Money status');
    await context.setOffline(false);

    // while the app is in use (after the quiet start-up window), an update asks first and Reload applies it
    await page.waitForTimeout(15500);
    const swPath = path.join(dir, 'sw.js');
    fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/const V='[^']+'/, "const V='test-next'"));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForSelector('.sw-update', { timeout: 10000 });
    await Promise.all([page.waitForNavigation(), page.click('.sw-update button')]);
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['test-next']);
    assert.equal(await page.$('.sw-update'), null, 'the message must not come back after Reload');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

const copySite = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-')); fs.cpSync(ROOT, dir, { recursive: true, filter: s => !/node_modules|\.git$|\.git\//.test(s) }); return dir; };
const bumpVersion = (dir, v) => { const p = path.join(dir, 'sw.js'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/const V='[^']+'/, `const V='${v}'`)); };

test('an update is applied on opening the app, without asking', async () => {
  const dir = copySite(), srv = await serve(dir), app = await openApp(srv.url);
  try {
    await app.page.evaluate(() => navigator.serviceWorker.ready); await app.page.reload(); await app.page.waitForTimeout(300);
    bumpVersion(dir, 'test-open');
    const pg2 = await app.context.newPage(); await pg2.goto(srv.url); await pg2.waitForTimeout(4500);   // opening the app again
    assert.deepEqual(await pg2.evaluate(() => caches.keys()), ['test-open']);
    assert.equal(await pg2.$('.sw-update'), null, 'no prompt when opening the app');
  } finally { await app.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Reload still reloads when the phone never announces the switch, and does not loop', async () => {
  const dir = copySite(), srv = await serve(dir), app = await openApp(srv.url), { page } = app;
  try {
    await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(15500);
    bumpVersion(dir, 'test-stuck');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForSelector('.sw-update', { timeout: 10000 });
    await page.evaluate(() => { ServiceWorker.prototype.postMessage = function () {}; });   // the switch never happens
    await Promise.all([page.waitForNavigation({ timeout: 6000 }), page.click('.sw-update button')]);
    await page.waitForTimeout(1500);
    assert.notEqual(await page.$('.sw-update'), null, 'offered once more instead of reloading in a loop');
  } finally { await app.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
