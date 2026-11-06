'use strict';
/* ============================================================
   Shell: nav, modal, toast, import, render
   ============================================================ */
function applyTheme(){const r=document.documentElement;if(S.theme==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',S.theme);if(S.look)applyLook()}
function modal(title,html,actions){
  S.mv=null;
  $('modal-title').textContent=title;$('modal-body').innerHTML=html;
  $('modal-actions').innerHTML=(actions||[]).map((a,i)=>`<button class="btn ${a.primary?'primary':''}" id="ma-${i}">${esc(a.label)}</button>`).join('');
  (actions||[]).forEach((a,i)=>$('ma-'+i).onclick=a.run);
  if(!$('modal').open)$('modal').showModal();
}
$('modal-close').onclick=()=>$('modal').close();
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').close()});
function toast(t){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=t;document.body.append(el);setTimeout(()=>el.remove(),4800)}

function navHTML(cls){
  return PAGES.map(([k,n])=>`<button class="${cls}" data-go="${k}" ${S.page===k?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${n}</span></button>`).join('');
}
function tabbarHTML(){
  const btn=k=>{const n=PAGES.find(x=>x[0]===k)[1];return`<button data-go="${k}" ${S.page===k?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${n}</span></button>`};
  return TAB_MAIN.map(btn).join('')+`<button id="tab-more" ${TAB_MAIN.includes(S.page)?'':'aria-current="page"'}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.more}</svg><span>More</span></button>`;
}
function openMore(){
  modal('More',`<div class="list">${PAGES.filter(x=>!TAB_MAIN.includes(x[0])).map(([k,n])=>`<button class="row" data-more="${k}"><span class="t">${n}</span><span class="muted">›</span></button>`).join('')}</div>`);
  document.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{S.page=b.dataset.more;S.pg=0;$('modal').close();render();window.scrollTo(0,0)});
}

function diffHTML(df,p){
  const old=S.meta,label=id=>(p.accounts.find(a=>a.id===id)||S.ix.accounts[id]||{}).label||'';
  const list=(title,items,fn)=>items.length?`<details style="margin-top:10px"><summary><strong>${title}</strong> · ${items.length}</summary><div class="list">${items.slice(0,8).map(fn).join('')}${items.length>8?`<p class="footnote">and ${items.length-8} more</p>`:''}</div></details>`:'';
  const byTx=ls=>{const g=new Map();for(const l of ls){if(!g.has(l.tx))g.set(l.tx,[]);g.get(l.tx).push(l)}return[...g.values()].map(a=>{const big=a.reduce((m,x)=>Math.abs(x.amount)>Math.abs(m.amount)?x:m,a[0]);return{...big,n:a.length}})};
  const line=l=>`<div class="row"><div><span class="t">${esc(l.description||'(no description)')}</span><small>${esc(fdate(l.date))} · ${esc(label(l.account))}${l.n>1?' and '+(l.n-1)+' more':''}</small></div><div class="amt">${natf(l.amount,2,2)}</div></div>`;
  return`<p><strong>${esc(p.filename)}</strong> · ${p.accounts.length} accounts · ${p.txCount.toLocaleString()} transactions · ${fdate(p.earliest)} – ${fdate(p.latest)}</p>
  <p class="sub">Now showing ${old.accounts} accounts and ${old.txCount.toLocaleString()} transactions, through ${fdate(old.latest)}.</p>
  ${df.flags.map(f=>notice(esc(f))).join('')}
  <div class="diff-grid"><div><span class="muted">Added</span><br><strong>${df.txAdded.toLocaleString()}</strong> ${df.txAdded===1?'transaction':'transactions'}</div><div><span class="muted">Changed</span><br><strong>${df.txChanged.toLocaleString()}</strong> ${df.txChanged===1?'transaction':'transactions'}</div><div><span class="muted">Removed</span><br><strong>${df.txRemoved.toLocaleString()}</strong> ${df.txRemoved===1?'transaction':'transactions'}</div></div>
  <p>Net worth: <strong>${S.cur} ${fmt(df.before)}</strong> now, <strong>${S.cur} ${fmt(df.after)}</strong> after this import.</p>
  ${list('Missing accounts',df.missing,a=>`<div class="row"><span class="t">${esc(a.name)}</span></div>`)}${list('New accounts',df.fresh,a=>`<div class="row"><span class="t">${esc(a.name)}</span></div>`)}
  ${list('Opening balances that changed',df.opening,a=>`<div class="row"><span class="t">${esc(a.label)}</span></div>`)}
  ${list('Added transactions',byTx(df.added),line)}${list('Changed transactions',byTx(df.changed.map(c=>c.l)),line)}${list('Removed transactions',byTx(df.removed),line)}
  <p class="footnote">Replacing keeps your budgets, goals and forecast settings. The current export moves to Import history so you can restore it.</p>`;
}
async function handleFile(file){
  try{
    if(S.locked||!file)return;
    if(file.size>40e6)throw new Error('That file is over 40 MB. Export just the accounts you need, or ask for help.');
    toast('Reading '+file.name+'…');
    const text=await file.text(),p=parseTXT(text,file.name);
    if(p.errors.length){modal('This file could not be imported',`<p>The export has problems, so nothing was changed:</p><ul>${p.errors.slice(0,6).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`);return}
    if(!S.data||S.meta.sample){await commitImport(p,text);S.page='overview';render();toast('Imported '+p.txCount.toLocaleString()+' transactions from '+p.accounts.length+' accounts.');return}
    const df=diffData(p);
    modal('Review changes before replacing',diffHTML(df,p),[{label:'Cancel',run:()=>$('modal').close()},{label:'Replace data',primary:true,run:async()=>{await commitImport(p,text);$('modal').close();render();toast('Data replaced. The previous export is kept under Import history.')}}]);
  }catch(e){toast(e.message)}
}
$('file').onchange=e=>{handleFile(e.target.files[0]);e.target.value=''};
$('btn-import').onclick=()=>$('file').click();
window.addEventListener('dragover',e=>{e.preventDefault();$('drop')?.classList.add('over')});
window.addEventListener('dragleave',()=>$('drop')?.classList.remove('over'));
window.addEventListener('drop',e=>{e.preventDefault();$('drop')?.classList.remove('over');handleFile(e.dataTransfer?.files?.[0])});
$('btn-eye').onclick=()=>{S.mask=!S.mask;store.set();render()};
$('btn-look').onclick=()=>openAppearance();
$('btn-search').onclick=()=>openSearch();
$('btn-lock').onclick=()=>lockNow();

/* ---- lock screen ---- */
function lockNow(){
  if(!store.lock())return;
  S.key=null;S.locked=true;S.data=null;S.ix=null;S.meta=null;S.raw='';S.plan=null;S.hist=[];
  if($('modal').open)$('modal').close();
  $('view').innerHTML='';$('lock').hidden=false;$('lock-pass').value='';$('lock-err').textContent='';
  setTimeout(()=>$('lock-pass').focus(),60);
}
async function tryUnlock(){
  const rec=store.lock(),pass=$('lock-pass').value;if(!rec||!pass)return;
  $('lock-go').disabled=true;$('lock-err').textContent='';
  try{
    const key=await CR.derive(pass,unb64(rec.salt));
    const chk=await CR.dec(key,{iv:unb64(rec.check.iv),ct:unb64(rec.check.ct)});
    if(chk!=='ok')throw new Error('bad');
    S.key=key;S.locked=false;$('lock').hidden=true;$('lock-pass').value='';S.lastActive=Date.now();
    await loadAll();render();
  }catch(e){$('lock-err').textContent='That passcode did not work. Try again.'}
  $('lock-go').disabled=false;
}
$('lock-go').onclick=tryUnlock;
$('lock-pass').onkeydown=e=>{if(e.key==='Enter')tryUnlock()};
$('lock-forgot').onclick=()=>modal('Remove saved data and passcode?','<p>Without the passcode the saved export cannot be opened. This deletes it, along with your saved budgets, goals and rates, and removes the passcode. Your Moneydance file is not touched.</p>',[{label:'Cancel',run:()=>$('modal').close()},{label:'Remove everything',primary:true,run:async()=>{try{await DB.clear()}catch(e){}store.setLock(null);S.key=null;S.locked=false;$('lock').hidden=true;await loadAll();$('modal').close();render();toast('Saved data removed. Import your export to start again.')}}]);
['pointerdown','keydown','wheel','touchstart'].forEach(ev=>window.addEventListener(ev,()=>{S.lastActive=Date.now()},{passive:true}));
setInterval(()=>{if(store.lock()&&!S.locked&&S.autoLock>0&&Date.now()-S.lastActive>S.autoLock*60000)lockNow()},5000);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)S.hiddenAt=Date.now();
  else if(store.lock()&&!S.locked&&S.autoLock>0&&S.hiddenAt&&Date.now()-S.hiddenAt>S.autoLock*60000)lockNow();
});

function render(){
  if(S.locked)return;
  const has=!!S.data;
  $('rail-nav').innerHTML=has?navHTML('nav-btn'):'';
  $('tabbar').innerHTML=has?tabbarHTML():'';$('tabbar').style.display=has?'':'none';
  document.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>{S.page=el.dataset.go;S.pg=0;S.anim=true;S.ctlOpen=false;render();window.scrollTo(0,0)});
  if($('tab-more'))$('tab-more').onclick=openMore;
  $('rail-foot').textContent='Your data stays in this browser. Nothing is uploaded.';
  $('btn-import').querySelector('.lbl').textContent=has?'Import export':'Choose export file';
  $('btn-import').style.display=has?'':'none';
  $('btn-eye').hidden=!has;$('btn-eye').setAttribute('aria-pressed',String(S.mask));$('btn-eye').title=S.mask?'Show amounts':'Hide amounts';$('btn-eye').setAttribute('aria-label',S.mask?'Show amounts':'Hide amounts');
  $('btn-lock').hidden=!(has&&store.lock());
  navButtons();
  if(!has){$('title').textContent=TITLES.welcome;$('subtitle').textContent='See your net worth, spending and accounts from a Moneydance export.';$('controls').hidden=true;$('banner').innerHTML='';vWelcome();return}
  const showControls=S.page!=='data';
  $('title').textContent=TITLES[S.page];
  $('subtitle').textContent=S.page==='data'?'':periodLabel()+' · '+S.cur;
  $('controls').hidden=!showControls;$('pbar').hidden=!showControls;
  if(showControls){$('controls').innerHTML=controlsHTML();bindControls();$('pbar').innerHTML=pbarHTML();$('controls').classList.toggle('open',!!S.ctlOpen);bindPbar()}
  const[, e]=range(),ix=S.ix;let banner='';
  if(S.meta.sample)banner+=notice('You are looking at sample data. Import your own Moneydance export to see your finances.',true);
  if(ix.errors.length)banner+=notice(ix.errors.length+' transaction'+(ix.errors.length>1?'s are':' is')+' left out of the totals because they do not balance. <button data-go="data">See the checks</button>');
  if(showControls&&S.page!=='accounts'&&S.page!=='plan'&&e>ix.latest&&(S.per.mode==='month'||S.per.mode==='custom'))banner+=notice('Your export ends '+fdate(ix.latest)+', so this period is not complete yet.',true).replace('class="notice info"','class="notice info desk"');
  $('banner').innerHTML=banner;
  $('banner').querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>{S.page='data';render()});
  if(S.page!=='overview')S.arr=false;
  S.charts={};
  ({overview:vOverview,spending:vSpending,accounts:vAccounts,plan:vPlan,reports:vReports,activity:vActivity,data:vData})[S.page]();
  paintCharts();
  if(S.anim){const v=$('view');v.classList.remove('enter');void v.offsetWidth;v.classList.add('enter');S.anim=false}
  navCommit();navButtons();
}
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(S.data&&!S.locked)paintCharts()},160)});

(async function init(){
  const st=store.get();if(st.cur)S.cur=st.cur;if(st.theme)S.theme=st.theme;if(st.targets)S.targets={...S.targets,...st.targets};
  if(typeof st.mask==='boolean')S.mask=st.mask;if(typeof st.autoLock==='number')S.autoLock=st.autoLock;if(st.lastBackup)S.lastBackup=st.lastBackup;
  S.look={...defaultLook(),...(st.look||{})};if(st.layout&&typeof st.layout==='object')S.layout=st.layout;
  applyTheme();
  if(store.lock()){S.locked=true;$('lock').hidden=false;setTimeout(()=>$('lock-pass').focus(),80);return}
  await loadAll();render();
})();
