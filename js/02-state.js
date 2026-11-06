'use strict';
/* ============================================================
   App state + persistence
   ============================================================ */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S={page:'overview',data:null,ix:null,meta:null,raw:'',cur:'',per:null,q:'',acct:'',type:'all',pg:0,report:'position',aq:'',theme:'auto',targets:{needs:50,wants:30,save:20},charts:{},
  mask:false,look:null,autoLock:5,key:null,locked:false,plan:null,ptab:'outlook',lastActive:Date.now(),hiddenAt:0,hist:[],amin:'',amax:'',mv:null,ctlOpen:false,fcDetail:false};

let S_layoutDefault=null;
const store={
  get(){try{return JSON.parse(localStorage.getItem('money-status.settings')||'{}')}catch(e){return{}}},
  set(){try{localStorage.setItem('money-status.settings',JSON.stringify({cur:S.cur,theme:S.theme,targets:S.targets,mask:S.mask,autoLock:S.autoLock,look:S.look,layout:S.layout,lastBackup:S.lastBackup||null}))}catch(e){}},
  lock(){try{return JSON.parse(localStorage.getItem('money-status.lock')||'null')}catch(e){return null}},
  setLock(r){if(r)localStorage.setItem('money-status.lock',JSON.stringify(r));else localStorage.removeItem('money-status.lock')}
};
const DB={
  open(){return new Promise((res,rej)=>{try{const r=indexedDB.open('money-status',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})},
  async run(mode,fn){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('kv',mode),o=t.objectStore('kv'),q=fn(o);t.oncomplete=()=>{db.close();res(q&&q.result)};t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})},
  get(k){return this.run('readonly',o=>o.get(k))},put(k,v){return this.run('readwrite',o=>o.put(v,k))},del(k){return this.run('readwrite',o=>o.delete(k))},
  putMany(obj){return this.run('readwrite',o=>{for(const k in obj)o.put(obj[k],k)})},
  clear(){return this.run('readwrite',o=>{o.delete('export');o.delete('history');o.delete('plan')})}
};

/* Optional passcode: AES-GCM encryption of everything saved on this device */
const te=new TextEncoder(),td=new TextDecoder();
const b64=u=>{let t='';for(let i=0;i<u.length;i++)t+=String.fromCharCode(u[i]);return btoa(t)};
const unb64=t=>Uint8Array.from(atob(t),c=>c.charCodeAt(0));
const CR={
  available:()=>!!(window.crypto&&crypto.subtle),
  async derive(pass,salt){const km=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])},
  async enc(key,text){const iv=crypto.getRandomValues(new Uint8Array(12)),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(text)));return{iv,ct}},
  async dec(key,o){return td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:o.iv},key,o.ct))}
};
async function pack(text,key=S.key){return key?{enc:true,...(await CR.enc(key,text))}:{enc:false,text}}
async function unpack(o,key=S.key){if(!o)throw new Error('Nothing saved');if(!o.enc)return o.text;if(!key)throw new Error('Locked');return CR.dec(key,o)}

async function rewrap(newKey){
  const cur=await DB.get('export'),hist=(await DB.get('history'))||[],pl=await DB.get('plan'),out={};
  if(cur&&!cur.text)out.export={...cur,payload:await pack(await unpack(cur.payload),newKey)};
  if(hist.length)out.history=await Promise.all(hist.map(async h=>({...h,payload:await pack(await unpack(h.payload),newKey)})));
  if(pl)out.plan=await pack(await unpack(pl),newKey);
  return out;
}
async function setPasscode(pass){
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await CR.derive(pass,salt),chk=await CR.enc(key,'ok'),data=await rewrap(key);
  store.setLock({salt:b64(salt),check:{iv:b64(chk.iv),ct:b64(chk.ct)}});
  if(Object.keys(data).length)await DB.putMany(data);
  S.key=key;
}
async function clearPasscode(){
  const data=await rewrap(null);
  if(Object.keys(data).length)await DB.putMany(data);
  store.setLock(null);S.key=null;
}

const defaultPlan=()=>({fxh:{},budgets:[],goals:[],oneoffs:{},classMap:{},loans:{},ignoreRec:{},updatedAt:0,recat:{},catMap:{},closes:{},closeChecks:{},commitments:[],customLines:[],bfrom:null,fc:{scenario:'base',income:null,spend:null,reserve:0,countIncome:false,events:[],horizon:12,scen:{}}});
const mergePlan=p=>{const d=defaultPlan();return{...d,...p,fc:{...d.fc,...(p.fc||{})}}};
let saveT;
function savePlan(){S.plan.updatedAt=Date.now();clearTimeout(saveT);saveT=setTimeout(async()=>{try{await DB.put('plan',await pack(JSON.stringify(S.plan)))}catch(e){toast('Your plan could not be saved in this browser.')}},250)}
function rebuild(){S.data.fxh=S.plan.fxh;S.data.classMap=S.plan.classMap;S.data.recat=S.plan.recat;S.data.catMap=S.plan.catMap;S.ix=buildIndex(S.data)}

async function loadAll(){
  S.plan=defaultPlan();S.hist=[];
  try{S.hist=(await DB.get('history'))||[]}catch(e){}
  try{const pl=await DB.get('plan');if(pl)S.plan=mergePlan(JSON.parse(await unpack(pl)))}catch(e){}
  try{
    const saved=await DB.get('export');
    if(saved){const text=saved.text??await unpack(saved.payload),p=parseTXT(text,saved.filename);if(!p.errors.length)applyParsed(p,text,saved.importedAt)}
  }catch(e){}
}

function currencies(){
  const set=new Map();for(const a of S.data.accounts)if(a.type!=='SECURITY'&&rate(S.data,a.currency)!==null){const u=String(a.currency).toUpperCase();if(!set.has(u))set.set(u,u)}
  const list=[...set.keys()];list.sort((a,b)=>Math.abs((rate(S.data,a)||0)-1)<1e-9?-1:Math.abs((rate(S.data,b)||0)-1)<1e-9?1:a.localeCompare(b));
  return list;
}
function initPeriod(){
  const L=S.ix.latest;let m=monthStart(L);
  /* current month, unless only the first few days of it are in the data: then the month before */
  if(+L.slice(8,10)<=7&&addMonths(m,-1)>=monthStart(S.ix.earliest))m=addMonths(m,-1);
  S.per={mode:'month',y:+m.slice(0,4),m:+m.slice(5,7),from:m,to:endMonth(m)>L?L:endMonth(m)};S.ctlOpen=false;
}
function applyParsed(p,text,importedAt,sample){
  S.plan??=defaultPlan();
  S.data={accounts:p.accounts,lines:p.lines,fx:p.fx,fxh:S.plan.fxh,classMap:S.plan.classMap,recat:S.plan.recat,catMap:S.plan.catMap};
  S.ix=buildIndex(S.data);S.raw=text||'';
  S.meta={filename:p.filename,importedAt:importedAt||new Date().toISOString(),accounts:p.accounts.length,txCount:p.txCount,postings:p.lines.length,earliest:S.ix.earliest,latest:S.ix.latest,warnings:p.warnings,sample:!!sample};
  const cs=currencies();if(!cs.includes(S.cur))S.cur=cs[0]||'';
  initPeriod();S.q='';S.acct='';S.pg=0;S.mv=null;navReset();
}
async function commitImport(p,text){
  const prev=S.data&&!S.meta.sample?{meta:S.meta,raw:S.raw}:null;
  applyParsed(p,text);
  try{
    if(prev){
      const h=(await DB.get('history'))||[];
      h.unshift({filename:prev.meta.filename,importedAt:prev.meta.importedAt,accounts:prev.meta.accounts,txCount:prev.meta.txCount,latest:prev.meta.latest,payload:await pack(prev.raw)});
      await DB.put('history',h.slice(0,3));
    }
    await DB.put('export',{filename:p.filename,importedAt:S.meta.importedAt,payload:await pack(text)});
    S.hist=(await DB.get('history'))||[];
    try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  }catch(e){toast('Imported, but this browser would not save it, so it will be gone when you close the page.')}
}

/* Compare a new export with what is loaded now */
function diffData(p){
  const oldD=S.data,oldIx=S.ix;
  const om=new Map(oldD.lines.map(l=>[l.id,l])),nm=new Map(p.lines.map(l=>[l.id,l]));
  const added=[],removed=[],changed=[];
  for(const[id,l]of nm){const o=om.get(id);if(!o)added.push(l);else if(o.amount!==l.amount||o.date!==l.date||o.description!==l.description||o.memo!==l.memo||o.account!==l.account)changed.push({o,l})}
  for(const[id,l]of om)if(!nm.has(id))removed.push(l);
  const oa=new Map(oldD.accounts.map(a=>[a.id,a])),na=new Map(p.accounts.map(a=>[a.id,a]));
  const missing=[...oa.values()].filter(a=>!na.has(a.id)),fresh=[...na.values()].filter(a=>!oa.has(a.id));
  const opening=[...na.values()].filter(a=>oa.has(a.id)&&Math.abs(oa.get(a.id).opening-a.opening)>.005);
  const nd={accounts:p.accounts,lines:p.lines,fx:p.fx,fxh:S.plan.fxh,classMap:S.plan.classMap,recat:S.plan.recat,catMap:S.plan.catMap},nix=buildIndex(nd);
  const before=balances(oldD,oldIx.latest,oldIx).networth,after=balances(nd,nix.latest,nix).networth;
  const txs=a=>new Set(a.map(x=>(x.l||x).tx)).size;
  const flags=[];
  if(missing.length)flags.push(missing.length+' account'+(missing.length>1?'s':'')+' in your current data '+(missing.length>1?'are':'is')+' missing from this file. It may be a partial export.');
  if(p.earliest>oldIx.earliest)flags.push('This file starts later ('+fdate(p.earliest)+') than your current history ('+fdate(oldIx.earliest)+'). Older transactions would disappear.');
  if(p.latest<oldIx.latest)flags.push('This file ends '+fdate(p.latest)+', earlier than your current data ('+fdate(oldIx.latest)+').');
  if(removed.length>Math.max(10,oldD.lines.length*.05))flags.push('More than 5% of your current postings are not in this file.');
  for(const x of closedStatus(nd,nix).filter(x=>x.changed))flags.push('Closed month '+fmonLong(x.mk+'-01')+' would change ('+x.diffs.map(d=>d[0].toLowerCase()).join(', ')+').');
  if(opening.length)flags.push(opening.length+' account'+(opening.length>1?'s have':' has')+' a different opening balance.');
  return{added,removed,changed,missing,fresh,opening,before,after,flags,txAdded:txs(added),txRemoved:txs(removed),txChanged:txs(changed)};
}

/* ============================================================
   Formatting
   ============================================================ */
const conv=v=>v/(rate(S.data,S.cur)||1);
const nf=(dec)=>new Intl.NumberFormat(S.cur==='INR'?'en-IN':'en-GB',{minimumFractionDigits:dec,maximumFractionDigits:dec});
const fmt=(v,dec=0)=>{if(v===null||v===undefined||!Number.isFinite(v))return'—';if(S.mask)return'••••';let n=conv(v);if(Math.abs(n)<.5*Math.pow(10,-dec))n=0;return nf(dec).format(n).replace('-','−')};
const natf=(v,min,max)=>S.mask?'••••':new Intl.NumberFormat('en-GB',{minimumFractionDigits:min,maximumFractionDigits:max}).format(v).replace('-','−');
const compact=v=>{if(S.mask)return'•';const n=conv(v),a=Math.abs(n);return a>=1e7&&S.cur==='INR'?(n/1e7).toFixed(1)+'Cr':a>=1e6?(n/1e6).toFixed(1)+'m':a>=1e3?(n/1e3).toFixed(0)+'k':n.toFixed(0)};
const pct=v=>v===null||!Number.isFinite(v)?'—':(v*100).toFixed(1)+'%';
const fdate=s=>s?D(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'—';
const fmon=s=>D(s).toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'});
const fmonLong=s=>D(s).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const sign=v=>Math.abs(v)<.005?'neu':v>0?'pos':'neg';
const pill=(t,k='')=>`<span class="pill ${k}">${esc(t)}</span>`;
function change(cur,prev,invert=false){
  if(prev===null||prev===undefined||!Number.isFinite(prev)||Math.abs(prev)<1e-9)return'';
  const d=(cur-prev)/Math.abs(prev),good=invert?d<0:d>0,flat=Math.abs(d)<.0005;
  return`<span class="chg ${flat?'flat':good?'up':'down'}">${flat?'• no change':(d>0?'▲':'▼')+' '+fmt(Math.abs(cur-prev))+' · '+Math.abs(d*100).toFixed(1)+'%'}</span>`;
}

/* ---- variances against your own average ---- */
const monthStatCache=new WeakMap();
function monthStat(m){
  let c=monthStatCache.get(S.ix);if(!c){c={};monthStatCache.set(S.ix,c)}
  const k=m.slice(0,7);if(c[k])return c[k];
  const a=actual(S.data,m,endMonth(m),S.ix),byMain={},byKey={},byCat={},incMain={},byAcct={};
  const ex=a.exLines.filter(l=>!isOneoff(l.tx)),inc=a.incLines.filter(l=>!isOneoff(l.tx));
  for(const l of ex){const mn=l.main||'Uncategorised',kn=l.level2||l.label;byMain[mn]=(byMain[mn]||0)+l.value;byKey[mn+'|'+kn]=(byKey[mn+'|'+kn]||0)+l.value;const ck=catKey(l);byCat[ck]=(byCat[ck]||0)+l.value;const ai=l.catId||l.account;byAcct[ai]=(byAcct[ai]||0)+l.value}
  for(const l of inc){const mn=l.main||'Uncategorised';incMain[mn]=(incMain[mn]||0)-l.value}
  return c[k]={income:-sum(inc,l=>l.value),expense:sum(ex,l=>l.value),needs:sum(ex.filter(l=>lineClass(l)==='needs'),l=>l.value),wants:sum(ex.filter(l=>lineClass(l)==='wants'),l=>l.value),byMain,byKey,byCat,incMain,byAcct};
}
function baseline(s){
  const ix=S.ix,ms=[];
  for(let m=addMonths(monthStart(s),-1);ms.length<3&&m>=monthStart(ix.earliest);m=addMonths(m,-1))if(m>=ix.earliest&&endMonth(m)<=ix.latest)ms.push(m);
  if(!ms.length)return null;
  const st=ms.map(monthStat),n=st.length,avg=fn=>sum(st,fn)/n,map=k=>{const o={};for(const x of st)for(const[kk,v]of Object.entries(x[k]))o[kk]=(o[kk]||0)+v/n;return o};
  return{n,income:avg(x=>x.income),expense:avg(x=>x.expense),needs:avg(x=>x.needs),wants:avg(x=>x.wants),byMain:map('byMain'),byKey:map('byKey'),byCat:map('byCat'),incMain:map('incMain'),byAcct:map('byAcct')};
}
function pace(s,e){const cap=e>S.ix.latest?S.ix.latest:e,days=Math.max(1,daysBetween(s,cap));return S.per.mode==='month'?days/daysBetween(monthStart(s),endMonth(s)):days/30.4375}
function vd(diff,lowerIsGood,kind='avg'){
  if(diff===null||diff===undefined||!Number.isFinite(diff))return null;
  const flat=Math.abs(conv(diff))<.5,good=lowerIsGood?diff<0:diff>0;
  const word=kind==='avg'?(diff>0?' above avg':' below avg'):kind==='budget'?(diff>0?' over budget':' under budget'):kind==='plan'?(diff>0?' above plan':' below plan'):kind==='prev'?' vs prev':' vs last year';
  return{dir:flat?'flat':diff>0?'up':'down',tone:flat?'flat':good?'good':'bad',text:flat?(kind==='budget'?'On budget':kind==='plan'?'On plan':'On average'):fmt(Math.abs(diff))+word,title:(flat?'About the same as ':(diff>0?'Higher than ':'Lower than '))+(kind==='avg'?'your recent average':kind==='budget'?'your budget':'the comparison period')};
}
function chipHTML(d){return d?`<span class="vchip ${d.tone}" title="${d.title}">${d.dir==='flat'?'•':d.dir==='up'?'▲':'▼'} ${d.text}</span>`:''}
const vchip=(diff,low,kind)=>chipHTML(vd(diff,low,kind));
function ptsd(rate,bl){
  if(!bl||bl.income<=0||rate===null||!Number.isFinite(rate))return null;
  const pts=(rate-(bl.income-bl.expense)/bl.income)*100,flat=Math.abs(pts)<.05;
  return{dir:flat?'flat':pts>0?'up':'down',tone:flat?'flat':pts>0?'good':'bad',text:flat?'On average':Math.abs(pts).toFixed(1)+' pts '+(pts>0?'above':'below')+' avg',title:'Compared with your recent average savings rate'};
}
const ptsChip=(rate,bl)=>chipHTML(ptsd(rate,bl));
function vlegend(bl){
  return`<p class="vlegend">${bl?`Compared with your average of the last ${bl.n} full month${bl.n>1?'s':''}, scaled to the days counted.`:'There is not enough earlier history for an average yet.'} <strong>${S.look&&S.look.variance==='bo'?'Blue is better for you, orange is worse.':'Green is better for you, red is worse.'}</strong> Spending <span class="vchip bad">▲ above avg</span> <span class="vchip good">▼ below avg</span> Income and savings are the reverse.${oneoffCount()?` ${oneoffCount()} one-off item${oneoffCount()>1?'s are':' is'} left out of the average.`:''}</p>`;
}

/* ============================================================
   Period handling
   ============================================================ */
const MODES=[['month','Month'],['year','Year'],['ytd','Year to date'],['12m','Last 12 months'],['all','All time'],['custom','Custom']];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function range(){
  const p=S.per,L=S.ix.latest,E=S.ix.earliest;let s,e;
  switch(p.mode){
    case'month':s=`${p.y}-${String(p.m).padStart(2,'0')}-01`;e=endMonth(s);break;
    case'year':s=p.y+'-01-01';e=p.y+'-12-31';break;
    case'ytd':s=L.slice(0,4)+'-01-01';e=L;break;
    case'12m':s=addMonths(monthStart(L),-11);e=L;break;
    case'all':s=E;e=L;break;
    default:s=p.from;e=p.to;
  }
  return[s,e];
}
function prevRange(s,e){
  const p=S.per;let r=null;
  if(p.mode==='month'){const ps=addMonths(s,-1),pe=endMonth(ps);r=[ps,e>S.ix.latest?(()=>{const n=Math.max(1,daysBetween(s,S.ix.latest)),x=addDays(ps,n-1);return x<pe?x:pe})():pe]}
  else if(p.mode==='year'||p.mode==='ytd')r=[shiftYear(s,-1),shiftYear(e,-1)];
  else if(p.mode==='12m')r=[addMonths(s,-12),shiftYear(e,-1)];
  else if(p.mode==='custom'){const n=daysBetween(s,e),pe=addDays(s,-1);r=[addDays(pe,-(n-1)),pe]}
  return r&&r[1]>=S.ix.earliest?r:null;
}
const prevText=e=>S.per.mode==='month'&&e>S.ix.latest?'vs same days last month':'vs previous period';
function years(){const a=+S.ix.earliest.slice(0,4),b=+S.ix.latest.slice(0,4),o=[];for(let y=b;y>=a;y--)o.push(y);return o}

function controlsHTML(){
  const p=S.per;
  let h=`<label class="fld mode"><span>Period</span><select id="c-mode">${MODES.map(([v,t])=>`<option value="${v}" ${p.mode===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
  if(p.mode==='month')h+=`<div class="stepper"><button class="btn icon" data-step="-1" aria-label="Previous month">‹</button><label class="fld"><span>Month</span><select id="c-m">${MONTHS.map((n,i)=>`<option value="${i+1}" ${p.m===i+1?'selected':''}>${n}</option>`).join('')}</select></label><label class="fld"><span>Year</span><select id="c-y">${years().map(y=>`<option ${p.y===y?'selected':''}>${y}</option>`).join('')}</select></label><button class="btn icon" data-step="1" aria-label="Next month">›</button></div>`;
  if(p.mode==='year')h+=`<div class="stepper"><button class="btn icon" data-step="-1" aria-label="Previous year">‹</button><label class="fld"><span>Year</span><select id="c-y">${years().map(y=>`<option ${p.y===y?'selected':''}>${y}</option>`).join('')}</select></label><button class="btn icon" data-step="1" aria-label="Next year">›</button></div>`;
  if(p.mode==='custom')h+=`<label class="fld"><span>From</span><input id="c-from" type="date" value="${p.from}"></label><label class="fld"><span>To</span><input id="c-to" type="date" value="${p.to}"></label>`;
  const cs=currencies();
  h+=`<label class="fld cur"><span>Show in</span><select id="c-cur">${cs.map(c=>`<option ${S.cur===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`;
  const age=Math.max(0,Math.floor((Date.now()-D(S.ix.latest).getTime())/864e5)),fresh=S.meta&&S.meta.sample?'':(age<=3?pill('Up to date','good'):age<=14?pill(age+' days old',''):pill(age+' days old','warn'));
  h+=`<div class="note">Data through <strong>${fdate(S.ix.latest)}</strong> ${fresh}</div><button class="btn small pb-done" id="pb-done" type="button">Done</button>`;
  return h;
}
function bindControls(){
  const p=S.per,el=$('controls');
  $('c-mode').onchange=e=>{
    const m=e.target.value,[s,en]=range();p.mode=m;
    if(m==='custom'){p.from=s;p.to=en}
    if(m==='month'||m==='year'){const ref=en>S.ix.latest?S.ix.latest:en;p.y=+ref.slice(0,4);p.m=+ref.slice(5,7)}
    S.pg=0;render();
  };
  if($('c-m'))$('c-m').onchange=e=>{p.m=+e.target.value;S.pg=0;render()};
  if($('c-y'))$('c-y').onchange=e=>{p.y=+e.target.value;S.pg=0;render()};
  if($('c-from'))$('c-from').onchange=e=>{if(e.target.value&&e.target.value<=p.to){p.from=e.target.value;S.pg=0;render()}else{toast('Choose a start date on or before the end date.');render()}};
  if($('c-to'))$('c-to').onchange=e=>{if(e.target.value&&e.target.value>=p.from){p.to=e.target.value;S.pg=0;render()}else{toast('Choose an end date on or after the start date.');render()}};
  $('c-cur').onchange=e=>{S.cur=e.target.value;store.set();render()};
  el.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>stepPeriod(+b.dataset.step));
}
function periodLabel(){
  const[s,e]=range(),p=S.per;
  if(p.mode==='month')return fmonLong(s);
  if(p.mode==='year')return String(p.y);
  if(p.mode==='ytd')return'Year to date · '+fdate(s)+' – '+fdate(e);
  if(p.mode==='12m')return'Last 12 months · '+fdate(s)+' – '+fdate(e);
  return fdate(s)+' – '+fdate(e);
}

