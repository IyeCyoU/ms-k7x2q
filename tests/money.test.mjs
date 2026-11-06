// Money maths: parser, double-entry checks and net worth, checked against
// the app's built-in (deterministic) sample data and hand-made exports.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openApp } from './helpers.mjs';

let srv, app;
before(async () => { srv = await serve(); app = await openApp(srv.url); });
after(async () => { await app?.close(); srv?.close(); });

const H = {
  cur: '#Currency\tID\tName\tRate',
  acc: '#Account\tName\tID\tType\tCurrency\tOpening',
  date: '#Date\tDate\t\tEntered\t\tDescription\tStatus\tAccount\tMemo\tAmount',
};
const post = (date, id, desc, acct, amt) => [date, '', id, '', desc, '', acct, '', amt].join('\t');
const ref = '-\t\t\t\t\t\t\t\t';
/** A tiny two-account export: one salary payment of `amt` into the bank. */
const tiny = ({ amt = '1000.00', other = '-1000.00', date = '2026.01.15', bankId = 'a1' } = {}) => [
  H.cur, 'QAR\tQatari Riyal\t\t1', '',
  H.acc, `Assets:Bank\t${bankId}\tBANK\tQAR\t500`, H.date, post(date, 'T1', 'Salary', 'Assets:Bank', amt), ref, '',
  H.acc, 'Income:Salary\ti1\tINCOME\tQAR\t0', H.date, post(date, 'T1', 'Salary', 'Income:Salary', other), ref, '',
].join('\n');

const run = (fn, arg) => app.page.evaluate(fn, arg);

test('sample export parses cleanly', async () => {
  const r = await run(() => { const p = parseTXT(sampleText(), 's'); return { e: p.errors, w: p.warnings, lines: p.lines.length, tx: p.txCount, from: p.earliest, to: p.latest }; });
  assert.deepEqual(r.e, []);
  assert.deepEqual(r.w, []);
  assert.equal(r.lines, 636);
  assert.equal(r.tx, 318);
  assert.equal(r.from, '2025-07-01');
  assert.equal(r.to, '2026-09-18');
});

test('rejects a file that is not a Moneydance export', async () => {
  const msg = await run(() => { try { parseTXT('hello,world\n1,2', 'x.csv'); return null; } catch (e) { return e.message; } });
  assert.match(msg, /does not look like a Moneydance/);
});

test('parses a minimal export exactly', async () => {
  const r = await run(t => { const p = parseTXT(t, 't'); return { e: p.errors, w: p.warnings, l: p.lines.map(l => [l.date, l.account, l.amount]), a: p.accounts.map(a => [a.id, a.group, a.opening]) }; }, tiny());
  assert.deepEqual(r.e, []);
  assert.deepEqual(r.w, []);
  assert.deepEqual(r.l, [['2026-01-15', 'a1', 1000], ['2026-01-15', 'i1', -1000]]);
  assert.deepEqual(r.a, [['a1', 'Asset', 500], ['i1', 'Income', 0]]);
});

test('reads amounts with thousands separators', async () => {
  const r = await run(t => parseTXT(t, 't').lines[0].amount, tiny({ amt: '1,250.50', other: '-1,250.50' }));
  assert.equal(r, 1250.5);
});

test('flags impossible dates and bad amounts instead of guessing', async () => {
  const badDate = await run(t => parseTXT(t, 't').errors, tiny({ date: '2026.02.30' }));
  assert.ok(badDate.some(e => /Invalid date/.test(e)), badDate.join('; '));
  const badAmt = await run(t => parseTXT(t, 't').errors, tiny({ amt: 'abc' }));
  assert.ok(badAmt.some(e => /Invalid (amount|posting)/.test(e)), badAmt.join('; '));
});

test('flags duplicate account IDs', async () => {
  const errs = await run(t => parseTXT(t, 't').errors, tiny({ bankId: 'i1' }));
  assert.ok(errs.some(e => /Duplicate account ID/.test(e)), errs.join('; '));
});

test('an unbalanced transaction is reported, not counted', async () => {
  const r = await run(t => { const p = parseTXT(t, 't'); const ix = buildIndex({ ...p, fxh: {}, classMap: {}, recat: {}, catMap: {} }); return { err: ix.errors.map(e => e.reason), txs: ix.txs.length }; }, tiny({ other: '-999.00' }));
  assert.equal(r.txs, 0);
  assert.match(r.err[0], /differ by 1\.00/);
});

test('balanced sample: every transaction is accepted', async () => {
  const r = await run(() => { const p = parseTXT(sampleText(), 's'); const ix = buildIndex({ ...p, fxh: {}, classMap: {}, recat: {}, catMap: {} }); return { err: ix.errors.length, txs: ix.txs.length, multi: ix.multi.length }; });
  assert.equal(r.err, 0);
  assert.equal(r.txs, 318);
  assert.equal(r.multi, 15); // QAR -> INR transfers
});

test('net worth matches an independent recalculation', async () => {
  const r = await run(() => {
    const p = parseTXT(sampleText(), 's');
    const ix = buildIndex({ ...p, fxh: {}, classMap: {}, recat: {}, catMap: {} });
    // Independent: opening + all postings per account, converted at the file's rates.
    let assets = 0, debt = 0;
    for (const a of p.accounts) {
      if (a.group !== 'Asset' && a.group !== 'Liability') continue;
      const bal = (a.opening || 0) + p.lines.filter(l => l.account === a.id).reduce((s, l) => s + l.amount, 0);
      const v = bal * p.fx[a.currency];
      if (v >= 0) assets += v; else debt -= v;
    }
    return { app: ix.nw.at(-1), assets, debt, months: ix.nw.length };
  });
  assert.equal(r.months, 15);
  assert.ok(Math.abs(r.app.net - (r.assets - r.debt)) < 0.01, `app ${r.app.net} vs ${r.assets - r.debt}`);
  assert.ok(Math.abs(r.app.assets - r.assets) < 0.01, `assets ${r.app.assets} vs ${r.assets}`);
  assert.ok(Math.abs(r.app.debt - r.debt) < 0.01, `debt ${r.app.debt} vs ${r.debt}`);
  // Golden value: catches silent changes to the sums.
  assert.equal(r.app.net.toFixed(2), '171262.43');
});
