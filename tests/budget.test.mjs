// Plan > Budget: editing cells behaves like a spreadsheet, and every toolbar option does what it says.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openApp } from './helpers.mjs';

let srv, app, page;
before(async () => {
  srv = await serve(); app = await openApp(srv.url); page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#w-sample'); await page.waitForFunction(() => S.data);
});
after(async () => { await app?.close(); srv?.close(); });
beforeEach(async () => {
  await page.evaluate(() => { if (document.getElementById('modal').open) document.getElementById('modal').close(); S.plan.budgets = []; S.plan.bfrom = null; S.plan.customLines = []; S.cur = 'QAR'; S.page = 'plan'; S.ptab = 'budget'; render(); });
});

const box = k => page.$(`#ptab input[data-bm="${k}"]`);
const editing = () => page.evaluate(() => { const v = S.plan.budgets.find(x => x.from === editVersionKey()); return v ? JSON.parse(JSON.stringify(v.amounts)) : {}; });
const lineOf = k => page.evaluate(k => planModel(editVersionKey()).lines.find(l => l.key === k), k);
const settle = () => page.waitForTimeout(120);
const setBox = async (k, v) => { const b = await box(k); await b.fill(v); await b.dispatchEvent('change'); await settle(); };

test('typing through cells with Tab fills each one and keeps the cursor', async () => {
  const keys = await page.evaluate(() => [...document.querySelectorAll('#ptab .pt-row > div > input[data-bm]')].map(i => i.dataset.bm).filter(k => !k.startsWith('Income')).slice(0, 3));
  await (await box(keys[0])).click();
  for (const [i, v] of ['100', '200', '300'].entries()) {
    await page.keyboard.type(v);
    // Tab until the next amount box (an account list toggle may sit in between)
    for (let n = 0; n < 4; n++) {
      await page.keyboard.press('Tab'); await settle();
      const at = await page.evaluate(() => document.activeElement.dataset?.bm ?? document.activeElement.tagName);
      assert.notEqual(at, 'BODY', `cursor lost after cell ${i + 1}`);
      if (keys.includes(at) || at.startsWith?.('Wants')) break;
    }
  }
  const a = await editing();
  assert.deepEqual(keys.map(k => a[k]), [100, 200, 300]);
});

test('an open account list stays open after editing another cell', async () => {
  const k = await page.evaluate(() => { const d = document.querySelector('#ptab details[data-acc]'); d.open = true; return d.dataset.acc; });
  const other = await page.evaluate(k => [...document.querySelectorAll('#ptab .pt-row > div > input[data-bm]')].map(i => i.dataset.bm).find(x => x !== k), k);
  await setBox(other, '50');
  assert.ok(await page.evaluate(k => document.querySelector(`#ptab details[data-acc="${k}"]`).open, k));
});

test('amounts are read the way people type them', async () => {
  const r = await page.evaluate(() => ['1500', '1,500', '1 500', '1500.5', '1500,5', '1.500,50', '1,500.25', ' 7 ', '', 'abc', '1,2,3', '-5'].map(t => parseAmount(t)));
  assert.deepEqual(r, [1500, 1500, 1500, 1500.5, 1500.5, 1500.5, 1500.25, 7, null, null, null, -5]);
});

test('a bad amount is refused and nothing is saved', async () => {
  const k = 'Needs › Food';
  await setBox(k, '-5'); await setBox(k, 'abc');
  assert.equal((await editing())[k], undefined);
});

test('an account amount takes over from the category amount', async () => {
  const l = await page.evaluate(() => planModel(null).lines.find(l => l.acc.length > 1 || (l.acc.length === 1 && l.acc[0].name !== l.name)));
  await setBox(l.key, '900');
  await page.evaluate(k => { document.querySelector(`#ptab details[data-acc="${k}"]`).open = true; }, l.key);
  await setBox('@' + l.acc[0].id, '100');
  const after = await lineOf(l.key);
  assert.equal(after.basis, 'accounts');
  assert.equal((await editing())[l.key], undefined);
});

test('Fill blanks leaves categories that follow their accounts alone', async () => {
  const l = await page.evaluate(() => planModel(null).lines.find(l => l.acc.length > 1 || (l.acc.length === 1 && l.acc[0].name !== l.name)));
  await page.evaluate(k => { document.querySelector(`#ptab details[data-acc="${k}"]`).open = true; }, l.key);
  await setBox('@' + l.acc[0].id, '100');
  await page.click('#bp-fill'); await settle();
  assert.equal((await lineOf(l.key)).basis, 'accounts');
  assert.ok(Object.keys(await editing()).length > 2, 'other blanks were filled');
});

test('planning lines need an amount, and Clear keeps them', async () => {
  await page.click('#bp-line'); await page.fill('#pl-name', 'School fees'); await page.click('#modal-actions .btn.primary'); await settle();
  assert.ok(await page.evaluate(() => document.getElementById('modal').open), 'empty amount must be refused');
  await page.fill('#pl-amt', '1,250'); await page.click('#modal-actions .btn.primary'); await settle();
  assert.equal((await lineOf('+School fees')).planned, 1250);
  await setBox('Needs › Food', '400');
  await page.click('#bp-clear'); await page.click('#modal-actions .btn.primary'); await settle();
  assert.deepEqual(await editing(), { '+School fees': 1250 });
});

test('Bulk edit opens and saves the version you are editing, keeping other amounts', async () => {
  await page.evaluate(() => { S.plan.bfrom = addMonths(monthStart(S.ix.latest), 2).slice(0, 7); const v = ensureEditVersion(); v.amounts = { 'Needs › Food': 999, '+Car': 250, '@e-fuel': 77 }; S.plan.customLines = [{ key: '+Car', name: 'Car', cls: 'needs' }]; render(); });
  const ek = await page.evaluate(() => editVersionKey());
  await page.click('#edit-budget'); await settle();
  assert.equal(await page.inputValue('#b-from'), ek);
  assert.equal(await page.inputValue('[data-bk="Needs › Food"]'), '999');
  await page.fill('[data-bk="Needs › Food"]', '1,100');
  await page.click('#modal-actions .btn.primary'); await settle();
  const a = await page.evaluate(ek => S.plan.budgets.find(v => v.from === ek).amounts, ek);
  assert.equal(a['Needs › Food'], 1100);
  assert.equal(a['+Car'], 250);
  assert.equal(a['@e-fuel'], 77);
});

test('removing the version you are editing goes back to one that exists', async () => {
  await setBox('Needs › Food', '400');
  const later = await page.evaluate(() => addMonths(monthStart(S.ix.latest), 3).slice(0, 7));
  await page.click('#bv-new'); await page.selectOption('#nv-from', later); await page.click('#modal-actions .btn.primary'); await settle();
  await page.click(`[data-vdel="${later}"]`); await page.click('#modal-actions .btn.primary'); await settle();
  assert.doesNotMatch(await page.evaluate(() => document.getElementById('bv-sel').selectedOptions[0].textContent), /\(new\)/);
  assert.deepEqual(app.errors, []);
});
