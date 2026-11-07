'use strict';
/* ============================================================
   Planning model: category budget lines, commitments, goals,
   Base / Lean / Stretch scenarios, category forecast
   ============================================================ */
const TREATS=['P&L Expense','Debt Principal','Asset Purchase','Savings Transfer','Income'];
const FREQS=[['monthly','Monthly'],['quarterly','Every 3 months'],['semiannual','Every 6 months'],['annual','Every year'],['weekly','Weekly'],['once','One time']];
const FREQ_M={monthly:1,quarterly:3,semiannual:6,annual:12};
const FREQ_LABEL=Object.fromEntries(FREQS);
const STATUSES=['Active','Paused','Review'],PRIOS=['High','Medium','Low'];
const CLS_ORDER={inc:0,needs:1,wants:2,other:3},CLS_NAME={inc:'Income',needs:'Needs',wants:'Wants',other:'Other spending'};
const addMonthKeepDay=(d,n,day)=>{const a=D(d),t=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+n,1)),last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(day,last));return iso(t)};
function commitDates(c,from,to){
  const out=[];if(!c.start)return out;const end=c.end||'9999-12-31',day=+c.start.slice(8,10);let d=c.start,i=0,guard=0;
  while(d<=to&&d<=end&&guard++<1200){
    if(d>from)out.push(d);
    if(c.freq==='once')break;
    if(c.freq==='weekly')d=addDays(d,7);else{const n=FREQ_M[c.freq]||1;i+=n;d=addMonthKeepDay(c.start,i,day)}
  }
  return out;
}
const commitBase=(c,date)=>{const r=fxAt(S.data,c.cur,date);return r===null?0:c.amount*r};
const commitSrc=t=>t==='Income'?'income':t==='P&L Expense'?'spending':'transfer';
const commitSign=t=>t==='Income'?1:-1;
const adoptedKeys=()=>new Set((S.plan.commitments||[]).filter(c=>c.srcKey&&c.status!=='Review').map(c=>c.srcKey));
const completeMonthsList=n=>{const ix=S.ix,L=ix.latest,cm=[];for(let m=monthStart(L);cm.length<n&&endMonth(m)>=ix.earliest;m=addMonths(m,-1))if(endMonth(m)<=L)cm.push(m);return cm};
function expenseCategories(){
  const seen=new Map();
  for(const a of S.data.accounts)if(a.leaf&&a.group==='Expense'){const k=catKey(a);if(!seen.has(k))seen.set(k,{key:k,cls:S.plan.classMap[k]||defaultClass(a),name:NW.test(a.main)?(a.level2||a.label):(a.main||'Uncategorised')})}
  return[...seen.values()].sort((x,y)=>CLS_ORDER[x.cls]-CLS_ORDER[y.cls]||x.name.localeCompare(y.name));
}
function editVersionKey(){return S.plan.bfrom||(budgetFor(S.ix.latest.slice(0,7))?budgetFor(S.ix.latest.slice(0,7)).v.from:S.ix.latest.slice(0,7))}
function ensureEditVersion(){
  const mk=editVersionKey();let v=S.plan.budgets.find(x=>x.from===mk);
  if(!v){const prev=[...S.plan.budgets].filter(x=>x.from<mk).sort((a,b)=>b.from.localeCompare(a.from))[0];
    v={from:mk,cur:prev?prev.cur:S.cur,amounts:prev?{...prev.amounts}:{}};S.plan.budgets.push(v);S.plan.budgets.sort((a,b)=>a.from.localeCompare(b.from))}
  return v;
}

/* One planned line per category: your amount if you typed one, otherwise the recent average */
function planModel(fromKey){
  const ix=S.ix,d=S.data,L=ix.latest,pl=S.plan;
  const cm=completeMonthsList(3),n=cm.length,st=cm.map(monthStat),avg=f=>n?sum(st,f)/n:0;
  const verObj=fromKey?(()=>{const v=pl.budgets.find(x=>x.from===fromKey);if(!v)return null;const r=fxAt(d,v.cur,L);if(r===null)return null;const out={};for(const[k,a]of Object.entries(v.amounts))out[k]=a*r;return{v,out}})():budgetFor(L.slice(0,7));
  const man=k=>verObj&&verObj.out[k]!==undefined?verObj.out[k]:null;
  const cats=new Map(),ensure=(key,name,cls,main)=>{if(!cats.has(key))cats.set(key,{key,name,cls,main,accts:[],custom:false});return cats.get(key)};
  for(const a of d.accounts){
    if(!a.leaf)continue;
    if(a.group==='Expense'){const key=catKey(a);ensure(key,NW.test(a.main)?(a.level2||a.label):(a.main||'Uncategorised'),pl.classMap[key]||defaultClass(a),a.main).accts.push(a)}
    else if(a.group==='Income'){const key='Income › '+(a.main||'Income');ensure(key,a.main||'Income','inc',a.main||'Income').accts.push(a)}
  }
  for(const c of pl.customLines||[]){const x=ensure(c.key,c.name,c.cls,'');x.custom=true}
  const lines=[...cats.values()].map(c=>{
    const trailing=c.cls==='inc'?avg(x=>x.incMain[c.main]||0):avg(x=>x.byCat[c.key]||0);
    const acc=c.accts.map(a=>({id:a.id,code:a.code,name:a.label,path:pathOf(a).join(' › '),trailing:c.cls==='inc'?0:avg(x=>x.byAcct[a.id]||0),manual:man('@'+a.id)}));
    const manual=man(c.key),anyA=acc.some(a=>a.manual!==null);
    const planned=manual!==null?manual:anyA?sum(acc,a=>a.manual!==null?a.manual:a.trailing):trailing;
    return{...c,trailing,manual,planned,acc,basis:manual!==null?'yours':anyA?'accounts':'average'};
  }).sort((x,y)=>CLS_ORDER[x.cls]-CLS_ORDER[y.cls]||x.name.localeCompare(y.name));
  const y=L.slice(0,4),last=cm[0];let ytdM=0;const ytdA={};
  if(last&&last.slice(0,4)===y){
    ytdM=+last.slice(5,7);const a=actual(d,y+'-01-01',endMonth(last),ix);
    for(const l of a.exLines){const k=catKey(l);ytdA[k]=(ytdA[k]||0)+l.value;const id='@'+(l.catId||l.account);ytdA[id]=(ytdA[id]||0)+l.value}
    for(const l of a.incLines){const k='Income › '+(l.main||'Income');ytdA[k]=(ytdA[k]||0)-l.value}
  }
  const tot=cls=>sum(lines.filter(l=>l.cls===cls),l=>l.planned);
  return{lines,cm,n,ver:verObj&&verObj.v,ytdM,ytdA,tot:{inc:tot('inc'),needs:tot('needs'),wants:tot('wants'),other:tot('other')},window:n?fmon(cm.at(-1))+' to '+fmon(cm[0]):'no full month yet'};
}
const planExpenses=PM=>PM.tot.needs+PM.tot.wants+PM.tot.other;

/* ---- scenarios: Base, Lean, Stretch ---- */
const SCEN_DEF={base:{label:'Base',inc:0,needs:0,wants:0,savings:0,debt:0,assets:0},cautious:{label:'Lean',inc:-5,needs:-5,wants:-30,savings:-20,debt:0,assets:0},optimistic:{label:'Stretch',inc:5,needs:0,wants:-10,savings:20,debt:0,assets:0}};
function scenFactors(fc){
  const out={};
  for(const[k,d]of Object.entries(SCEN_DEF)){
    const x=(fc.scen||{})[k]||{},g=f=>{let v=x[f];if(v==null&&x.sp!=null&&(f==='needs'||f==='wants'))v=x.sp;return v!=null?+v:d[f]};
    const p={inc:g('inc'),needs:g('needs'),wants:g('wants'),savings:g('savings'),debt:g('debt'),assets:g('assets')};
    out[k]={label:d.label,...Object.fromEntries(Object.entries(p).map(([a,b])=>[a,1+b/100])),pct:p,
      note:k==='base'?'Your plan as it is':'Income '+(p.inc>=0?'+':'')+p.inc+'%, needs '+(p.needs>=0?'+':'')+p.needs+'%, wants '+(p.wants>=0?'+':'')+p.wants+'%, savings '+(p.savings>=0?'+':'')+p.savings+'%'};
  }
  return out;
}
const eventTreat=e=>e.treat||(e.amount>=0?'Income':'P&L Expense');
const eventOn=(e,sc)=>(e.status||'Active')==='Active'&&(!e.scenario||e.scenario==='all'||e.scenario===sc);

/* ---- upcoming payments: repeating found in history plus your commitments ---- */
function upcomingAll(days,detected,commits){
  const L=S.ix.latest,end=addDays(L,days),out=upcoming(detected,days).map(u=>({...u,mine:false}));
  for(const c of commits)for(const d of commitDates(c,L,end))out.push({desc:c.desc,date:d,amt:commitSign(c.treat)*commitBase(c,d),src:commitSrc(c.treat),every:c.freq,mine:true,cat:c.cat});
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}

/* ---- the forecast, category by category ---- */
function outlook(){
  const ix=S.ix,d=S.data,L=ix.latest,b=balances(d,L,ix),fc=S.plan.fc,fcur=fc.cur||S.cur;
  const PM=planModel(),SC=scenFactors(fc),scKey=SC[fc.scenario]?fc.scenario:'base',sc=SC[scKey],H=fc.horizon===24?24:12;
  const adopted=adoptedKeys(),detected=activeRecurring().filter(r=>!adopted.has(r.key));
  const commits=(S.plan.commitments||[]).filter(c=>c.status==='Active');
  const up30=upcomingAll(30,detected,commits);
  const cm=PM.cm;let inc=0,sp=0;for(const m of cm){const a=monthStat(m);inc+=a.income;sp+=a.expense}
  const avgInc=cm.length?inc/cm.length:0,avgSp=cm.length?sp/cm.length:0;
  const ovInc=fc.income!=null&&fc.income!==''?toBase(+fc.income,fcur,L):null,ovSp=fc.spend!=null&&fc.spend!==''?toBase(+fc.spend,fcur,L):null;
  const planInc=PM.tot.inc,planExp=planExpenses(PM);
  const kInc=ovInc!==null&&planInc>0?ovInc/planInc:1,kExp=ovSp!==null&&planExp>0?ovSp/planExp:1;
  const incBase=ovInc!==null&&planInc<=0?ovInc:planInc*kInc,spBase=ovSp!==null&&planExp<=0?ovSp:planExp*kExp;
  const manualLines=PM.lines.filter(l=>l.basis!=='average').length;
  const incSrc=ovInc!==null?'Your override':manualLines&&PM.lines.some(l=>l.cls==='inc'&&l.basis!=='average')?'Your plan, rest from the average':cm.length?'Average of the last '+cm.length+' full month'+(cm.length>1?'s':''):'No full month yet';
  const spSrc=ovSp!==null?'Your override':manualLines?'Your plan by category, rest from the average':cm.length?'Average of the last '+cm.length+' full month'+(cm.length>1?'s':''):'No full month yet';
  const goals=(S.plan.goals||[]).filter(g=>(g.status||'Active')==='Active'&&g.monthly>0),goalsMonthly=sum(goals,g=>toBase(g.monthly,g.cur,L)||0);
  const detTr=sum(detected.filter(r=>r.src==='transfer'),r=>r.every==='monthly'?r.amt:r.amt/3);
  const factorOf=cls=>cls==='inc'?sc.inc*kInc:(cls==='wants'?sc.wants:sc.needs)*kExp;
  const trOut=detTr,incScen=incBase*sc.inc,spScen=planExp>0?(PM.tot.needs*sc.needs+PM.tot.wants*sc.wants+PM.tot.other*sc.needs)*kExp:spBase*sc.needs;
  const reserve=fc.reserve?toBase(+fc.reserve,fcur,L)||0:0,avail=b.cash-b.cards;
  const mtd=actual(d,monthStart(L),L,ix),mtdCat={};
  for(const l of mtd.exLines){const k=catKey(l);mtdCat[k]=(mtdCat[k]||0)+l.value}
  for(const l of mtd.incLines){const k='Income › '+(l.main||'Income');mtdCat[k]=(mtdCat[k]||0)-l.value}
  const mEnd=endMonth(L),curMk=L.slice(0,7),cols=[];
  if(mEnd>L)cols.push({k:0,month:mEnd,label:'Rest of '+fmon(L),mk:curMk});
  for(let k=1;k<=H;k++){const m=addMonths(monthStart(L),k);cols.push({k,month:endMonth(m),label:fmon(m),mk:m.slice(0,7)})}
  const rows=new Map(),row=(key,label,grp,link)=>{if(!rows.has(key))rows.set(key,{key,label,grp,link,vals:cols.map(()=>0)});return rows.get(key)};
  const evs=(fc.events||[]).filter(e=>eventOn(e,scKey)),pmCache={},vers=[...S.plan.budgets].sort((a,b)=>b.from.localeCompare(a.from));
  const pmFor=mk=>{const v=vers.find(x=>x.from<=mk);return v?(pmCache[v.from]??=planModel(v.from)):PM};
  cols.forEach((c,ci)=>{
    const rest=c.k===0,ms=c.mk+'-01',me=endMonth(ms),P=pmFor(c.mk);
    for(const l of P.lines){
      let v=l.planned*factorOf(l.cls);if(rest)v=Math.max(0,v-(mtdCat[l.key]||0));
      if(ovInc!==null&&planInc<=0&&l.cls==='inc')v=0;
      if(Math.abs(v)>1e-9)row(l.key,l.name,l.cls,l.key).vals[ci]=(l.cls==='inc'?1:-1)*v;
    }
    if(ovInc!==null&&planInc<=0){const v=rest?Math.max(0,incBase*sc.inc-mtd.income):incBase*sc.inc;row('inc:override','Income (your figure)','inc').vals[ci]=v}
    if(ovSp!==null&&planExp<=0){const v=rest?Math.max(0,spBase*sc.needs-mtd.expense):spBase*sc.needs;row('exp:override','Spending (your figure)','needs').vals[ci]=-v}
    for(const cmt of commits){
      for(const dd of commitDates(cmt,rest?L:addDays(ms,-1),me)){
        let amt=commitBase(cmt,dd);const t=cmt.treat;
        if(t==='Debt Principal')amt*=sc.debt;else if(t==='Asset Purchase')amt*=sc.assets;else if(t==='Savings Transfer')amt*=sc.savings;else if(t==='Income')amt*=sc.inc;else amt*=(cmt.cls==='wants'?sc.wants:sc.needs);
        if(cmt.inBaseline&&(t==='P&L Expense'||t==='Income'))continue;
        const cat=cmt.cat&&PM.lines.find(l=>l.key===cmt.cat);
        if(t==='P&L Expense'){const r=cat?row(cmt.cat,cat.name,cat.cls,cmt.cat):row('c:'+cmt.id,cmt.desc,cmt.cls==='wants'?'wants':'needs');r.vals[ci]-=amt}
        else if(t==='Income')row('c:'+cmt.id,cmt.desc,'inc').vals[ci]+=amt;
        else row('c:'+cmt.id,cmt.desc,t==='Debt Principal'?'debt':t==='Asset Purchase'?'assets':'savings').vals[ci]-=amt;
      }
    }
    if(!rest){
      for(const g of goals)row('g:'+g.id,g.name,'savings').vals[ci]-=(toBase(g.monthly,g.cur,L)||0)*sc.savings;
      if(Math.abs(detTr)>1e-9)row('det:transfers','Regular transfers found in your history','savings').vals[ci]+=detTr;
    }else{
      const trs=sum(upcoming(detected.filter(r=>r.src==='transfer'),daysBetween(L,mEnd)-1),r=>r.amt);
      if(Math.abs(trs)>1e-9)row('det:transfers','Regular transfers found in your history','savings').vals[ci]+=trs;
    }
    for(const e of evs.filter(e=>e.month===c.mk)){
      const t=eventTreat(e),val=toBase(e.amount,e.cur,c.mk+'-15')||0;
      const g=t==='Income'?'inc':t==='P&L Expense'?(e.cls==='wants'?'wants':'needs'):t==='Debt Principal'?'debt':t==='Asset Purchase'?'assets':'savings';
      row('e:'+(e.name||'event'),e.name||'One-off item',g).vals[ci]+=val;
    }
  });
  const list=[...rows.values()];
  const ORD={inc:0,needs:1,wants:2,other:3,debt:4,assets:5,savings:6};
  list.sort((x,y)=>(ORD[x.grp]-ORD[y.grp])||x.label.localeCompare(y.label));
  const pl=r=>r.grp==='inc'||r.grp==='needs'||r.grp==='wants'||r.grp==='other';
  let cash=avail,nw=b.networth;const pts=[{month:L,cash,nw,label:'Now'}],net=[],netNw=[],closing=[];
  cols.forEach((c,ci)=>{
    const dn=sum(list,r=>r.vals[ci]),dp=sum(list.filter(pl),r=>r.vals[ci]);
    net.push(dn);netNw.push(dp);cash+=dn;nw+=dp;closing.push(cash);pts.push({month:c.month,cash,nw});
  });
  const lowest=pts.reduce((a,p)=>p.cash<a.cash?p:a,pts[0]);
  const out30=-sum(up30.filter(u=>u.amt<0),u=>u.amt),in30=sum(up30.filter(u=>u.amt>0),u=>u.amt);
  const safe=avail-reserve-out30+(fc.countIncome?in30:0);
  return{b,rec:detected,up30,avail,avgInc,avgSp,incBase,spBase,incScen,spScen,incSrc,spSrc,trOut,sc,SC,H,reserve,pts,lowest,out30,in30,safe,runway:avgSp>0?avail/avgSp:null,cm,fcur,PM,cols,rows:list,net,netNw,closing,goalsMonthly,commits,scKey};
}
const ROWGRP={inc:'Income',needs:'Needs',wants:'Wants',other:'Other spending',debt:'Debt principal',assets:'Asset purchases',savings:'Savings, goals and transfers'};

function forecastTable(o){
  const detail=S.fcDetail,cols=o.cols;
  const head=`<thead><tr><th class="fx-name">${detail?'Category':'Group'}</th>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead>`;
  const groups=Object.keys(ROWGRP).filter(g=>o.rows.some(r=>r.grp===g));
  const body=groups.map(g=>{
    const rs=o.rows.filter(r=>r.grp===g),tot=cols.map((_,i)=>sum(rs,r=>r.vals[i]));
    return`<tr class="fx-g"><th class="fx-name">${ROWGRP[g]}</th>${tot.map(v=>`<td class="${v<0?'neg':v>0?'pos':''}">${fmt(v)}</td>`).join('')}</tr>`+(detail?rs.map(r=>`<tr class="fx-r"><th class="fx-name">${esc(r.label)}</th>${r.vals.map(v=>`<td>${Math.abs(v)<1e-9?'':fmt(v)}</td>`).join('')}</tr>`).join(''):'');
  }).join('');
  const foot=`<tr class="fx-t"><th class="fx-name">Net change in cash</th>${o.net.map(v=>`<td class="${v<0?'neg':'pos'}">${fmt(v)}</td>`).join('')}</tr><tr class="fx-t"><th class="fx-name">Cash at the end</th>${o.closing.map(v=>`<td>${fmt(v)}</td>`).join('')}</tr>`;
  return`<div class="fx-wrap"><table class="fx">${head}<tbody>${body}${foot}</tbody></table></div>`;
}

function pOutlook(){
  const o=outlook(),fc=S.plan.fc;
  S.charts.fc={type:'line',id:'fc',tone:'light',points:o.pts.map(p=>({month:p.month,v:p.cash})),label:'Projected available cash',ref:o.reserve>0?o.reserve:undefined,h:window.innerWidth<600?190:230,rest:'Touch or hover the chart to read a month.'};
  const reserveTxt=o.reserve>0?' · reserve '+fmt(o.reserve):'';
  const lab=u=>u.mine?(FREQ_LABEL[u.every]||u.every):(u.every==='monthly'?'Monthly':'Quarterly');
  const upRows=o.up30.slice(0,14).map(u=>`<div class="row"><div><span class="t">${esc(u.desc||'(no description)')}</span><small>${esc(fdate(u.date))} · ${esc(lab(u))} · ${u.src==='income'?'Money in':u.src==='spending'?'Spending':'Transfer out of cash'}${u.mine?' · yours':''}</small></div><div class="amt ${u.amt>0?'pos':'neg'}">${u.amt>0?'+':''}${fmt(u.amt)}</div></div>`).join('');
  const cm=o.commits.filter(c=>!c.inBaseline);
  $('ptab').innerHTML=`
  <div class="kpis four">
    ${kpi('Available cash',fmt(o.avail),'Bank and cash minus card balances')}
    ${kpi('Next 30 days out',fmt(o.out30),o.in30>0?fmt(o.in30)+' expected in':'Repeating payments found')}
    ${kpi('Safe to spend',fmt(o.safe),'After those payments'+reserveTxt)}
    ${kpi('Cash runway',o.runway===null?'—':o.runway.toFixed(1)+' months','At your recent spending')}
  </div>
  <section class="card block"><div class="head"><div><h2>Cash forecast</h2><p class="sub">${esc(S.cur)} · next ${o.H} months from ${fdate(S.ix.latest)}. ${esc(o.sc.note)}.</p></div>
    <div class="seg" role="group" aria-label="Scenario">${Object.entries(o.SC).map(([k,v])=>`<button data-scen="${k}" aria-pressed="${fc.scenario===k}">${v.label}</button>`).join('')}</div></div>
    <div class="chart" data-chart="fc"></div><div class="readout muted" id="fc-read" style="min-height:20px;font-size:13px;margin-top:6px">Touch or hover the chart to read a month.</div>
    <div class="kpis" style="margin-top:14px"><div class="kpi card">${'<div class="label">Lowest cash</div><strong>'+fmt(o.lowest.cash)+'</strong><div class="detail">'+esc(o.lowest.label||fmonLong(o.lowest.month))+'</div>'}</div><div class="kpi card"><div class="label">Cash in ${o.H} months</div><strong>${fmt(o.pts.at(-1).cash)}</strong><div class="detail">${esc(fmonLong(o.pts.at(-1).month))}</div></div><div class="kpi card"><div class="label">Net worth in ${o.H} months</div><strong>${fmt(o.pts.at(-1).nw)}</strong><div class="detail">${fmt(o.pts.at(-1).nw-o.b.networth)} vs now, before market moves</div></div></div>
  </section>
  <section class="card block"><div class="head"><div><h2>Forecast by category</h2><p class="sub">${esc(S.cur)} · every line comes from your plan by category, your commitments, goals and one-off items. Negative is money out.</p></div>
    <div class="seg" role="group" aria-label="Detail"><button data-fxd="0" aria-pressed="${!S.fcDetail}">Groups</button><button data-fxd="1" aria-pressed="${!!S.fcDetail}">Every category</button></div></div>${forecastTable(o)}</section>
  <div class="grid two">
   <section class="card"><div class="head"><div><h2>Assumptions</h2><p class="sub">What the forecast is built from. Nothing is hidden.</p></div><button class="btn small" id="edit-fc">Edit</button></div>
    <div class="list">
     <div class="row"><div><span class="t">Income per month</span><small>${esc(o.incSrc)}</small></div><div class="amt">${fmt(o.incScen)}</div></div>
     <div class="row"><div><span class="t">Spending per month</span><small>${esc(o.spSrc)}</small></div><div class="amt">${fmt(o.spScen)}</div></div>
     <div class="row"><div><span class="t">Commitments not already in your averages</span><small>${cm.length} active · edit them under Repeating</small></div><div class="amt"></div></div>
     <div class="row"><div><span class="t">Goal funding per month</span><small>${(S.plan.goals||[]).filter(g=>(g.status||'Active')==='Active').length} active goal${(S.plan.goals||[]).filter(g=>(g.status||'Active')==='Active').length===1?'':'s'}</small></div><div class="amt">${fmt(-o.goalsMonthly*o.sc.savings)}</div></div>
     <div class="row"><div><span class="t">Regular transfers out of cash</span><small>Loan, savings or investment payments found in your history</small></div><div class="amt">${fmt(o.trOut)}</div></div>
     <div class="row"><div><span class="t">One-off items</span><small>${(fc.events||[]).filter(e=>eventOn(e,o.scKey)).length} in this scenario</small></div><div class="amt"></div></div>
    </div>
    <p class="footnote">Net worth assumes no market moves or exchange-rate changes. Loans, savings and investment transfers lower cash but not net worth. The rest of the current month uses what is still expected after this month’s actuals.</p></section>
   <section class="card"><div class="head"><div><h2>Coming up</h2><p class="sub">Next 30 days, from your commitments and repeating payments.</p></div></div>${upRows||'<div class="empty" style="padding:24px 0">Nothing found yet. Add commitments under Repeating, or they appear once a payment has happened about monthly at least three times.</div>'}
    <p class="footnote">Estimates, not scheduled reminders. ${o.rec.length} repeating item${o.rec.length===1?'':'s'} found in your history and ${o.commits.length} commitment${o.commits.length===1?'':'s'} of yours.</p></section>
  </div>`;
  document.querySelectorAll('[data-scen]').forEach(el=>el.onclick=()=>{S.plan.fc.scenario=el.dataset.scen;savePlan();render()});
  document.querySelectorAll('[data-fxd]').forEach(el=>el.onclick=()=>{S.fcDetail=el.dataset.fxd==='1';render()});
  $('edit-fc').onclick=editForecast;
}

function editForecast(){
  const fc=S.plan.fc,cs=currencies(),fcur=fc.cur||S.cur,SC=scenFactors(fc);
  const evRows=()=>fc.events.map((e,i)=>`<div class="row"><div><span class="t">${esc(e.name)}</span><small>${esc(fmonLong(e.month+'-01'))} · ${esc(eventTreat(e))} · ${e.scenario&&e.scenario!=='all'?esc(SC[e.scenario].label):'All scenarios'}${(e.status||'Active')!=='Active'?' · inactive':''}</small></div><div class="amt">${fmtIn(e.amount,e.cur,0)} ${esc(e.cur)} <button class="btn small" data-evdel="${i}">Remove</button></div></div>`).join('')||'<p class="sub">No one-off items yet.</p>';
  const fld=(k,c,l)=>`<label class="fld"><span>${l}</span><input id="sf-${k}-${c}" type="text" inputmode="decimal" autocomplete="off" data-num step="any" value="${SC[k].pct[c]}"></label>`;
  modal('Forecast assumptions',`
   <div class="form-grid">
    <label class="fld"><span>Currency for the amounts below</span><select id="f-cur">${cs.map(c=>`<option ${c===fcur?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="fld"><span>Minimum cash reserve</span><input id="f-reserve" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${fc.reserve||''}" placeholder="0"></label>
    <label class="fld"><span>Total income per month (blank = from your plan)</span><input id="f-inc" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${fc.income??''}"></label>
    <label class="fld"><span>Total spending per month (blank = from your plan)</span><input id="f-sp" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${fc.spend??''}"></label>
    <label class="fld"><span>Forecast length</span><select id="f-h"><option value="12" ${fc.horizon!==24?'selected':''}>12 months</option><option value="24" ${fc.horizon===24?'selected':''}>24 months</option></select></label>
   </div>
   <label style="display:flex;gap:8px;align-items:center;margin:14px 0"><input type="checkbox" id="f-count" ${fc.countIncome?'checked':''}> Count expected income in “safe to spend”</label>
   <h3>Scenarios: Base, Lean and Stretch</h3><p class="sub">How each scenario changes your plan, in percent. Use a minus for a cut. Base is always your plan as it is.</p>
   ${['cautious','optimistic'].map(k=>`<h3 style="margin-top:12px;font-size:14px">${SC[k].label}</h3><div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${fld(k,'inc','Income')}${fld(k,'needs','Needs')}${fld(k,'wants','Wants')}${fld(k,'savings','Savings and goals')}${fld(k,'debt','Debt principal')}${fld(k,'assets','Asset purchases')}</div>`).join('')}
   <h3 style="margin-top:18px">One-off items</h3><div id="ev-list" class="list">${evRows()}</div><button class="btn small" id="ev-add" style="margin-top:10px">Add a one-off item</button>`,
   [{label:'Cancel',run:()=>$('modal').close()},{label:'Save',primary:true,run:()=>{
     const num=id=>{const v=$(id).value.trim();return v===''?null:+v};
     const inc=num('f-inc'),sp=num('f-sp'),res=num('f-reserve');
     if([inc,sp,res].some(v=>v!==null&&(!Number.isFinite(v)||v<0))){toast('Use zero or positive amounts.');return}
     const scen={};let bad=false;
     for(const k of['cautious','optimistic']){scen[k]={};for(const c of['inc','needs','wants','savings','debt','assets']){const v=+$('sf-'+k+'-'+c).value;if(!Number.isFinite(v)||Math.abs(v)>90)bad=true;scen[k][c]=v}}
     if(bad){toast('Scenario changes must be numbers between -90 and 90.');return}
     Object.assign(fc,{cur:$('f-cur').value,income:inc,spend:sp,reserve:res||0,countIncome:$('f-count').checked,horizon:+$('f-h').value,scen});
     savePlan();$('modal').close();render();
   }}]);
  const keep=()=>{const num=id=>{const v=$(id).value.trim();return v===''?null:+v},ok=v=>v===null||(Number.isFinite(v)&&v>=0);const inc=num('f-inc'),sp=num('f-sp'),res=num('f-reserve');
    fc.cur=$('f-cur').value;fc.countIncome=$('f-count').checked;fc.horizon=+$('f-h').value;
    const scen={};let good=true;for(const k of['cautious','optimistic']){scen[k]={};for(const c of['inc','needs','wants','savings','debt','assets']){const v=+$('sf-'+k+'-'+c).value;if(!Number.isFinite(v))good=false;scen[k][c]=v}}if(good)fc.scen=scen;
    if(ok(inc))fc.income=inc;if(ok(sp))fc.spend=sp;if(ok(res))fc.reserve=res||0;savePlan()};
  $('ev-add').onclick=()=>{keep();addEvent(fc,$('f-cur').value)};
  document.querySelectorAll('[data-evdel]').forEach(b=>b.onclick=()=>{keep();fc.events.splice(+b.dataset.evdel,1);savePlan();editForecast()});
}
function addEvent(fc,cur){
  const L=S.ix.latest,cs=currencies(),SC=scenFactors(fc);
  modal('Add a one-off item',`<div class="form-grid">
    <label class="fld"><span>Name</span><input id="e-name" type="text" maxlength="60" placeholder="Bonus, car service, flights"></label>
    <label class="fld"><span>Month</span><select id="e-month">${monthOptions(L.slice(0,7),monthStart(L),addMonths(monthStart(L),24))}</select></label>
    <label class="fld"><span>Direction</span><select id="e-dir"><option value="-1">Money out</option><option value="1">Money in</option></select></label>
    <label class="fld"><span>Amount</span><input id="e-amt" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any"></label>
    <label class="fld"><span>Currency</span><select id="e-cur">${cs.map(c=>`<option ${c===cur?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="fld"><span>What it is</span><select id="e-treat">${TREATS.map(t=>`<option>${t}</option>`).join('')}</select></label>
    <label class="fld"><span>Applies to</span><select id="e-scen"><option value="all">All scenarios</option>${Object.entries(SC).map(([k,v])=>`<option value="${k}">${v.label} only</option>`).join('')}</select></label>
    <label class="fld"><span>Counts as</span><select id="e-cls"><option value="needs">A need</option><option value="wants">A want</option></select></label></div>
    <p class="footnote">Loan payments, asset purchases and savings move cash but are not spending. Only Income and P&amp;L Expense change your net worth.</p>`,
    [{label:'Back',run:()=>editForecast()},{label:'Add item',primary:true,run:()=>{
      const name=$('e-name').value.trim(),amt=+$('e-amt').value,treat=$('e-treat').value,dir=+$('e-dir').value;
      if(!name||!Number.isFinite(amt)||amt<=0){toast('Enter a name and an amount above zero.');return}
      const signed=treat==='Income'?amt:dir*amt;
      fc.events.push({name,month:$('e-month').value,amount:signed,cur:$('e-cur').value,treat,scenario:$('e-scen').value,status:'Active',cls:$('e-cls').value});
      savePlan();editForecast();
    }}]);
}

/* ---- budget: one line per category ---- */
/* The page-wide render() keeps your place (cursor, open lists); see js/10-shell.js. */
const rerenderKeepingPlace=()=>render();
function pBudget(){
  const ix=S.ix,mkNow=ix.latest.slice(0,7),editKey=editVersionKey(),verExists=S.plan.budgets.find(v=>v.from===editKey),PM=planModel(verExists?editKey:null);
  const vcur=(verExists&&verExists.cur)||(S.plan.budgets.length?S.plan.budgets.at(-1).cur:S.cur),to=v=>{const x=fromBase(v,vcur);return x===null?0:x};
  const versions=[...S.plan.budgets].sort((a,b)=>b.from.localeCompare(a.from));
  const ytdM=PM.ytdM,inForce=budgetFor(mkNow);
  const stat=(l,plan,act)=>{
    if(!ytdM)return{t:'—',k:''};
    if(l.cls==='inc')return act+.5>=plan*ytdM?{t:'On plan',k:'good'}:{t:'Below plan',k:'bad'};
    if(plan<=0&&act>.5)return{t:'No plan',k:'warn'};
    if(plan<=0)return{t:'—',k:''};
    return act<=plan*ytdM+.5?{t:'On plan',k:'good'}:{t:'Over plan',k:'bad'};
  };
  const row=l=>{
    const act=PM.ytdA[l.key]||0,plan=l.planned,yp=plan*ytdM,vr=l.cls==='inc'?act-yp:yp-act,s=stat(l,plan,act);
    const acc=l.acc.length>1||(l.acc.length===1&&l.acc[0].name!==l.name)?`<details class="pt-acc" data-acc="${esc(l.key)}"><summary>${l.acc.length} account${l.acc.length===1?'':'s'}</summary>${l.acc.map(a=>{const aa=PM.ytdA['@'+a.id]||0;return`<div class="pt-arow"><div class="pt-name">${a.code?`<span class="code">${esc(a.code)}</span>`:''}${esc(a.name)}</div><div data-l="Average/mo">${fmtIn(to(a.trailing),vcur,0)}</div><div data-l="Your amount"><input class="num-in" type="text" inputmode="decimal" autocomplete="off" data-bm="@${esc(a.id)}" value="${a.manual!==null?Math.round(to(a.manual)*100)/100:''}" placeholder="${Math.round(to(a.trailing))}" aria-label="Monthly amount for ${esc(a.name)}"></div><div data-l="YTD actual">${fmtIn(to(aa),vcur,0)}</div></div>`}).join('')}<p class="footnote">Account amounts are used when the category has no amount of its own.</p></details>`:'';
    return`<div class="pt-row"><div class="pt-name"><strong>${esc(l.name)}</strong>${l.custom?` <button class="btn small" data-rmline="${esc(l.key)}" aria-label="Remove ${esc(l.name)}">Remove</button>`:''}${acc}</div>
     <div data-l="Average/mo">${fmtIn(to(l.trailing),vcur,0)}</div>
     <div data-l="Your amount"><input class="num-in" type="text" inputmode="decimal" autocomplete="off" data-bm="${esc(l.key)}" value="${l.manual!==null?Math.round(to(l.manual)*100)/100:''}" placeholder="${Math.round(to(l.trailing))}" aria-label="Monthly amount for ${esc(l.name)}"></div>
     <div data-l="Plan/mo"><strong>${fmtIn(to(plan),vcur,0)}</strong>${l.basis==='average'?'':`<small class="muted"> ${l.basis}</small>`}</div>
     <div data-l="Plan/year">${fmtIn(to(plan)*12,vcur,0)}</div>
     <div data-l="YTD actual">${ytdM?fmtIn(to(act),vcur,0):'—'}</div>
     <div data-l="YTD plan">${ytdM?fmtIn(to(yp),vcur,0):'—'}</div>
     <div data-l="Variance">${ytdM&&(plan>0||Math.abs(act)>.5)?chipHTML(vd(act-yp,l.cls!=='inc','plan')):''}</div>
     <div data-l="Status">${s.t==='—'?'':pill(s.t,s.k)}</div></div>`;
  };
  const sect=cls=>{
    const ls=PM.lines.filter(l=>l.cls===cls);if(!ls.length)return'';
    const p=sum(ls,l=>l.planned),a=sum(ls,l=>PM.ytdA[l.key]||0);
    return`<div class="pt-sec"><span>${CLS_NAME[cls]}</span><span>${fmtIn(to(p),vcur,0)} a month · ${fmtIn(to(p)*12,vcur,0)} a year${ytdM?' · YTD '+fmtIn(to(a),vcur,0)+' of '+fmtIn(to(p*ytdM),vcur,0):''}</span></div>${ls.map(row).join('')}`;
  };
  const inc=PM.tot.inc,exp=planExpenses(PM);
  $('ptab').innerHTML=`
  <div class="kpis four">${kpi('Planned income',fmtIn(to(inc),vcur,0),'A month · '+fmtIn(to(inc)*12,vcur,0)+' a year')}${kpi('Planned spending',fmtIn(to(exp),vcur,0),'A month · '+fmtIn(to(exp)*12,vcur,0)+' a year')}${kpi('Planned surplus',fmtIn(to(inc-exp),vcur,0),'A month, before goals and loans')}${kpi('Average taken from',PM.window,'The last '+PM.n+' full month'+(PM.n===1?'':'s')+', one-offs left out')}</div>
  <section class="card block"><div class="head"><div><h2>Budget plan by category</h2><p class="sub">Every category from your chart of accounts is here, even ones you have not spent on yet. Type a monthly amount to set your own, or leave it blank to use the average. An amount of 0 means you plan to spend nothing. Amounts are in ${esc(vcur)}.</p></div></div>
   <div class="toolbar" style="align-items:flex-end">
    <label class="fld"><span>Editing the plan that starts</span><select id="bv-sel">${versions.map(v=>`<option value="${esc(v.from)}" ${v.from===editKey?'selected':''}>${esc(fmonLong(v.from+'-01'))}${inForce&&inForce.v.from===v.from?' (in force now)':''}</option>`).join('')}${verExists?'':`<option value="${esc(editKey)}" selected>${esc(fmonLong(editKey+'-01'))} (new)</option>`}</select></label>
    <button class="btn small" id="bv-new">New version…</button><button class="btn small" id="bp-fill">Fill blanks from average</button><button class="btn small" id="bp-scale">Change all by %…</button><button class="btn small" id="bp-clear">Clear my amounts</button><button class="btn small" id="bp-line">Add a planning line</button><button class="btn small" id="edit-budget">Bulk edit…</button></div>
   <div class="pt-head"><div>Category</div><div>Average/mo</div><div>Your amount</div><div>Plan/mo</div><div>Plan/year</div><div>YTD actual</div><div>YTD plan</div><div>Variance</div><div>Status</div></div>
   ${['inc','needs','wants','other'].map(sect).join('')}
   <p class="footnote">YTD compares the complete months of this year with your plan. A plan version applies from its month onward, so changing October never rewrites January.</p></section>
  <div id="bp-period"></div>`;
  document.querySelectorAll('[data-bm]').forEach(inp=>inp.onchange=()=>{
    const v=ensureEditVersion(),key=inp.dataset.bm,val=inp.value.trim();
    if(val==='')delete v.amounts[key];else{const n=parseAmount(val);if(n===null||n<0){toast('Use zero or a positive amount.');rerenderKeepingPlace();return}v.amounts[key]=n}
    if(key.startsWith('@')&&val!==''){
      // An account amount only counts when its category has no amount of its own, so hand the category over to its accounts.
      const l=PM.lines.find(l=>l.acc.some(a=>'@'+a.id===key));
      if(l&&v.amounts[l.key]!==undefined){delete v.amounts[l.key];toast(l.name+' now adds up its accounts instead of your category amount.')}
    }
    savePlan();rerenderKeepingPlace();
  });
  document.querySelectorAll('[data-bm]').forEach(inp=>inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();inp.blur()}});
  $('edit-budget').onclick=editBudget;
  $('bv-sel').onchange=e=>{S.plan.bfrom=e.target.value;render()};
  $('bv-new').onclick=()=>modal('New plan version',`<label class="fld"><span>Starts in</span><select id="nv-from">${monthOptions(mkNow,monthStart(ix.earliest),addMonths(monthStart(ix.latest),12))}</select></label><p class="footnote">It starts as a copy of the version before it. Earlier months keep the amounts they had.</p>`,[{label:'Cancel',run:()=>$('modal').close()},{label:'Create',primary:true,run:()=>{S.plan.bfrom=$('nv-from').value;ensureEditVersion();savePlan();$('modal').close();render()}}]);
  $('bp-fill').onclick=()=>{const v=ensureEditVersion();let n=0;for(const l of PM.lines)if(!l.custom&&l.manual===null&&l.basis!=='accounts'&&l.trailing>0){const x=fromBase(l.trailing,v.cur);if(x!==null){v.amounts[l.key]=Math.round(x);n++}}savePlan();render();toast(n?'Filled '+n+' line'+(n===1?'':'s')+' from the average.':'Nothing to fill.')};
  $('bp-scale').onclick=()=>modal('Change all your amounts',`<label class="fld"><span>Change by (percent, minus for a cut)</span><input id="sc-p" type="text" inputmode="decimal" autocomplete="off" data-num step="any" value="5"></label><p class="footnote">Only amounts you typed change. Lines using the average are left alone.</p>`,[{label:'Cancel',run:()=>$('modal').close()},{label:'Apply',primary:true,run:()=>{const p=+$('sc-p').value;if(!Number.isFinite(p)||p<-90||p>500){toast('Enter a number from -90 to 500.');return}const v=ensureEditVersion();for(const k in v.amounts)v.amounts[k]=Math.round(v.amounts[k]*(1+p/100)*100)/100;savePlan();$('modal').close();render()}}]);
  $('bp-clear').onclick=()=>modal('Clear your amounts?','<p>Every amount you typed in this version is removed, so the plan goes back to the averages. Your own planning lines keep their amounts.</p>',[{label:'Cancel',run:()=>$('modal').close()},{label:'Clear',primary:true,run:()=>{const v=ensureEditVersion();for(const k of Object.keys(v.amounts))if(!k.startsWith('+'))delete v.amounts[k];savePlan();$('modal').close();render()}}]);
  $('bp-line').onclick=()=>modal('Add a planning line',`<div class="form-grid"><label class="fld"><span>Name</span><input id="pl-name" type="text" maxlength="50" placeholder="Car service, school fees"></label><label class="fld"><span>Counts as</span><select id="pl-cls"><option value="needs">A need</option><option value="wants">A want</option><option value="other">Other spending</option></select></label><label class="fld"><span>Monthly amount (${esc(vcur)})</span><input id="pl-amt" type="text" inputmode="decimal" autocomplete="off"></label></div><p class="footnote">For something you plan to spend on that has no category in Moneydance yet.</p>`,[{label:'Cancel',run:()=>$('modal').close()},{label:'Add',primary:true,run:()=>{const name=$('pl-name').value.trim(),amt=parseAmount($('pl-amt').value);if(!name||amt===null||amt<0){toast('Enter a name and an amount.');return}const key='+'+name;if((S.plan.customLines||[]).some(c=>c.key===key)){toast('That line already exists.');return}(S.plan.customLines??=[]).push({key,name,cls:$('pl-cls').value});ensureEditVersion().amounts[key]=amt;savePlan();$('modal').close();render()}}]);
  document.querySelectorAll('[data-rmline]').forEach(b=>b.onclick=()=>{const k=b.dataset.rmline;S.plan.customLines=(S.plan.customLines||[]).filter(c=>c.key!==k);for(const v of S.plan.budgets)delete v.amounts[k];savePlan();render()});
  pBudgetPeriod();
}

/* ---- goals ---- */
const GOAL_TYPES=['Savings','Emergency fund','Investment','Housing','Purchase','Debt payoff','Other'];
function pGoals(){
  const gs=S.plan.goals,o=outlook(),L=S.ix.latest;
  const planned=sum(gs.filter(g=>(g.status||'Active')==='Active'),g=>toBase(g.monthly||0,g.cur,L)||0),required=sum(gs.filter(g=>(g.status||'Active')==='Active'),g=>{const s=goalState(g);return Number.isFinite(s.required)?(toBase(s.required,g.cur,L)||0):0});
  const perM=c=>c.freq==='once'?0:commitBase(c,L)*(c.freq==='weekly'?52/12:1/(FREQ_M[c.freq]||1));
  const inc=o.PM.tot.inc+sum(o.commits.filter(c=>c.treat==='Income'&&!c.inBaseline),perM),exp=planExpenses(o.PM),extraPL=sum(o.commits.filter(c=>c.treat==='P&L Expense'&&!c.inBaseline),perM),otherOut=sum(o.commits.filter(c=>c.treat==='Debt Principal'||c.treat==='Asset Purchase'||c.treat==='Savings Transfer'),perM),room=inc-exp-extraPL-otherOut+o.trOut-planned;
  const order=[...gs].sort((a,b)=>PRIOS.indexOf(a.priority||'Medium')-PRIOS.indexOf(b.priority||'Medium'));
  $('ptab').innerHTML=`
  <div class="kpis four">${kpi('Goal funding planned',fmt(planned),'A month, active goals')}${kpi('Needed to arrive on time',fmt(required),'A month')}${kpi('Room after your plan',fmt(room),room>=0?'Left each month after budget, commitments and goals':'Short each month')}${kpi('Active goals',String(gs.filter(g=>(g.status||'Active')==='Active').length),gs.length+' in total')}</div>
  <section class="card block"><div class="head"><div><h2>Goals</h2><p class="sub">Goals are savings or purchases, not spending. They lower cash but not net worth. Only Active goals feed the forecast.</p></div><div class="actions"><button class="btn small" id="add-emerg">Emergency fund…</button><button class="btn small" id="add-goal">Add a goal</button></div></div>
   ${gs.length?`<div class="goals">${order.map(g=>{const st=goalState(g),pc=g.target>0?Math.min(100,st.have/g.target*100):0,active=(g.status||'Active')==='Active';return`<article class="goal" style="${active?'':'opacity:.65'}"><div class="head" style="margin-bottom:8px"><h3>${esc(g.name)}</h3>${pill(st.status,st.k)}</div><p class="sub" style="margin:0 0 6px">${esc(g.type||'Savings')} · ${esc(g.priority||'Medium')} priority · ${esc(g.status||'Active')}</p><div class="goal-amt">${fmtIn(st.have,g.cur,0)} <small class="muted">of ${fmtIn(g.target,g.cur,0)} ${esc(g.cur)}</small></div><div class="track" style="margin:10px 0"><b style="width:${pc}%;background:var(--violet)"></b></div>
     <p class="sub">${pc.toFixed(0)}% funded · ${g.date?'target '+esc(fdate(g.date)):'no target date'}</p>
     <p class="sub">${st.remaining<=0?'Goal reached.':(st.left===null?'':(st.left>0?`Needs ${fmtIn(st.required,g.cur,0)} a month.`:'Needs funding now.'))+` You plan ${fmtIn(st.planned,g.cur,0)}.`}${st.shortfall>0&&Number.isFinite(st.shortfall)?` Gap ${fmtIn(st.shortfall,g.cur,0)} a month.`:''}${st.finish&&st.status==='Behind'?` At your pace you finish in ${esc(fmonLong(st.finish))}.`:''}</p>
     <button class="btn small" data-goal="${esc(g.id)}">Edit</button></article>`}).join('')}</div>`:'<div class="empty">No goals yet. Add one, or start with an emergency fund of six months of spending.</div>'}</section>`;
  $('add-goal').onclick=()=>editGoal();
  $('add-emerg').onclick=()=>{
    const cur=S.cur,m6=fromBase(exp,cur)||0;
    modal('Emergency fund',`<p class="sub">A cushion of some months of planned spending (${esc(cur)} ${fmt(exp)} a month at the moment).</p><div class="form-grid"><label class="fld"><span>Months of spending</span><input id="ef-m" type="text" inputmode="decimal" autocomplete="off" data-num min="1" max="24" step="1" value="6"></label><label class="fld"><span>Reach it by</span><input id="ef-d" type="date" value="${addMonths(monthStart(L),12)}"></label></div>`,[{label:'Cancel',run:()=>$('modal').close()},{label:'Add goal',primary:true,run:()=>{const n=+$('ef-m').value,d=$('ef-d').value;if(!(n>=1)||!d){toast('Choose months and a date.');return}const tgt=Math.round(m6*n);const t=Math.max(1,monthsBetween(L,d));gs.push({id:'g'+Date.now(),name:'Emergency fund',type:'Emergency fund',priority:'High',status:'Active',target:tgt,cur,current:0,link:'',monthly:Math.round(tgt/t),date:d});savePlan();$('modal').close();render()}}]);
  };
  document.querySelectorAll('[data-goal]').forEach(el=>el.onclick=()=>editGoal(S.plan.goals.find(g=>g.id===el.dataset.goal)));
}
function editGoal(g){
  const cs=currencies(),b=balances(S.data,S.ix.latest,S.ix),accts=b.rows.filter(a=>a.group==='Asset'&&(a.leaf||Math.abs(a.native)>0)).sort((x,y)=>x.label.localeCompare(y.label));
  const v=g||{id:'',name:'',type:'Savings',priority:'Medium',status:'Active',target:0,cur:S.cur,current:0,link:'',monthly:0,date:addMonths(monthStart(S.ix.latest),12)};
  const opt=(list,cur)=>list.map(x=>`<option ${x===cur?'selected':''}>${esc(x)}</option>`).join('');
  modal(g?'Edit goal':'Add a goal',`<div class="form-grid">
   <label class="fld"><span>Name</span><input id="g-name" type="text" maxlength="60" value="${esc(v.name)}"></label>
   <label class="fld"><span>Type</span><select id="g-type">${opt(GOAL_TYPES,v.type||'Savings')}</select></label>
   <label class="fld"><span>Status</span><select id="g-status">${opt(STATUSES,v.status||'Active')}</select></label>
   <label class="fld"><span>Priority</span><select id="g-prio">${opt(PRIOS,v.priority||'Medium')}</select></label>
   <label class="fld"><span>Currency</span><select id="g-cur">${cs.map(c=>`<option ${c===v.cur?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
   <label class="fld"><span>Target amount</span><input id="g-target" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${v.target||''}"></label>
   <label class="fld"><span>Target date (optional)</span><input id="g-date" type="date" value="${v.date||''}"></label>
   <label class="fld"><span>Saved so far (or link an account)</span><input id="g-cur-amt" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${v.current||''}"></label>
   <label class="fld"><span>Link to an account</span><select id="g-link"><option value="">None, use the amount</option>${accts.map(a=>`<option value="${esc(a.id)}" ${v.link===a.id?'selected':''}>${esc(a.label)}</option>`).join('')}</select></label>
   <label class="fld"><span>You plan to save each month</span><input id="g-monthly" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${v.monthly||''}"></label></div>`,
   [...(g?[{label:'Delete',run:()=>{S.plan.goals=S.plan.goals.filter(x=>x.id!==g.id);savePlan();$('modal').close();render()}}]:[]),{label:'Cancel',run:()=>$('modal').close()},{label:'Save goal',primary:true,run:()=>{
     const n=$('g-name').value.trim(),t=+$('g-target').value,mo=+($('g-monthly').value||0),cu=+($('g-cur-amt').value||0),d=$('g-date').value;
     if(!n||!(t>0)||mo<0||cu<0||![t,mo,cu].every(Number.isFinite)){toast('Add a name and a target above zero.');return}
     const item={id:g?.id||'g'+Date.now(),name:n,type:$('g-type').value,status:$('g-status').value,priority:$('g-prio').value,target:t,cur:$('g-cur').value,current:cu,link:$('g-link').value,monthly:mo,date:d||''};
     if(g)Object.assign(g,item);else S.plan.goals.push(item);
     savePlan();$('modal').close();S.ptab='goals';render();
   }}]);
}

/* ---- repeating payments and commitments ---- */
function commitNext(c){return commitDates(c,S.ix.latest,addDays(S.ix.latest,800))[0]||null}
function editCommitment(c,prefill){
  const cs=currencies(),cats=expenseCategories(),v=c||{id:'',desc:'',status:'Active',priority:'Medium',treat:'P&L Expense',cat:'',cls:'needs',cur:S.cur,amount:0,freq:'monthly',start:addDays(S.ix.latest,1),end:'',inBaseline:false,notes:'',...(prefill||{})};
  const opt=(list,cur)=>list.map(x=>`<option ${x===cur?'selected':''}>${esc(x)}</option>`).join('');
  modal(c?'Edit commitment':'Add a commitment',`<div class="form-grid">
   <label class="fld" style="grid-column:1/-1"><span>Description</span><input id="cm-desc" type="text" maxlength="80" value="${esc(v.desc)}" placeholder="Rent, insurance premium, school fees"></label>
   <label class="fld"><span>What it is</span><select id="cm-treat">${opt(TREATS,v.treat)}</select></label>
   <label class="fld" id="cm-catwrap"><span>Category</span><select id="cm-cat"><option value="">No category</option>${cats.map(k=>`<option value="${esc(k.key)}" ${k.key===v.cat?'selected':''}>${esc(CLS_NAME[k.cls]+' › '+k.name)}</option>`).join('')}</select></label>
   <label class="fld"><span>Status</span><select id="cm-status">${opt(STATUSES,v.status)}</select></label>
   <label class="fld"><span>Priority</span><select id="cm-prio">${opt(PRIOS,v.priority||'Medium')}</select></label>
   <label class="fld"><span>Currency</span><select id="cm-cur">${cs.map(x=>`<option ${x===v.cur?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
   <label class="fld"><span>Amount each time</span><input id="cm-amt" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${v.amount||''}"></label>
   <label class="fld"><span>How often</span><select id="cm-freq">${FREQS.map(([k,t])=>`<option value="${k}" ${k===v.freq?'selected':''}>${t}</option>`).join('')}</select></label>
   <label class="fld"><span>First or next date</span><input id="cm-start" type="date" value="${v.start||''}"></label>
   <label class="fld"><span>Ends (optional)</span><input id="cm-end" type="date" value="${v.end||''}"></label>
   <label class="fld"><span>Counts as</span><select id="cm-cls"><option value="needs" ${v.cls!=='wants'?'selected':''}>A need</option><option value="wants" ${v.cls==='wants'?'selected':''}>A want</option></select></label></div>
   <label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" id="cm-base" ${v.inBaseline?'checked':''}> Already inside my monthly averages (do not add it again to the forecast)</label>
   <label class="fld"><span>Notes</span><input id="cm-notes" type="text" maxlength="120" value="${esc(v.notes||'')}"></label>`,
   [...(c?[{label:'Delete',run:()=>{S.plan.commitments=S.plan.commitments.filter(x=>x.id!==c.id);savePlan();$('modal').close();render()}}]:[]),{label:'Cancel',run:()=>$('modal').close()},{label:'Save',primary:true,run:()=>{
     const desc=$('cm-desc').value.trim(),amt=+$('cm-amt').value,start=$('cm-start').value,end=$('cm-end').value;
     if(!desc||!(amt>0)||!start){toast('Add a description, an amount above zero and a date.');return}
     if(end&&end<start){toast('The end date is before the start.');return}
     const treat=$('cm-treat').value,cat=treat==='P&L Expense'?$('cm-cat').value:'',ck=expenseCategories().find(k=>k.key===cat);
     const item={id:c?.id||'c'+Date.now(),desc,status:$('cm-status').value,priority:$('cm-prio').value,treat,cat,cls:ck?ck.cls:$('cm-cls').value,cur:$('cm-cur').value,amount:amt,freq:$('cm-freq').value,start,end,inBaseline:$('cm-base').checked,notes:$('cm-notes').value.trim(),srcKey:c?.srcKey||v.srcKey||''};
     const list=(S.plan.commitments??=[]);if(c)Object.assign(c,item);else list.push(item);
     savePlan();$('modal').close();S.ptab='repeat';render();
   }}]);
  const sync=()=>{$('cm-catwrap').style.display=$('cm-treat').value==='P&L Expense'?'':'none'};$('cm-treat').onchange=sync;sync();
}
function pRepeat(){
  const all=detectRecurring(),act=all.filter(r=>!r.ignored),mo=r=>r.every==='monthly'?r.amt:r.amt/3,L=S.ix.latest;
  const cms=(S.plan.commitments||[]),ad=adoptedKeys();
  const per=c=>c.freq==='once'?0:commitBase(c,L)*(c.freq==='weekly'?52/12:1/(FREQ_M[c.freq]||1));
  const activeC=cms.filter(c=>c.status==='Active');
  const sumT=t=>sum(activeC.filter(c=>c.treat===t),per);
  const spend=-sum(act.filter(r=>r.src==='spending'&&!ad.has(r.key)),mo)+sumT('P&L Expense'),inc=sum(act.filter(r=>r.src==='income'&&!ad.has(r.key)),mo)+sumT('Income');
  const tr=-sum(act.filter(r=>r.src==='transfer'&&!ad.has(r.key)),mo)+sumT('Debt Principal')+sumT('Asset Purchase')+sumT('Savings Transfer');
  const nextOf=r=>{let d=addDays(r.last,r.interval);if(d<=L){if(daysBetween(d,L)-1>10){while(d<=L)d=addDays(d,r.interval)}else d=addDays(L,1)}return d};
  const sect=(title,src)=>{
    const rs=all.filter(r=>r.src===src).sort((a,b)=>Math.abs(b.amt)-Math.abs(a.amt));if(!rs.length)return'';
    return`<div class="section-h"><span>${title}</span><span>${rs.filter(r=>!r.ignored).length} active</span></div>`+rs.map(r=>{
      const chip=r.changed?chipHTML(vd(Math.abs(r.lastAmt)-Math.abs(r.prevMed),src!=='income','prev')):'',taken=ad.has(r.key);
      return`<div class="row" style="${r.ignored?'opacity:.55':''}"><div><span class="t">${esc(r.desc||'(no description)')}</span><small>${r.every==='monthly'?'Monthly':'Quarterly'} · seen ${r.n} times · last ${esc(fdate(r.last))}${r.ignored?'':' · next about '+esc(fdate(nextOf(r)))}${taken?' · you added it as a commitment':''}</small>${chip?`<small style="margin-top:4px">${chip} the last payment changed: paid ${fmt(Math.abs(r.lastAmt))}, before ${fmt(Math.abs(r.prevMed))}</small>`:''}</div><div class="amt ${r.amt>0?'pos':'neg'}">${r.amt>0?'+':''}${fmt(r.amt)}<small>${taken?'':`<button class="btn small" data-adopt="${esc(r.key)}">Add as commitment</button> `}<button class="btn small" data-rignore="${esc(r.key)}">${r.ignored?'Include again':'Ignore'}</button></small></div></div>`;
    }).join('');
  };
  const changes=act.filter(r=>r.changed).length;
  const cRow=c=>{const nx=commitNext(c);return`<div class="row" style="${c.status==='Active'?'':'opacity:.6'}"><div><span class="t">${esc(c.desc)}</span><small>${esc(c.treat)}${c.cat?' · '+esc(c.cat):''} · ${esc(FREQ_LABEL[c.freq])} · ${nx?'next '+esc(fdate(nx)):'no date ahead'} · ${esc(c.priority||'Medium')} priority${c.inBaseline?' · already in averages':''}</small></div><div class="amt ${c.treat==='Income'?'pos':'neg'}">${c.treat==='Income'?'+':'−'}${fmtIn(c.amount,c.cur,0)} ${esc(c.cur)}<small>${pill(c.status,c.status==='Active'?'good':c.status==='Review'?'warn':'')} <button class="btn small" data-editc="${esc(c.id)}">Edit</button></small></div></div>`};
  const order=[...cms].sort((a,b)=>(a.status==='Active'?0:1)-(b.status==='Active'?0:1)||(commitNext(a)||'9').localeCompare(commitNext(b)||'9'));
  $('ptab').innerHTML=`<div class="kpis four">${kpi('Repeating spending',fmt(spend),'A month, on average')}${kpi('Repeating income',fmt(inc),'A month, on average')}${kpi('Regular transfers out',fmt(tr),'Loans, savings, investing')}${kpi('Price changes',String(changes),changes?'Check the flagged items':'None found')}</div>
   <section class="card block"><div class="head"><div><h2>Your commitments</h2><p class="sub">Things you know will happen: rent, insurance, school fees, loan payments, a salary raise. Give each a category, an amount and how often. Only Active ones feed the forecast, and “already in my averages” stops them being counted twice.</p></div><button class="btn small" id="add-commit">Add a commitment</button></div>
   ${cms.length?order.map(cRow).join(''):'<div class="empty" style="padding:24px 0">No commitments yet. Add one, or turn a repeating payment found below into a commitment.</div>'}</section>
   <section class="card block"><div class="head"><div><h2>Found in your history</h2><p class="sub">Paid about monthly or quarterly at least three times, or twice for quarterly. Ignore anything that is not really regular. Add the useful ones as commitments to set a category and control them.</p></div></div>${sect('Spending','spending')}${sect('Income','income')}${sect('Transfers out of cash','transfer')}${all.length?'':'<div class="empty">Nothing repeating found yet.</div>'}</section>`;
  $('add-commit').onclick=()=>editCommitment();
  document.querySelectorAll('[data-editc]').forEach(b=>b.onclick=()=>editCommitment(S.plan.commitments.find(c=>c.id===b.dataset.editc)));
  document.querySelectorAll('[data-adopt]').forEach(b=>b.onclick=()=>{
    const r=all.find(x=>x.key===b.dataset.adopt),treat=r.src==='income'?'Income':r.src==='spending'?'P&L Expense':'Savings Transfer';
    const catLine=S.ix.txs.find(t=>t.description===r.desc&&t.cat);const key=catLine?catLine.lines.map(catKey).find(k=>expenseCategories().some(e=>e.key===k)):'';
    editCommitment(null,{desc:r.desc,treat,cat:treat==='P&L Expense'?(key||''):'',cur:baseCurrency(S.data)||S.cur,amount:Math.round(Math.abs(r.amt)),freq:r.every==='quarterly'?'quarterly':'monthly',start:nextOf(r),srcKey:r.key});
  });
  document.querySelectorAll('[data-rignore]').forEach(b=>b.onclick=()=>{const k=b.dataset.rignore;if(S.plan.ignoreRec[k])delete S.plan.ignoreRec[k];else S.plan.ignoreRec[k]=true;savePlan();render()});
}

