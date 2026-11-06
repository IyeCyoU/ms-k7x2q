// Every money box in a dialog: "1,250" typed by a person is saved as 1250, not 0 or nothing.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openApp } from './helpers.mjs';

let srv, app, page;
before(async () => {
  srv = await serve(); app = await openApp(srv.url); page = app.page;
  await page.click('#w-sample'); await page.waitForFunction(() => S.data);
});
after(async () => { await app?.close(); srv?.close(); });
beforeEach(() => page.evaluate(() => { const m = document.getElementById('modal'); if (m.open) m.close(); }));

// Type like a person (click, type, Tab out), not by setting the value.
const type = async (sel, text) => { await page.click(sel); await page.fill(sel, ''); await page.keyboard.type(text); await page.keyboard.press('Tab'); };
const save = () => page.click('#modal-actions .btn.primary');

test('goal: target, saved so far and monthly amount', async () => {
  await page.evaluate(() => { S.page = 'plan'; S.ptab = 'goals'; render(); editGoal(null); });
  await page.fill('#g-name', 'New car');
  await type('#g-target', '25,000'); await type('#g-cur-amt', '1 250'); await type('#g-monthly', '1250,50');
  await save();
  const g = await page.evaluate(() => S.plan.goals.at(-1));
  assert.deepEqual([g.name, g.target, g.current, g.monthly], ['New car', 25000, 1250, 1250.5]);
});

test('repeating commitment: amount', async () => {
  await page.evaluate(() => { S.page = 'plan'; S.ptab = 'repeat'; render(); editCommitment(null); });
  await page.fill('#cm-desc', 'Rent'); await type('#cm-amt', '4,200');
  if (!(await page.inputValue('#cm-start'))) await page.fill('#cm-start', '2026-10-01');
  await save();
  const c = await page.evaluate(() => S.plan.commitments.at(-1));
  assert.equal(c.desc, 'Rent'); assert.equal(c.amount, 4200);
});

test('debt terms: rate, payment and extra', async () => {
  await page.evaluate(() => { S.page = 'plan'; S.ptab = 'debt'; render(); });
  await page.click('[data-loan]');
  await type('#ln-apr', '4,5'); await type('#ln-pay', '1,100'); await type('#ln-extra', '250');
  await save();
  const cfg = await page.evaluate(() => Object.values(S.plan.loans).at(-1));
  assert.deepEqual([cfg.apr, cfg.payment ?? cfg.pay, cfg.extra], [4.5, 1100, 250]);
});

test('forecast settings: reserve and monthly totals', async () => {
  await page.evaluate(() => { S.page = 'plan'; S.ptab = 'outlook'; render(); editForecast(); });
  await type('#f-reserve', '10,000'); await type('#f-inc', '15,300');
  await save();
  const fc = await page.evaluate(() => S.plan.fc);
  assert.equal(fc.reserve, 10000); assert.equal(fc.income, 15300);
});

test('transaction filter: minimum amount with a comma filters, not empties', async () => {
  await page.evaluate(() => { S.page = 'activity'; S.amin = ''; render(); });
  const all = await page.evaluate(() => document.querySelectorAll('#view [data-tx]').length);
  await page.click('#t-amin'); await page.keyboard.type('1,000');
  const some = await page.evaluate(() => document.querySelectorAll('#view [data-tx]').length);
  assert.ok(some > 0 && some < all, `${some} of ${all} shown`);
  assert.deepEqual(app.errors, []);
});
