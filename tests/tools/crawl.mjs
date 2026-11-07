// Whole-app checker: opens every page, tab and report on desktop and phone sizes, presses every
// kind of button, opens every dialog, edits every kind of box and dropdown, and records anything
// that goes wrong.
//   node tests/tools/crawl.mjs            -> prints a report, exits 1 if problems were found
// Recorded: script errors, security-policy violations, the cursor being lost after an edit, open
// sections closing after an edit, the page scrolling sideways, and dialogs that cannot be closed.
import { serve, openApp } from '../helpers.mjs';

const WORKERS = 4;
const VIEWPORTS = [['desktop', { width: 1280, height: 900 }], ['phone', { width: 393, height: 852 }]];
const VIEWS = [
  ['overview'], ['spending'], ['accounts'], ['activity'], ['data'],
  ...['outlook', 'budget', 'goals', 'repeat', 'debt'].map(t => ['plan', { ptab: t }]),
  ...['position', 'income', 'cash', 'ratios', 'close'].map(r => ['reports', { report: r }]),
];
// Never press these: they end the session rather than test a feature.
const SKIP = /lock now|forgot the passcode|remove saved data|^import export$|choose export file|replace with a new export/i;

const srv = await serve(process.env.CRAWL_DIR || undefined);   // CRAWL_DIR: check another copy of the app
const problems = [];
const note = (where, what, detail = '') => problems.push({ where, what, detail: String(detail).slice(0, 300) });
const t0 = Date.now();

async function worker(jobs) {
  const app = await openApp(srv.url);
  const { page } = app;
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
  const closeModal = () => page.evaluate(() => { const m = document.getElementById('modal'); if (m.open) m.close(); });
  const show = async ([pg, extra = {}]) => {
    await page.keyboard.press('Escape').catch(() => {});
    await closeModal(); await ensureData();
    await page.evaluate(([pg, extra]) => { S.page = pg; if (extra.ptab) S.ptab = extra.ptab; if (extra.report) S.report = extra.report; S.mv = null; render(); window.scrollTo(0, 0); }, [pg, extra]);
    await page.waitForTimeout(50);
  };
  const label = el => el.evaluate(e => (e.getAttribute('aria-label') || e.textContent || e.id || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 50));
  const sideways = async where => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    if (r.sw > r.w + 2) note(where, 'page scrolls sideways', `content ${r.sw}px wide on a ${r.w}px screen`);
  };
  // Rows on a list share code, so try at most two of each kind of control.
  const sample = sel => page.evaluate(sel => {
    const seen = {}, out = [];
    document.querySelectorAll(sel).forEach((e, i) => {
      const dn = [...e.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name).sort().join(',');
      const k = e.tagName + '|' + (e.type || '') + '|' + dn + '|' + (dn ? '' : (e.id || e.textContent.trim().slice(0, 30)));
      if ((seen[k] = (seen[k] || 0) + 1) <= 2) out.push(i);
    });
    return out;
  }, sel);
  const valueFor = (type, ph) => type === 'date' ? '2027-01-15' : type === 'month' ? '2027-01' : type === 'color' ? '#336699' : /name|search|payee|note|e\.g\.|car service|school/i.test(ph || '') ? 'Test' : '1,250';

  async function editInputs(where, scope, reshow) {
    const sel = `${scope} input:not([type=file]):not([type=hidden]):not([disabled]), ${scope} select:not([disabled]), ${scope} textarea`;
    for (const i of await sample(sel)) {
      if (reshow) await reshow();
      const el = (await page.$$(sel))[i]; if (!el || !(await el.isVisible().catch(() => false))) continue;
      const info = await el.evaluate(e => ({ tag: e.tagName, type: e.type, ph: e.placeholder, key: Object.entries(e.dataset).map(([k, v]) => k + '=' + v).join(' ') || e.id || e.getAttribute('aria-label') }));
      const name = `${where} › ${info.tag.toLowerCase()} ${info.key || info.ph || i}`;
      try {
        const openIdx = await page.evaluate(scope => { const ds = [...document.querySelectorAll(scope + ' details')]; const d = ds.find(d => !d.open); if (!d) return null; d.open = true; return ds.indexOf(d); }, scope);
        if (info.tag === 'SELECT') {
          const opts = await el.evaluate(e => [...e.options].map(o => o.value));
          if (opts.length > 1) await el.selectOption(opts[opts.length > 2 ? 1 : opts.length - 1]);
        } else if (info.type === 'checkbox' || info.type === 'radio') {
          await el.click({ force: true });
        } else if (info.type === 'color' || info.type === 'range') {
          await el.fill(info.type === 'color' ? '#336699' : '3').catch(() => {});
        } else {
          await el.click(); await el.fill(''); await page.keyboard.type(valueFor(info.type, info.ph));
          // Tab off the last control on the page legitimately leaves the page, so only check when there is a next one.
          const hasNext = await page.evaluate(() => { const all = [...document.querySelectorAll('input,select,textarea,button,summary,a[href]')].filter(x => !x.disabled && x.offsetParent !== null); return all.indexOf(document.activeElement) < all.length - 1; });
          if (!hasNext) { await page.keyboard.press('Tab'); continue; }
          await page.keyboard.press('Tab'); await page.waitForTimeout(80);
          const lost = await page.evaluate(() => !document.activeElement || document.activeElement === document.body);
          const modalClosed = await page.evaluate(() => !document.getElementById('modal').open);
          if (lost && !(scope === '#modal' && modalClosed)) note(name, 'cursor lost after editing and pressing Tab');
        }
        await page.waitForTimeout(80);
        if (openIdx !== null && await page.evaluate(([scope, k]) => document.querySelectorAll(scope + ' details')[k]?.open === false, [scope, openIdx])) note(name, 'an open section closed after this edit');
      } catch (e) { note(name, 'could not be edited', e.message.split('\n')[0]); }
      for (const e of newErrors()) note(name, 'error', e);
    }
  }

  async function pressButtons(where, view) {
    const sel = '#view button:not([disabled]), #view summary, #view [data-explain], #view [data-drill], #view [role=button], #view a[href]';
    await show(view);
    for (const i of await sample(sel)) {
      await show(view);
      const el = (await page.$$(sel))[i]; if (!el || !(await el.isVisible().catch(() => false))) continue;
      const name = `${where} › ${await label(el)}`;
      if (SKIP.test(name)) continue;
      try {
        const dl = page.waitForEvent('download', { timeout: 1200 }).catch(() => null);
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(100);
        const modal = await page.evaluate(() => document.getElementById('modal').open ? document.getElementById('modal-title').textContent : null);
        if (modal) {
          await sideways(name + ' (dialog)');
          await editInputs(`${name} › dialog "${modal}"`, '#modal', null);
          if (await page.evaluate(() => document.getElementById('modal').open)) {
            await page.click('#modal-close', { timeout: 2000 }).catch(e => note(name, 'dialog cannot be closed', e.message.split('\n')[0]));
            if (await page.evaluate(() => document.getElementById('modal').open)) note(name, 'dialog stays open after Close');
          }
        }
        await dl;
      } catch (e) { note(name, 'could not be pressed', e.message.split('\n')[0]); }
      for (const e of newErrors()) note(name, 'error', e);
    }
  }

  async function header(where) {
    for (const id of ['btn-search', 'btn-look', 'btn-eye', 'nav-back', 'nav-fwd']) {
      await show(['overview']);
      const el = await page.$('#' + id); if (!el || !(await el.isVisible()) || await el.isDisabled()) continue;
      try {
        await el.click({ timeout: 1500 }); await page.waitForTimeout(120);
        if (id === 'btn-search') { await page.keyboard.type('Sal'); await page.waitForTimeout(120); await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
        if (id === 'btn-look') await editInputs(`${where} › Appearance`, '#modal', null);
      } catch (e) { note(`${where} › header ${id}`, 'could not be pressed', e.message.split('\n')[0]); }
      await closeModal();
      for (const e of newErrors()) note(`${where} › header ${id}`, 'error', e);
    }
    await page.evaluate(() => { S.mask = false; store.set(); });
  }

  await page.click('#w-sample'); await page.waitForFunction(() => S.data);
  for (const [vp, size, view] of jobs) {
    await page.setViewportSize(size);
    if (!view) { await header(vp); continue; }
    const where = `${vp} › ${view[0]}${view[1] ? ' › ' + Object.values(view[1])[0] : ''}`;
    console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${where}`);
    await show(view); await sideways(where);
    for (const e of newErrors()) note(where, 'error on open', e);
    await editInputs(where, '#view', () => show(view));
    await pressButtons(where, view);
  }
  await app.close();
}

const all = [];
for (const [vp, size] of VIEWPORTS) { all.push([vp, size, null]); for (const v of VIEWS) all.push([vp, size, v]); }
const buckets = Array.from({ length: WORKERS }, () => []);
all.forEach((j, i) => buckets[i % WORKERS].push(j));
await Promise.all(buckets.map(b => worker(b).catch(e => note('checker', 'worker crashed', e.message.split('\n')[0]))));
const uniq = [...new Map(problems.map(p => [p.where.replace(/^(desktop|phone) › /, '') + '|' + p.what + '|' + p.detail, p])).values()];
console.log(`\nChecked in ${Math.round((Date.now() - t0) / 1000)}s. ${uniq.length} problem(s):`);
for (const p of uniq) console.log(`- [${p.where}] ${p.what}${p.detail ? ': ' + p.detail : ''}`);
srv.close();
process.exit(uniq.length ? 1 : 0);
