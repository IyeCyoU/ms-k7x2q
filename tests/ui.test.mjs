// Smoke test: load the sample and open every page without a single error.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openApp } from './helpers.mjs';

let srv, app;
before(async () => { srv = await serve(); app = await openApp(srv.url); });
after(async () => { await app?.close(); srv?.close(); });

test('welcome screen offers import and sample', async () => {
  await app.page.waitForSelector('#w-sample');
  assert.ok(await app.page.isVisible('#w-import'));
});

test('every page renders with sample data and no errors', async () => {
  await app.page.click('#w-sample');
  await app.page.waitForFunction(() => S.data && S.page === 'overview');
  const pages = await app.page.evaluate(() => PAGES.map(p => p[0]));
  assert.ok(pages.length >= 7);
  for (const pg of pages) {
    await app.page.evaluate(p => { S.page = p; render(); }, pg);
    await app.page.waitForTimeout(150);
    const text = await app.page.evaluate(() => document.getElementById('view').innerText.trim());
    assert.ok(text.length > 50, `page "${pg}" rendered almost nothing`);
  }
  assert.deepEqual(app.errors, []);
});

test('the stylesheet is applied (tests run against the real layout)', async () => {
  const bg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgba(0, 0, 0, 0)', 'body has no background: css/app.css did not load');
  assert.notEqual(await app.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '', 'theme colours missing');
});
