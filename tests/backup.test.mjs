// Full backup: round trip through the real UI, wrong password, wrong file type, and that it is encrypted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, openApp } from './helpers.mjs';

let srv, app;
before(async () => { srv = await serve(); app = await openApp(srv.url); });
after(async () => { await app?.close(); srv?.close(); });

const PW = 'correct horse 42';

test('backup is encrypted and needs a long password', async () => {
  const r = await app.page.evaluate(async pw => {
    const p = parseTXT(sampleText(), 'Mine.txt'); await commitImport(p, sampleText());
    let short = null; try { await buildBackupFile('short') } catch (e) { short = e.message }
    const file = await buildBackupFile(pw);
    return { short, file };
  }, PW);
  assert.match(r.short, /at least 8/);
  const obj = JSON.parse(r.file);
  assert.equal(obj.kind, 'backup');
  assert.equal(obj.enc, true);
  assert.ok(!r.file.includes('Supermarket'), 'transaction text must not appear in the file');
  assert.ok(!r.file.includes('Everyday'), 'account names must not appear in the file');
});

test('wrong password and wrong file type are refused', async () => {
  const r = await app.page.evaluate(async pw => {
    const file = await buildBackupFile(pw), out = {};
    try { await readBackupFile(file, 'not the password') } catch (e) { out.wrong = e.message }
    const plan = await buildPlanFile(false, '');
    try { await readBackupFile(plan, pw) } catch (e) { out.plan = e.message }
    try { await readBackupFile('garbage', pw) } catch (e) { out.junk = e.message }
    return out;
  }, PW);
  assert.match(r.wrong, /password did not open/);
  assert.match(r.plan, /plan file/);
  assert.match(r.junk, /could not be read/);
});

test('save, wipe, restore through the UI brings everything back', async () => {
  const { page } = app;
  // Give the plan something to lose, and note the net worth.
  const before = await page.evaluate(() => { S.plan.goals.push({ id: 'g-test', name: 'Test goal', target: 5000 }); savePlan(); S.cur = 'INR'; store.set(); return { nw: S.ix.nw.at(-1).net, file: S.meta.filename }; });
  await page.waitForTimeout(400);

  // Save via the Data page. Capture the file the app hands to the browser.
  await page.evaluate(() => { S.page = 'data'; render(); });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#bk-save');
      await page.fill('#bk-pass', PW); await page.fill('#bk-pass2', PW);
      await page.click('#modal-actions .btn.primary');
    })(),
  ]);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')), download.suggestedFilename());
  await download.saveAs(tmp);
  assert.match(download.suggestedFilename(), /^Money-status-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await page.waitForFunction(() => !!S.lastBackup);

  // Wipe the device completely, as Safari would.
  await page.evaluate(async () => { await DB.clear(); localStorage.clear(); });
  await page.reload();
  await page.waitForSelector('#bk-load');
  assert.equal(await page.evaluate(() => S.data), null);

  // Restore from the welcome screen.
  await page.setInputFiles('#bk-file', tmp);
  await page.fill('#br-pass', PW);
  await page.click('#modal-actions .btn.primary');
  await page.waitForSelector('text=Replace everything on this device?');
  await page.click('#modal-actions .btn.primary');
  await page.waitForFunction(() => S.data && S.page === 'overview');

  const after = await page.evaluate(() => ({ nw: S.ix.nw.at(-1).net, file: S.meta.filename, goal: S.plan.goals.some(g => g.id === 'g-test'), cur: S.cur }));
  assert.equal(after.file, before.file);
  assert.equal(after.nw.toFixed(2), before.nw.toFixed(2));
  assert.ok(after.goal, 'goal should be restored');
  assert.equal(after.cur, 'INR', 'settings should be restored');

  // And it survives a reload (really written to storage).
  await page.reload();
  await page.waitForFunction(() => S.data);
  assert.ok(await page.evaluate(() => S.plan.goals.some(g => g.id === 'g-test')));
  assert.deepEqual(app.errors, []);
});
