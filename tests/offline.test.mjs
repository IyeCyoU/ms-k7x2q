// Offline + update flow, and that every file the service worker and manifest need exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, serve, openApp } from './helpers.mjs';

test('every file referenced by sw.js, the manifest and index.html exists', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'([^']+\.(?:html|webmanifest|png))'/g)].map(m => m[1]);
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const fromHtml = [...html.matchAll(/href="(icons\/[^"]+)"/g)].map(m => m[1]);
  const all = [...new Set([...listed, ...man.icons.map(i => i.src), ...fromHtml])];
  assert.ok(all.length >= 6);
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
    assert.ok(cached >= 7, `only ${cached} files cached`);

    await page.reload();
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.title(), 'Money status');
    await context.setOffline(false);

    const swPath = path.join(dir, 'sw.js');
    fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/const V='[^']+'/, "const V='test-next'"));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForSelector('.sw-update', { timeout: 10000 });
    await Promise.all([page.waitForNavigation(), page.click('.sw-update button')]);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['test-next']);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
