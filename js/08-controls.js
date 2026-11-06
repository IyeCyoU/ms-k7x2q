'use strict';
/* ============================================================
   Polish and controls: recategorise, month-end close, search,
   sparklines, donut, payees, forecast options
   ============================================================ */
/* ---- recategorise ---- */
function categoryAccounts(group){
  return S.data.accounts.filter(a=>a.group===group&&a.leaf).sort((x,y)=>pathOf(x).join(' › ').localeCompare(pathOf(y).join(' › ')));
}
function recatControl(l){
  const cur=S.plan.recat[l.id]||S.plan.catMap[l.account]||l.account,opts=categoryAccounts(l.a.group);
  return`<label class="fld" style="margin-top:12px"><span>Category (${esc(l.a.group.toLowerCase())})</span><select data-recat="${esc(l.id)}">${opts.map(a=>`<option value="${esc(a.id)}" ${a.id===cur?'selected':''}>${esc(pathOf(a).join(' › '))}</option>`).join('')}</select></label>${cur!==l.account?`<p class="footnote">Originally ${esc(pathOf(S.ix.accounts[l.account]).join(' › '))} in Moneydance. Your change lives only in this app.</p>`:''}`;
}
function applyRecat(lineId,accountId,origId){
  if(accountId===origId&&!S.plan.catMap[origId])delete S.plan.recat[lineId];else S.plan.recat[lineId]=accountId;
  savePlan();rebuild();
}
function overridesCard(){
  const cm=Object.entries(S.plan.catMap),n=Object.keys(S.plan.recat).length,acc=id=>S.ix.accounts[id]?pathOf(S.ix.accounts[id]).join(' › '):'(missing)';
  return`<p class="sub">Change how something is categorised in this app without touching Moneydance. Do it for one transaction (open it and change its category), or move a whole category into another one here.</p>
   <div class="list">${cm.map(([a,b])=>`<div class="row"><div><span class="t">${esc(acc(a))}</span><small>counted as ${esc(acc(b))}</small></div><div class="amt"><button class="btn small" data-catdel="${esc(a)}">Remove</button></div></div>`).join('')||'<p class="sub">No category moves yet.</p>'}</div>
   <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn small" id="ov-add">Move a category</button>${n?`<button class="btn small" id="ov-clear">Undo ${n} transaction change${n>1?'s':''}</button>`:''}</div>`;
}
function bindOverrides(){
  $('ov-add').onclick=()=>{
    const ix=S.ix,used=new Set(ix.good.filter(l=>l.group==='Expense'||l.group==='Income').map(l=>l.account)),src=S.data.accounts.filter(a=>used.has(a.id)&&a.leaf).sort((x,y)=>pathOf(x).join(' › ').localeCompare(pathOf(y).join(' › ')));
    if(!src.length){toast('There are no categories with transactions yet.');return}
    const fill=()=>{const a=S.ix.accounts[$('ov-src').value];$('ov-dst').innerHTML=categoryAccounts(a.group).filter(x=>x.id!==a.id).map(x=>`<option value="${esc(x.id)}">${esc(pathOf(x).join(' › '))}</option>`).join('')};
    modal('Move a category',`<div class="form-grid"><label class="fld"><span>Move everything in</span><select id="ov-src">${src.map(a=>`<option value="${esc(a.id)}">${esc(a.group)} · ${esc(pathOf(a).join(' › '))}</option>`).join('')}</select></label><label class="fld"><span>into</span><select id="ov-dst"></select></label></div><p class="footnote">Income can only move to income categories, and spending to spending categories.</p>`,
     [{label:'Cancel',run:()=>$('modal').close()},{label:'Move',primary:true,run:()=>{const a=$('ov-src').value,b=$('ov-dst').value;if(!b){toast('Choose a category to move it into.');return}S.plan.catMap[a]=b;savePlan();rebuild();$('modal').close();render()}}]);
    fill();$('ov-src').onchange=fill;
  };
  document.querySelectorAll('[data-catdel]').forEach(b=>b.onclick=()=>{delete S.plan.catMap[b.dataset.catdel];savePlan();rebuild();render()});
  if($('ov-clear'))$('ov-clear').onclick=()=>{S.plan.recat={};savePlan();rebuild();render()};
}

/* ---- month-end close ---- */
const latestFullMonth=()=>{const L=S.ix.latest;let m=monthStart(L);if(endMonth(m)>L)m=addMonths(m,-1);return m.slice(0,7)};
const chosenMonth=()=>S.per.mode==='month'?`${S.per.y}-${String(S.per.m).padStart(2,'0')}`:null;
const closeMonthKey=()=>{const sel=chosenMonth();return sel&&endMonth(sel+'-01')<=S.ix.latest?sel:latestFullMonth()};
function monthFigs(d,ix,mk){
  const s=mk+'-01',e=endMonth(s),cap=e>ix.latest?ix.latest:e,a=actual(d,s,cap,ix),b=balances(d,e,ix);
  return{income:a.income,expense:a.expense,net:b.networth,tx:ix.txs.filter(t=>t.date>=s&&t.date<=e).length};
}
function closedStatus(d,ix){
  return Object.entries(S.plan.closes||{}).sort((x,y)=>y[0].localeCompare(x[0])).map(([mk,snap])=>{
    if(mk+'-01'>ix.latest)return{mk,snap,changed:false,diffs:[],future:true};
    const cur=monthFigs(d,ix,mk),diffs=[];
    if(Math.abs(cur.income-snap.income)>.5)diffs.push(['Income',cur.income-snap.income]);
    if(Math.abs(cur.expense-snap.expense)>.5)diffs.push(['Spending',cur.expense-snap.expense]);
    if(Math.abs(cur.net-snap.net)>.5)diffs.push(['Net worth',cur.net-snap.net]);
    if(cur.tx!==snap.tx)diffs.push(['Transactions',cur.tx-snap.tx]);
    return{mk,snap,cur,changed:diffs.length>0,diffs};
  });
}
function closeModel(mk){
  const ix=S.ix,d=S.data,s=mk+'-01',e=endMonth(s),errs=ix.errors.filter(x=>x.date>=s&&x.date<=e),base=baseCurrency(d),foreign=currencies().filter(c=>c!==base),hist=S.plan.fxh||{};
  const miss=foreign.filter(c=>!(hist[c]&&hist[c][mk])),chk=(S.plan.closeChecks||{})[mk]||{};
  const items=[
    {k:'data',label:'The export covers the whole month',ok:ix.latest>=e,level:'fail',note:ix.latest>=e?'Data runs to '+fdate(ix.latest)+'.':'The export ends '+fdate(ix.latest)+'. Import a later export first.'},
    {k:'bal',label:'Every transaction in the month balances',ok:!errs.length,level:'fail',note:errs.length?errs.length+' transaction'+(errs.length>1?'s':'')+' left out of the totals. See Data > Checks.':'No unbalanced transactions.'},
    {k:'fx',label:'Exchange rates entered for the month',ok:!foreign.length||!miss.length,level:'warn',note:!foreign.length?'Only one currency is in use.':miss.length?'Missing for '+miss.join(', ')+'. The export’s current rate is used instead.':'Entered for '+foreign.join(', ')+'.'},
    {k:'budget',label:'A budget is in force for the month',ok:!!budgetFor(mk),level:'warn',note:budgetFor(mk)?'Budget from '+fmonLong(budgetFor(mk).v.from+'-01')+'.':'No budget covers this month.'},
    {k:'recon',label:'Checked against Moneydance',manual:true,ok:!!chk.recon,level:'warn',note:'Use Data > Check against Moneydance, then tick this.'},
    {k:'oneoff',label:'One-off items reviewed',manual:true,ok:!!chk.oneoff,level:'warn',note:'Mark unusual items as one-off so they do not skew averages.'}
  ];
  return{mk,s,e,items,figs:monthFigs(d,ix,mk),canClose:items.filter(i=>i.level==='fail').every(i=>i.ok),snap:(S.plan.closes||{})[mk]||null};
}
function itemStatus(i){return i.ok?{t:'Pass',k:'good',tone:'good',dir:'up'}:i.level==='fail'?{t:'Fix',k:'bad',tone:'bad',dir:'down'}:{t:'Check',k:'warn',tone:'flat',dir:'flat'}}
function pClose(){
  const mk=closeMonthKey(),m=closeModel(mk),st=closedStatus(S.data,S.ix),sel=chosenMonth(),why=sel&&sel!==mk?fmonLong(sel+'-01')+' is not complete yet, so the latest full month is shown. ':!sel?'Showing the latest full month. Choose Period, then Month, to pick another. ':'';
  const row=i=>{const s=itemStatus(i);return`<div class="row"><div><span class="t">${esc(i.label)}</span><small>${esc(i.note)}</small>${i.manual?`<label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:13.5px"><input type="checkbox" data-chk="${i.k}" ${i.ok?'checked':''}> I have done this</label>`:''}</div><div class="amt">${pill(s.t,s.k)}</div></div>`};
  const closed=m.snap;
  return`<section class="card"><div class="head"><div><h2>Month-end close: ${esc(fmonLong(m.s))}</h2><p class="sub">${why}Work down the checklist, then close the month. Later imports are compared against the figures you closed with.</p></div></div>
   <div class="kpis four" style="margin-top:0">${kpi('Income',fmt(m.figs.income),'')}${kpi('Spending',fmt(m.figs.expense),'')}${kpi('Surplus',fmt(m.figs.income-m.figs.expense),'')}${kpi('Net worth at month-end',fmt(m.figs.net),m.figs.tx+' transactions')}</div>
   <div class="list" style="margin-top:14px">${m.items.map(row).join('')}</div>
   <div class="actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:16px">${closed?`${pill('Closed '+new Date(closed.at).toLocaleDateString('en-GB'),'good')}<button class="btn small" id="cl-reopen">Reopen the month</button>`:`<button class="btn primary" id="cl-close" ${m.canClose?'':'disabled'}>Close ${esc(fmonLong(m.s))}</button>${m.canClose?'':'<span class="sub">Fix the items marked Fix first.</span>'}`}</div></section>
   <section class="card block"><div class="head"><div><h2>Closed months</h2><p class="sub">Each closed month keeps a snapshot. If a later import changes it, you will see exactly what moved.</p></div></div>${st.length?st.map(x=>`<div class="row"><div><span class="t">${esc(fmonLong(x.mk+'-01'))}</span><small>Closed ${esc(new Date(x.snap.at).toLocaleDateString('en-GB'))} · income ${fmt(x.snap.income)} · spending ${fmt(x.snap.expense)} · net worth ${fmt(x.snap.net)}</small>${x.changed?`<small style="margin-top:4px">${x.diffs.map(([n,v])=>`<span class="vchip ${n==='Income'||n==='Net worth'?(v>0?'good':'bad'):(v>0?'bad':'good')}">${v>0?'▲':'▼'} ${n} ${n==='Transactions'?Math.abs(v):fmt(Math.abs(v))}</span>`).join(' ')}</small>`:''}</div><div class="amt">${x.future?pill('Not in data','warn'):x.changed?pill('Changed since closing','bad'):pill('Unchanged','good')}</div></div>`).join(''):'<div class="empty" style="padding:22px 0">No months closed yet.</div>'}</section>`;
}
function bindClose(){
  const mk=closeMonthKey();
  document.querySelectorAll('[data-chk]').forEach(el=>el.onchange=()=>{const c=(S.plan.closeChecks[mk]??={});c[el.dataset.chk]=el.checked;savePlan();render()});
  if($('cl-close'))$('cl-close').onclick=()=>{const m=closeModel(mk);S.plan.closes[mk]={at:new Date().toISOString(),...m.figs,checks:Object.fromEntries(m.items.map(i=>[i.k,i.ok]))};savePlan();toast(fmonLong(mk+'-01')+' closed.');render()};
  if($('cl-reopen'))$('cl-reopen').onclick=()=>modal('Reopen this month?','<p>The snapshot is deleted. You can close the month again afterwards.</p>',[{label:'Cancel',run:()=>$('modal').close()},{label:'Reopen',primary:true,run:()=>{delete S.plan.closes[mk];savePlan();$('modal').close();render()}}]);
}

/* ---- sparklines, donut, tooltip ---- */
function spark(vals,color){
  const v=vals.filter(Number.isFinite);if(v.length<2)return'';
  const w=84,h=26,mn=Math.min(...v),mx=Math.max(...v),rg=mx-mn||1,x=i=>2+i*(w-4)/(vals.length-1),y=t=>h-3-(t-mn)/rg*(h-6);
  const pts=vals.map((t,i)=>Number.isFinite(t)?x(i).toFixed(1)+','+y(t).toFixed(1):null).filter(Boolean),last=pts.at(-1).split(',');
  return`<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--${color})" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="var(--${color})"/></svg>`;
}
function donutCard(a){
  const cats={};for(const l of a.exLines){const k=NW.test(l.main)?(l.level2||l.label):l.main;cats[k]=(cats[k]||0)+l.value}
  let list=Object.entries(cats).filter(([,v])=>v>0).sort((x,y)=>y[1]-x[1]);const total=sum(list,x=>x[1]);
  if(!(total>0))return'';
  if(list.length>6){const rest=sum(list.slice(5),x=>x[1]);list=[...list.slice(0,5),['Everything else',rest]]}
  const cx=84,cy=84,R=72,r=46;let ang=-Math.PI/2,paths='';
  list.forEach(([k,v],i)=>{
    const frac=v/total,a1=ang+frac*Math.PI*2;
    if(frac>=.9999)paths+=`<circle class="dn dn${i}" cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke-width="${R-r}"/>`;
    else{
      const p=(rad,t)=>[(cx+rad*Math.cos(t)).toFixed(2),(cy+rad*Math.sin(t)).toFixed(2)],big=frac>.5?1:0,[x0,y0]=p(R,ang),[x1,y1]=p(R,a1),[x2,y2]=p(r,a1),[x3,y3]=p(r,ang);
      paths+=`<path class="dn dn${i}" d="M${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${big} 0 ${x3} ${y3}Z"><title>${esc(k)}: ${esc(S.cur)} ${fmt(v)}</title></path>`;
    }
    ang=a1;
  });
  return`<section class="card block"><div class="head"><div><h2>Spending mix</h2><p class="sub">${esc(S.cur)} · ${esc(periodLabel())}</p></div></div>
   <div class="donut-wrap"><svg class="donut" viewBox="0 0 168 168" role="img" aria-label="Spending mix by category">${paths}<text x="84" y="80" text-anchor="middle" class="dn-t1">${esc(S.cur)}</text><text x="84" y="98" text-anchor="middle" class="dn-t2">${fmt(total)}</text></svg>
   <div class="dn-legend">${list.map(([k,v],i)=>`<div class="dn-row"><i class="dnb dnb${i}"></i><span>${esc(k)}</span><b>${fmt(v)}</b><small>${pct(v/total)}</small></div>`).join('')}</div></div></section>`;
}
function payeesCard(a){
  const g={};for(const l of a.exLines){const k=normDesc(l.description)||l.description||'(no description)';(g[k]??={name:l.description||'(no description)',v:0,n:0}).v+=l.value;g[k].n++}
  const list=Object.values(g).sort((x,y)=>y.v-x.v).slice(0,10),total=a.expense;
  if(!list.length)return'';
  return`<section class="card block"><div class="head"><div><h2>Top payees</h2><p class="sub">Where the money went, grouped by description. Select one to see its transactions.</p></div></div>${list.map(p=>`<button class="row" data-payee="${esc(p.name)}"><div><span class="t">${esc(p.name)}</span><small>${p.n} payment${p.n>1?'s':''} · average ${fmt(p.v/p.n)}</small></div><div class="amt">${fmt(p.v)}<small>${pct(total>0?p.v/total:null)}</small></div></button>`).join('')}</section>`;
}
(()=>{
  let tip=null;
  const show=(e,t)=>{if(!tip){tip=document.createElement('div');tip.className='tip';document.body.append(tip)}tip.textContent=t;const w=tip.offsetWidth,x=Math.min(window.innerWidth-w-8,Math.max(8,e.clientX+12));tip.style.left=x+'px';tip.style.top=Math.max(8,e.clientY-tip.offsetHeight-12)+'px';tip.style.display='block'};
  const hide=()=>{if(tip)tip.style.display='none'};
  const find=e=>e.target&&e.target.closest?e.target.closest('[data-tip]'):null;
  document.addEventListener('pointermove',e=>{const t=find(e);if(t)show(e,t.getAttribute('data-tip'));else hide()});
  document.addEventListener('pointerdown',e=>{const t=find(e);if(t)show(e,t.getAttribute('data-tip'));else hide()});
  document.addEventListener('scroll',hide,{passive:true});
})();

/* ---- quick search ---- */
function openSearch(){
  const acts=[
    ['Import an export',()=>$('file').click()],['Appearance',()=>openAppearance()],[S.mask?'Show amounts':'Hide amounts',()=>{S.mask=!S.mask;store.set();render()}],
    ...(store.lock()?[['Lock now',()=>lockNow()]]:[]),
    ...(S.data?[['Save full summary as PDF',()=>exportPdf('summary')],['Save year in review as PDF',()=>exportPdf('year')]]:[])
  ];
  const go=(page,extra)=>()=>{S.page=page;S.pg=0;if(extra)extra();S.anim=true;render();window.scrollTo(0,0)};
  const results=q=>{
    const t=q.trim().toLowerCase(),out=[];
    const has=x=>!t||String(x).toLowerCase().includes(t);
    if(S.data)PAGES.filter(([,n])=>has(n)).forEach(([k,n])=>out.push({g:'Go to',label:n,run:go(k)}));
    acts.filter(([n])=>has(n)).forEach(([n,run])=>out.push({g:'Actions',label:n,run}));
    if(S.data&&t){
      const ix=S.ix;
      S.data.accounts.filter(a=>(a.group==='Asset'||a.group==='Liability')&&ix.good.some(l=>l.account===a.id)&&(a.name.toLowerCase().includes(t))).slice(0,5).forEach(a=>out.push({g:'Accounts',label:a.label,sub:a.name,run:go('activity',()=>{S.acct=a.id;S.q='';S.type='all';S.per={...S.per,mode:'all'}})}));
      const cats=[...new Set(ix.good.filter(l=>l.group==='Expense'||l.group==='Income').map(l=>catKey(l)))].filter(k=>k.toLowerCase().includes(t)).slice(0,5);
      cats.forEach(k=>out.push({g:'Categories',label:k,run:go('activity',()=>{S.q=k.split(' › ').pop();S.acct='';S.type='all';S.per={...S.per,mode:'all'}})}));
      ix.txs.filter(x=>x.q.includes(t)||x.cat.toLowerCase().includes(t)).slice(0,8).forEach(x=>out.push({g:'Transactions',label:x.description,sub:fdate(x.date)+' · '+(x.cat||x.kind),run:()=>txModal(x.tx)}));
    }
    return out.slice(0,24);
  };
  modal('Search',`<input id="qs-in" class="search" type="search" placeholder="${S.data?'Search pages, accounts, categories and transactions':'Search actions'}" autocomplete="off" style="width:100%" aria-label="Search"><div id="qs-out" class="list" role="listbox" style="margin-top:10px"></div>`);
  let act=0,cur=[];
  const draw=()=>{
    cur=results($('qs-in').value);act=Math.min(act,Math.max(0,cur.length-1));let g='';
    $('qs-out').innerHTML=cur.map((r,i)=>{const head=r.g!==g?`<div class="qs-g">${esc(r.g)}</div>`:'';g=r.g;return head+`<button class="row qs-r" role="option" aria-selected="${i===act}" data-qi="${i}"><div><span class="t">${esc(r.label)}</span>${r.sub?`<small>${esc(r.sub)}</small>`:''}</div></button>`}).join('')||'<div class="empty" style="padding:20px 0">Nothing found.</div>';
    document.querySelectorAll('.qs-r').forEach(b=>{b.onclick=()=>{const r=cur[+b.dataset.qi];$('modal').close();r.run()}});
  };
  $('qs-in').oninput=()=>{act=0;draw()};
  $('qs-in').onkeydown=e=>{
    if(e.key==='ArrowDown'){e.preventDefault();act=Math.min(cur.length-1,act+1);draw();document.querySelector('.qs-r[aria-selected="true"]')?.scrollIntoView({block:'nearest'})}
    else if(e.key==='ArrowUp'){e.preventDefault();act=Math.max(0,act-1);draw();document.querySelector('.qs-r[aria-selected="true"]')?.scrollIntoView({block:'nearest'})}
    else if(e.key==='Enter'&&cur[act]){e.preventDefault();const r=cur[act];$('modal').close();r.run()}
  };
  draw();$('qs-in').focus();setTimeout(()=>{if(document.activeElement!==$('qs-in')&&$('modal').open)$('qs-in').focus()},40);
}
window.addEventListener('keydown',e=>{
  if(S.locked)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();return}
  if(e.key==='/'&&!/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||'')&&!$('modal').open){e.preventDefault();openSearch()}
});

/* ============================================================
   Back / forward, compact period bar, account drill-downs
   ============================================================ */
const NAV={stack:[],i:-1,busy:false,t:0,perPush:false};
const navFields=()=>({page:S.page,per:{...S.per},ptab:S.ptab,report:S.report,q:S.q,acct:S.acct,type:S.type,pg:S.pg,amin:S.amin,amax:S.amax,mv:S.mv?{k:S.mv.k,a:[...S.mv.a]}:null});
const navKey=n=>JSON.stringify({page:n.page,per:n.per,ptab:n.ptab,report:n.report,q:n.q,acct:n.acct,type:n.type,pg:n.pg,amin:n.amin,amax:n.amax,mv:n.mv});
function navButtons(){
  const b=$('nav-back'),f=$('nav-fwd');if(!b)return;
  const on=!!S.data&&!S.locked;
  b.hidden=f.hidden=!on;b.disabled=NAV.i<=0;f.disabled=NAV.i>=NAV.stack.length-1;
  const mb=$('mnav-back'),mf=$('mnav-fwd');
  if(mb){$('mnav').hidden=!(on&&S.mv);mb.disabled=b.disabled;mf.disabled=f.disabled}
}
function navReset(){NAV.stack=[];NAV.i=-1;navButtons()}
function navCommit(){
  if(NAV.busy||!S.data||S.locked)return;
  const cur=navFields(),top=NAV.stack[NAV.i];
  if(top&&navKey(top)===navKey(cur)){navButtons();return}
  if(top)top.scroll=window.scrollY;
  const onlyPeriod=!!top&&navKey({...top,per:cur.per})===navKey(cur);
  if(onlyPeriod&&NAV.perPush&&NAV.i===NAV.stack.length-1&&Date.now()-NAV.t<1500)NAV.stack[NAV.i]={...cur,scroll:top.scroll};
  else{NAV.stack=NAV.stack.slice(0,NAV.i+1);NAV.stack.push({...cur,scroll:0});NAV.i++;NAV.perPush=onlyPeriod;if(NAV.stack.length>80){NAV.stack.shift();NAV.i--}}
  NAV.t=Date.now();navButtons();
}
function navTouch(){const t=NAV.stack[NAV.i];if(t&&!NAV.busy&&!S.mv)NAV.stack[NAV.i]={...navFields(),scroll:t.scroll}}
function navTo(j){
  if(j<0||j>=NAV.stack.length||j===NAV.i)return;
  const cur=NAV.stack[NAV.i];if(cur)cur.scroll=window.scrollY;
  NAV.busy=true;NAV.i=j;const n=NAV.stack[j];
  Object.assign(S,{page:n.page,per:{...n.per},ptab:n.ptab,report:n.report,q:n.q,acct:n.acct,type:n.type,pg:n.pg,amin:n.amin,amax:n.amax});
  S.mv=null;S.ctlOpen=false;
  if($('modal').open)$('modal').close();
  S.anim=true;render();
  if(n.mv){try{restoreMv(n.mv)}catch(e){}}
  NAV.busy=false;navButtons();
  requestAnimationFrame(()=>window.scrollTo(0,n.scroll||0));
}
const navBack=()=>navTo(NAV.i-1),navFwd=()=>navTo(NAV.i+1);
function restoreMv(mv){
  if(mv.k==='tx')txModal(mv.a[0]);
  else if(mv.k==='lines')openLines(...mv.a);
  else if(mv.k==='explain'){const[s,e]=range();explainCategory(mv.a[0],s,e)}
  else if(mv.k==='accts')openAccounts(...mv.a);
}
$('nav-back').onclick=navBack;$('nav-fwd').onclick=navFwd;$('mnav-back').onclick=navBack;$('mnav-fwd').onclick=navFwd;
$('modal').addEventListener('close',()=>{
  if($('modal').open||NAV.busy||!S.mv)return;
  S.mv=null;
  const cur=NAV.stack[NAV.i];
  if(cur&&cur.mv){
    const prev=NAV.stack[NAV.i-1],base={...cur,mv:null};
    if(prev&&navKey(prev)===navKey(base)){NAV.i--;navButtons()}else navCommit();
  }
});
window.addEventListener('keydown',e=>{
  if(S.locked||!S.data)return;
  if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();navBack()}
  else if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();navFwd()}
});
window.addEventListener('mouseup',e=>{
  if(S.locked||!S.data)return;
  if(e.button===3){e.preventDefault();navBack()}else if(e.button===4){e.preventDefault();navFwd()}
});

/* ---- compact period bar ---- */
const periodShort=()=>{
  const p=S.per,[s,e]=range();
  return p.mode==='month'?fmonLong(s):p.mode==='year'?String(p.y):p.mode==='ytd'?'Year to date':p.mode==='12m'?'Last 12 months':p.mode==='all'?'All time':fdate(s)+' – '+fdate(e);
};
function pbarHTML(){
  const p=S.per,can=p.mode==='month'||p.mode==='year';
  return`<button class="pb-step" data-pstep="-1" ${can?'':'disabled'} aria-label="Previous ${p.mode==='year'?'year':'month'}">‹</button>
  <button class="pb-label" id="pb-toggle" aria-expanded="${S.ctlOpen?'true':'false'}" aria-controls="controls"><span class="pb-main">${esc(periodShort())}</span><span class="pb-sub">${esc(S.cur)} · data to ${esc(fdate(S.ix.latest))}</span><svg class="pb-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
  <button class="pb-step" data-pstep="1" ${can?'':'disabled'} aria-label="Next ${p.mode==='year'?'year':'month'}">›</button>`;
}
function stepPeriod(st){
  const p=S.per;
  if(p.mode==='month'){let m=p.m+st,y=p.y;if(m<1){m=12;y--}if(m>12){m=1;y++}
    const key=`${y}-${String(m).padStart(2,'0')}`;
    if(key<S.ix.earliest.slice(0,7)||key>S.ix.latest.slice(0,7)){toast('No data for '+fmonLong(key+'-01')+'.');return}
    p.m=m;p.y=y}
  else if(p.mode==='year'){const y=p.y+st;if(y<+S.ix.earliest.slice(0,4)||y>+S.ix.latest.slice(0,4)){toast('No data for '+y+'.');return}p.y=y}
  else return;
  S.pg=0;render();
}
function bindPbar(){
  document.querySelectorAll('[data-pstep]').forEach(b=>b.onclick=()=>stepPeriod(+b.dataset.pstep));
  $('pb-toggle').onclick=()=>{S.ctlOpen=!S.ctlOpen;$('controls').classList.toggle('open',S.ctlOpen);$('pb-toggle').setAttribute('aria-expanded',String(S.ctlOpen))};
  if($('pb-done'))$('pb-done').onclick=()=>{S.ctlOpen=false;$('controls').classList.remove('open');$('pb-toggle').setAttribute('aria-expanded','false')};
}

/* ---- balance sheet groups and account drill-downs ---- */
function bsKey(a){
  if(a.group==='Asset'){if(isCash(a))return'Asset|Cash and bank';if(a.type==='SECURITY'||a.type==='INVESTMENT')return'Asset|Investments';return'Asset|'+(a.main||'Other assets')}
  if(a.group==='Liability'){if(a.type==='CREDIT CARD')return'Liability|Credit cards';return'Liability|'+(a.main||'Other liabilities')}
  return null;
}
function bsRows(b){
  const A={},Lb={};
  for(const r of b.rows){
    if(r.value===null||(Math.abs(r.native)<=.005&&Math.abs(r.value)<=.005))continue;
    const k=bsKey(r);if(!k)continue;
    if(k.startsWith('Asset'))A[k]=(A[k]||0)+r.value;else Lb[k]=(Lb[k]||0)-r.value;
  }
  const order=(o,first)=>Object.entries(o).sort((x,y)=>{const fx=first.indexOf(x[0]),fy=first.indexOf(y[0]);return(fx<0?99:fx)-(fy<0?99:fy)||Math.abs(y[1])-Math.abs(x[1])});
  const sub=e=>e.map(([k,v])=>[k.split('|')[1],v,'sub',null,'',k]);
  return[['Assets',null,'head'],...sub(order(A,['Asset|Cash and bank','Asset|Investments'])),['Total assets',b.assets,'total'],
    ['Liabilities',null,'head'],...sub(order(Lb,['Liability|Credit cards'])),['Total liabilities',b.debt,'total'],['Net worth',b.networth,'total']];
}
function openAccounts(kind,key){
  const ix=S.ix,d=S.data,[s,e]=range();let title,sub,rows;
  if(kind==='bs'){
    const b=balances(d,e,ix),sec=key.split('|')[0],sg=sec==='Liability'?-1:1;
    title=key.split('|')[1];sub='As of '+fdate(b.asOf);
    rows=b.rows.filter(a=>bsKey(a)===key&&a.value!==null&&(Math.abs(a.native)>.005||Math.abs(a.value)>.005)).map(a=>({code:a.code,name:pathOf(a).join(' › '),cur:a.currency,native:sg*a.native,value:sg*a.value}));
  }else{
    const parts=key.split('|'),cap=e>ix.latest?ix.latest:e,a=actual(d,s,cap,ix),inc=parts[0]==='inc';
    const lines=(inc?a.incLines:a.exLines).filter(l=>(l.main||'Uncategorised')===parts[1]&&(parts[2]==null||(l.level2||l.label)===parts[2])),g={};
    for(const l of lines){const k=l.catId||l.account;(g[k]??={code:l.code,name:pathOf(l).join(' › '),cur:l.a.currency,native:0,value:0})}
    for(const l of lines){const k=l.catId||l.account;g[k].native+=inc?-l.amount:l.amount;g[k].value+=inc?-l.value:l.value}
    title=parts.slice(1).join(' › ');sub=periodLabel();rows=Object.values(g);
  }
  rows.sort((x,y)=>Math.abs(y.value)-Math.abs(x.value));
  const total=sum(rows,r=>r.value);
  modal(title,`<p class="sub">${esc(sub)} · ${esc(S.cur)}. ${rows.length} account${rows.length===1?'':'s'}. These add up to the line you selected.</p>
   <div class="list"><div class="row"><div><span class="t">Total</span></div><div class="amt"><strong>${fmt(total,2)}</strong></div></div>${rows.map(r=>`<div class="row"><div><span class="t">${r.code?esc(r.code)+' · ':''}${esc(r.name)}</span><small>${esc(r.cur)}${r.cur!==S.cur?' · '+natf(r.native,2,2)+' '+esc(r.cur):''}</small></div><div class="amt">${fmt(r.value,2)}</div></div>`).join('')}</div>`);
  S.mv={k:'accts',a:[kind,key]};navCommit();
}
function openLines(mn,kn,ln){
  const[s,e]=range(),ix=S.ix,cap=e>ix.latest?ix.latest:e,a=actual(S.data,s,cap,ix);
  const ls=a.exLines.filter(l=>(l.main||'Uncategorised')===mn&&(l.level2||l.label)===kn&&l.label===ln).sort((x,y)=>y.date.localeCompare(x.date));
  showLines((ls[0]&&ls[0].code?ls[0].code+' · ':'')+pathOf(ls[0]||{main:mn,label:ln}).join(' › '),ls);
  S.mv={k:'lines',a:[mn,kn,ln]};navCommit();
}
function mergePlans(cur,inc){
  const out=JSON.parse(JSON.stringify(cur)),I=mergePlan(inc);
  for(const k of ['oneoffs','classMap','loans','ignoreRec','recat','catMap','closes','closeChecks'])out[k]={...out[k],...I[k]};
  for(const c in I.fxh)out.fxh[c]={...(out.fxh[c]||{}),...I.fxh[c]};
  const bk=new Map(out.budgets.map(b=>[b.from,b]));I.budgets.forEach(b=>bk.set(b.from,b));out.budgets=[...bk.values()].sort((a,b)=>a.from.localeCompare(b.from));
  const gs=new Map(out.goals.map(g=>[g.id,g]));I.goals.forEach(g=>gs.set(g.id,g));out.goals=[...gs.values()];
  const cmm=new Map((out.commitments||[]).map(c=>[c.id,c]));(I.commitments||[]).forEach(c=>cmm.set(c.id,c));out.commitments=[...cmm.values()];
  const cl=new Map((out.customLines||[]).map(c=>[c.key,c]));(I.customLines||[]).forEach(c=>cl.set(c.key,c));out.customLines=[...cl.values()];
  const dflFc=defaultPlan().fc;if(JSON.stringify({...out.fc,events:[]})===JSON.stringify({...dflFc,events:[]}))out.fc={...out.fc,...I.fc,events:out.fc.events};
  const ev=[...out.fc.events];for(const e of I.fc.events)if(!ev.some(x=>x.name===e.name&&x.month===e.month&&x.amount===e.amount&&x.cur===e.cur))ev.push(e);out.fc.events=ev;
  return out;
}

