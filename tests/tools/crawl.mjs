// Whole-app checker: opens every page, tab and report on desktop and phone sizes, presses every
// button, opens every dialog, edits every box and dropdown, and records anything that goes wrong.
//   node tests/tools/crawl.mjs            -> prints a report, exits 1 if problems were found
// Problems recorded: script errors, security-policy violations, the cursor being lost after an edit,
// open sections collapsing after an edit, the page scrolling sideways, and dialogs that cannot close.
import { serve, openApp } from '../helpers.mjs';

const VIEWPORTS = [['desktop', { width: 1280, height: 900 }], ['phone', { width: 393, height: 852 }]];
const VIEWS = [
  ['overview'], ['spending'], ['accounts'], ['activity'], ['data'],
  ...['outlook', 'budget', 'goals', 'repeat', 'debt'].map(t => ['plan', { ptab: t }]),
  ...['position', 'income', 'cash', 'ratios', 'close'].map(r => ['reports', { report: r }]),
];
// Never press these: they end the session rather than test a feature.
const SKIP = /lock now|forgot the passcode|remove saved data|^import export$|choose export file|replace with a new export/i;

const srv = await serve();
const app = await openApp(srv.url);
const { page } = app;
const problems = [];
const note = (where, what, detail = '') => problems.push({ where, what, detail: String(detail).slice(0, 300) });
let errCursor = 0;
const newErrors = () => { const e = app.errors.slice(errCursor); errCursor = app.errors.length; return e; };
page.on('filechooser', () => {});
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.evaluate(() => document.addEventListener('securitypolicyviolation', e => console.error('CSP ' + e.violatedDirective + ' ' + e.blockedURI)));

const ensureData = () => page.evaluate(() => {
  if (S.locked) { S.locked = false; document.getElementById('lock').hidden = true; }
  if (!S.data) { const t = sampleText(); applyParsed(parseTXT(t, 'Sample'), t, undefined, true); }
  if (store.lock()) { store.setLock(null); S.key = null; }
});
const closeModal = () => page.evaluate(() => { const m = document.getElementById('modal'); if (m.open) m.close(); document.querySelector('.qs')?.remove(); });
const show = async ([pg, extra = {}]) => {
  await closeModal(); await ensureData();
  await page.evaluate(([pg, extra]) => { S.page = pg; if (extra.ptab) S.ptab = extra.ptab; if (extra.report) S.report = extra.report; S.mv = null; render(); window.scrollTo(0, 0); }, [pg, extra]);
  await page.waitForTimeout(60);
};
const label = el => el.evaluate(e => (e.getAttribute('aria-label') || e.textContent || e.id || e.name || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 50));

const sideways = async where => {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  if (r.sw > r.w + 2) note(where, 'page scrolls sideways', `content ${r.sw}px wide on a ${r.w}px screen`);
};

const valueFor = (type, ph) => type === 'date' ? '2027-01-15' : type === 'month' ? '2027-01' : type === 'color' ? '#336699' : type === 'checkbox' || type === 'radio' ? null : /name|text|search|payee|note/i.test(ph || '') && type !== 'number' ? 'Test' : '250';

async function editInputs(where, scope, reshow) {
  const sel = `${scope} input:not([type=file]):not([type=hidden]):not([disabled]), ${scope} select:not([disabled]), ${scope} textarea`;
  const n = (await page.$$(sel)).length;
  for (let i = 0; i < n; i++) {
    if (reshow) await reshow();
    const els = await page.$$(sel); const el = els[i]; if (!el || !(await el.isVisible())) continue;
    const info = await el.evaluate(e => ({ tag: e.tagName, type: e.type, ph: e.placeholder, key: Object.entries(e.dataset).map(([k, v]) => k + '=' + v).join(' ') || e.id, inDetails: !!e.closest('details') }));
    const name = `${where} › ${info.tag.toLowerCase()} ${info.key || info.ph || i}`;
    try {
      // open the first account list on the page (if any) so we can see whether an edit collapses it
      const openKey = await page.evaluate(scope => { const d = [...document.querySelectorAll(scope + ' details')].find(d => !d.open); if (!d) return null; d.open = true; return [...document.querySelectorAll(scope + ' details')].indexOf(d); }, scope);
      if (info.tag === 'SELECT') {
        const opts = await el.evaluate(e => [...e.options].map(o => o.value));
        if (opts.length > 1) await el.selectOption(opts[opts.length > 2 ? 1 : opts.length - 1]);
      } else if (info.type === 'checkbox' || info.type === 'radio') {
        await el.click({ force: true });
      } else {
        const v = valueFor(info.type, info.ph);
        await el.click(); await el.fill(''); await page.keyboard.type(v);
        await page.keyboard.press('Tab'); await page.waitForTimeout(90);
        const f = await page.evaluate(() => document.activeElement === document.body || !document.activeElement);
        if (f && !(await page.evaluate(() => document.getElementById('modal').open === false && !!document.querySelector('.toast')))) note(name, 'cursor lost after editing and pressing Tab');
      }
      await page.waitForTimeout(90);
      if (openKey !== null) {
        const still = await page.evaluate(([scope, k]) => document.querySelectorAll(scope + ' details')[k]?.open, [scope, openKey]);
        if (still === false) note(name, 'an open section closed after this edit');
      }
    } catch (e) { note(name, 'could not be edited', e.message.split('\n')[0]); }
    for (const e of newErrors()) note(name, 'error', e);
  }
}

async function pressButtons(where, view) {
  const sel = '#view button:not([disabled]), #view summary, #view [data-explain], #view [data-drill], #view [role=button], #view a[href]';
  const total = (await page.$$(sel)).length;
  for (let i = 0; i < total; i++) {
    await show(view);
    const el = (await page.$$(sel))[i]; if (!el || !(await el.isVisible().catch(() => false))) continue;
    const name = `${where} › ${await label(el)}`;
    if (SKIP.test(name)) continue;
    try {
      const dl = page.waitForEvent('download', { timeout: 1500 }).catch(() => null);
      await el.click({ timeout: 2000 });
      await page.waitForTimeout(120);
      const modal = await page.evaluate(() => document.getElementById('modal').open ? document.getElementById('modal-title').textContent : null);
      if (modal) {
        await sideways(name + ' (dialog)');
        await editInputs(`${name} › dialog "${modal}"`, '#modal', null);
        // the close button must work
        await page.click('#modal-close', { timeout: 2000 }).catch(e => note(name, 'dialog cannot be closed', e.message.split('\n')[0]));
        if (await page.evaluate(() => document.getElementById('modal').open)) note(name, 'dialog stays open after Close');
      }
      await dl;
    } catch (e) { note(name, 'could not be pressed', e.message.split('\n')[0]); }
    for (const e of newErrors()) note(name, 'error', e);
  }
}

// Header buttons once per viewport: search, appearance, hide amounts.
async function header(where) {
  for (const id of ['btn-search', 'btn-look', 'btn-eye', 'nav-back', 'nav-fwd']) {
    await show(['overview']);
    const el = await page.$('#' + id); if (!el || !(await el.isVisible())) continue;
    try { await el.click({ timeout: 1500 }); await page.waitForTimeout(150); if (id === 'btn-search') { await page.keyboard.type('Sal'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); } }
    catch (e) { note(`${where} › header ${id}`, 'could not be pressed', e.message.split('\n')[0]); }
    if (id === 'btn-look') await editInputs(`${where} › Appearance`, '#modal', null);
    await closeModal();
    for (const e of newErrors()) note(`${where} › header ${id}`, 'error', e);
  }
  await page.evaluate(() => { S.mask = false; store.set(); });
}

const t0 = Date.now();
await page.click('#w-sample'); await page.waitForFunction(() => S.data);
for (const [vp, size] of VIEWPORTS) {
  await page.setViewportSize(size);
  await header(vp);
  for (const view of VIEWS) {
    const where = `${vp} › ${view[0]}${view[1] ? ' › ' + Object.values(view[1])[0] : ''}`;
    console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${where}: ${problems.length} problem(s) so far`);
    await show(view); await sideways(where);
    for (const e of newErrors()) note(where, 'error on open', e);
    await editInputs(where, '#view', () => show(view));
    await pressButtons(where, view);
  }
}
const uniq = [...new Map(problems.map(p => [p.where.replace(/^(desktop|phone) › /, '') + '|' + p.what + '|' + p.detail, p])).values()];
console.log(`\nChecked in ${Math.round((Date.now() - t0) / 1000)}s. ${uniq.length} problem(s):`);
for (const p of uniq) console.log(`- [${p.where}] ${p.what}${p.detail ? ': ' + p.detail : ''}`);
await app.close(); srv.close();
process.exit(uniq.length ? 1 : 0);
