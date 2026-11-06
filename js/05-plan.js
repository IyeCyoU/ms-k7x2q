'use strict';
/* ============================================================
   Plan: outlook, budgets, goals
   ============================================================ */
const monthsBetween=(a,b)=>(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7));
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?(n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2):0};
const normDesc=t=>String(t||'').toLowerCase().replace(/[0-9#*\-_/.,]+/g,' ').replace(/\s+/g,' ').trim();
const toBase=(amount,cur,date)=>{const r=fxAt(S.data,cur,date);return r===null?null:amount*r};
const fromBase=(v,cur,date)=>{const r=fxAt(S.data,cur,date||S.ix.latest);return r?v/r:null};
const fmtIn=(v,cur,dec=0)=>S.mask?'••••':new Intl.NumberFormat(cur==='INR'?'en-IN':'en-GB',{minimumFractionDigits:dec,maximumFractionDigits:dec}).format(v).replace('-','−');
const catKey=l=>NW.test(l.main)?l.main+' › '+(l.level2||l.label):(l.main||'Uncategorised');
const monthOptions=(sel,from,to)=>{const o=[];for(let m=from;m<=to;m=addMonths(m,1))o.push(`<option value="${m.slice(0,7)}" ${m.slice(0,7)===sel?'selected':''}>${esc(fmonLong(m))}</option>`);return o.join('')};

/* ---- repeating payments ---- */
function detectRecurring(){
  const ix=S.ix,L=ix.latest,from=addDays(L,-240),g={};
  for(const t of ix.txs){
    if(t.date<from||isOneoff(t.tx))continue;
    let src,amt;
    if(t.kind==='income'){if(t.amount<=0)continue;src='income';amt=t.amount}
    else if(t.kind==='expense'){if(t.amount>=0)continue;src='spending';amt=t.amount}
    else{
      if(t.lines.some(l=>l.a.type==='CREDIT CARD'))continue;
      const cd=sum(t.lines.filter(l=>isCash(l.a)),l=>l.value);
      const other=t.lines.some(l=>!isCash(l.a)&&(l.group==='Asset'||l.group==='Liability'));
      if(!other||cd>-.01)continue;
      src='transfer';amt=cd;
    }
    const k=src+'|'+(normDesc(t.description)||t.description);
    (g[k]??=[]).push({date:t.date,amt,desc:t.description,cat:t.cat});
  }
  const out=[];
  for(const[k,arr]of Object.entries(g)){
    if(arr.length<2)continue;
    arr.sort((a,b)=>a.date.localeCompare(b.date));
    const gaps=[];for(let i=1;i<arr.length;i++)gaps.push(daysBetween(arr[i-1].date,arr[i].date)-1);
    const mi=median(gaps);
    let every=null;
    if(mi>=26&&mi<=35&&arr.length>=3)every='monthly';else if(mi>=84&&mi<=97)every='quarterly';
    if(!every)continue;
    if(gaps.filter(x=>Math.abs(x-mi)<=6).length<gaps.length/2)continue;
    const last=arr.at(-1);
    if(daysBetween(last.date,L)-1>mi*1.6)continue;
    const prevAmts=arr.slice(0,-1).map(x=>x.amt),prevMed=median(prevAmts),lastAmt=last.amt,stable=prevAmts.every(v=>Math.abs(v-prevMed)<=Math.max(.5,Math.abs(prevMed)*.02)),changed=arr.length>=3&&stable&&Math.abs(lastAmt-prevMed)>Math.max(.5,Math.abs(prevMed)*.03);
    out.push({key:k,src:k.split('|')[0],desc:last.desc,cat:last.cat,amt:median(arr.map(x=>x.amt)),every,interval:Math.round(mi),last:last.date,n:arr.length,lastAmt,prevMed,changed,ignored:!!(S.plan.ignoreRec&&S.plan.ignoreRec[k])});
  }
  return out;
}
function upcoming(rec,days){
  const L=S.ix.latest,end=addDays(L,days),out=[];
  for(const r of rec){
    let d=addDays(r.last,r.interval);
    if(d<=L){if(daysBetween(d,L)-1>10){while(d<=L)d=addDays(d,r.interval)}else d=addDays(L,1)}
    while(d<=end){out.push({...r,date:d});d=addDays(d,r.interval)}
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}
const SCEN={base:{label:'Base',inc:1,sp:1,note:'Your drivers as they are'},cautious:{label:'Cautious',inc:.9,sp:1.1,note:'Income 10% lower, spending 10% higher'},optimistic:{label:'Optimistic',inc:1.05,sp:.95,note:'Income 5% higher, spending 5% lower'}};

/* ---- budgets ---- */
function budgetFor(mk){
  const v=S.plan.budgets.filter(x=>x.from<=mk).sort((a,b)=>b.from.localeCompare(a.from))[0];
  if(!v)return null;
  const r=fxAt(S.data,v.cur,mk+'-01');if(r===null)return null;
  const out={};for(const[k,a]of Object.entries(v.amounts))out[k]=a*r;
  return{v,out};
}
function budgetCompare(s,e){
  const ix=S.ix,cap=e>ix.latest?ix.latest:e,rows={};let has=false;
  if(cap<s)return{has:false,list:[],tot:{budget:0,full:0,actual:0},cap,a:actual(S.data,s,s,ix)};
  for(let m=monthStart(s);m<=cap;m=addMonths(m,1)){
    const b=budgetFor(m.slice(0,7));if(!b)continue;has=true;
    const mEnd=endMonth(m),dim=daysBetween(m,mEnd),from=m<s?s:m;
    const f1=daysBetween(from,mEnd<cap?mEnd:cap)/dim,f2=daysBetween(from,mEnd<e?mEnd:e)/dim;
    for(const[k,v]of Object.entries(b.out)){if(/^(@|Income › |\+)/.test(k))continue;const r=(rows[k]??={budget:0,full:0,actual:0});r.budget+=v*f1;r.full+=v*f2}
  }
  const a=actual(S.data,s,cap,ix);
  for(const l of a.exLines){(rows[catKey(l)]??={budget:0,full:0,actual:0}).actual+=l.value}
  const list=Object.entries(rows).map(([k,r])=>({key:k,...r,variance:r.budget-r.actual})).sort((x,y)=>Math.max(y.budget,y.actual)-Math.max(x.budget,x.actual));
  const tot=list.reduce((t,r)=>({budget:t.budget+r.budget,full:t.full+r.full,actual:t.actual+r.actual}),{budget:0,full:0,actual:0});
  return{has,list,tot,cap,a};
}

function attention(){
  const ix=S.ix,[s,e]=range(),items=[];
  if(ix.errors.length)items.push({k:'bad',t:ix.errors.length+' transaction'+(ix.errors.length>1?'s are':' is')+' left out of the totals.',go:'data'});
  const age=Math.floor((Date.now()-D(ix.latest).getTime())/86400000);
  if(age>14&&!S.meta.sample)items.push({k:'warn',t:'Your data ends '+age+' days ago. Import a fresh export to bring it up to date.',act:'import'});
  const bc=budgetCompare(s,e);
  if(bc.has){const over=bc.list.filter(r=>r.budget>0&&r.actual>r.budget*1.0001);if(over.length)items.push({k:'warn',t:over.length+' categor'+(over.length>1?'ies are':'y is')+' over budget so far in this period.',go:'plan',tab:'budget'})}
  const cch=closedStatus(S.data,ix).filter(x=>x.changed);
  if(cch.length)items.push({k:'bad',t:'Closed month '+fmonLong(cch[0].mk+'-01')+(cch.length>1?' and '+(cch.length-1)+' more have':' has')+' changed since you closed it.',go:'reports',report:'close'});
  const o=outlook(),chg=activeRecurring().filter(r=>r.changed);
  if(chg.length)items.push({k:'info',t:chg.length+' repeating payment'+(chg.length>1?'s':'')+' changed in price, for example '+(chg[0].desc||'one item')+'.',go:'plan',tab:'repeat'});
  if(o.reserve>0&&o.lowest.cash<o.reserve)items.push({k:'bad',t:'Available cash is projected to drop below your reserve by '+fmonLong(o.lowest.month)+'.',go:'plan',tab:'outlook'});
  else if(o.lowest.cash<0)items.push({k:'bad',t:'Available cash is projected to go negative by '+fmonLong(o.lowest.month)+'.',go:'plan',tab:'outlook'});
  const a=actual(S.data,s,e>ix.latest?ix.latest:e,ix),pr=prevRange(s,e),pa=pr?actual(S.data,pr[0],pr[1],ix):null;
  if(pa&&pa.expense>0&&a.expense>pa.expense*1.2)items.push({k:'warn',t:'Spending is '+S.cur+' '+fmt(a.expense-pa.expense)+' ('+Math.round((a.expense/pa.expense-1)*100)+'%) higher than '+prevText(e).replace('vs ','')+'.',go:'spending'});
  const big=a.exLines.reduce((m,l)=>l.value>(m?m.value:0)?l:m,null);
  if(big&&a.expense>0&&big.value>a.expense*.3&&a.exLines.length>5)items.push({k:'info',t:'One payment, '+(big.description||'a single transaction')+', is '+Math.round(big.value/a.expense*100)+'% of spending in this period.',go:'activity'});
  return items;
}

/* ---- plan page ---- */
function vPlan(){
  const tabs=[['outlook','Outlook'],['budget','Budget'],['goals','Goals'],['repeat','Repeating'],['debt','Debt']];
  $('view').innerHTML=`<div class="tabs" role="group" aria-label="Plan section">${tabs.map(([k,n])=>`<button data-ptab="${k}" aria-pressed="${S.ptab===k}">${n}</button>`).join('')}</div><div id="ptab"></div>`;
  document.querySelectorAll('[data-ptab]').forEach(el=>el.onclick=()=>{S.ptab=el.dataset.ptab;S.anim=true;render()});
  ({outlook:pOutlook,budget:pBudget,goals:pGoals,repeat:pRepeat,debt:pDebt})[S.ptab]();
}
function prevRangeLabel(e){return prevText(e)}
function pBudgetPeriod(){
  const[s,e]=range(),bc=budgetCompare(s,e),ix=S.ix,partial=e>ix.latest&&S.per.mode==='month';
  const versions=[...S.plan.budgets].sort((a,b)=>b.from.localeCompare(a.from));
  if(!bc.has){
    $('bp-period').innerHTML='<section class="card block"><div class="empty" style="padding:26px 0"><h2 style="margin-bottom:8px">Budget against actual</h2><p style="max-width:54ch;margin:0 auto">Type amounts in the plan above. This section then compares each category with what you actually spent in the period you chose, prorated for the days so far.</p></div></section>';
    if($('edit-budget-p'))$('edit-budget-p').onclick=editBudget;return;
  }
  const bl=baseline(s),fb=pace(s,e);
  const paceV=partial&&bc.tot.actual>0?bc.tot.actual/daysBetween(monthStart(ix.latest),ix.latest)*daysBetween(monthStart(ix.latest),endMonth(ix.latest)):null;
  const row=r=>{
    const used=r.budget>0?r.actual/r.budget:null,over=r.budget>0?r.actual>r.budget*1.0001:r.actual>0;
    const w=r.budget>0?Math.min(100,used*100):(r.actual>0?100:0);
    return`<button class="row" data-explain="${esc(r.key)}"><div><span class="t">${esc(r.key)}</span><div class="track" style="margin:8px 0 4px"><b style="width:${w}%;background:${over?'var(--red)':'var(--teal)'}"></b></div><small>${r.budget>0?fmt(r.actual)+' of '+fmt(r.budget)+(partial?' to date':''):'No budget set · '+fmt(r.actual)+' spent'}</small>${bl?`<small style="margin-top:4px">${vchip(r.actual-(bl.byCat[r.key]||0)*fb,true,'avg')}</small>`:''}</div><div class="amt ${r.budget>0?(r.variance>=0?'pos':'neg'):'neu'}">${r.budget>0?(r.variance>=0?'Under by ':'Over by ')+fmt(Math.abs(r.variance)):''}</div></button>`;
  };
  $('bp-period').innerHTML=`
  <div class="kpis four">
    ${kpi(partial?'Budget to date':'Budget',fmt(bc.tot.budget),partial?'Full month: '+fmt(bc.tot.full):esc(periodLabel()))}
    ${kpi('Spent',fmt(bc.tot.actual),(bl?`<div class="chips">${vchip(bc.tot.actual-bl.expense*fb,true,'avg')}</div>`:'')+(bc.tot.budget>0?`<div class="cmp">${pct(bc.tot.actual/bc.tot.budget)} of budget</div>`:''))}
    ${kpi(bc.tot.budget-bc.tot.actual>=0?'Under budget':'Over budget',fmt(Math.abs(bc.tot.budget-bc.tot.actual)),partial?'So far this month':'For the period')}
    ${kpi('At this pace',paceV===null?'—':fmt(paceV),paceV===null?'Shown for the current month':'Month-end spending vs '+fmt(bc.tot.full)+' budget')}
  </div>
  <section class="card block"><div class="head"><div><h2>Budget vs actual for this period</h2><p class="sub">${esc(S.cur)} · ${esc(periodLabel())}. Select a category to see what drove it.</p></div><div class="actions"><button class="btn small" id="edit-budget-p">Edit budget</button></div></div>${vlegend(bl)}${bc.list.map(row).join('')}</section>
  <section class="card block"><h2>Budget versions</h2><p class="sub">The version in force for a month is the latest one starting on or before it.</p><div class="list">${versions.map((v,i)=>`<div class="row"><div><span class="t">From ${esc(fmonLong(v.from+'-01'))}</span><small>${Object.keys(v.amounts).length} categories · ${esc(v.cur)} ${fmtIn(sum(Object.values(v.amounts)),v.cur,0)} a month</small></div><div class="amt"><button class="btn small" data-vdel="${esc(v.from)}">Remove</button></div></div>`).join('')}</div></section>`;
  if($('edit-budget-p'))$('edit-budget-p').onclick=editBudget;
  document.querySelectorAll('[data-explain]').forEach(el=>el.onclick=()=>explainCategory(el.dataset.explain,s,e));
  document.querySelectorAll('[data-vdel]').forEach(el=>el.onclick=()=>modal('Remove this budget version?','<p>Months that used it will fall back to an earlier version, or to no budget.</p>',[{label:'Cancel',run:()=>$('modal').close()},{label:'Remove',primary:true,run:()=>{S.plan.budgets=S.plan.budgets.filter(v=>v.from!==el.dataset.vdel);if(S.plan.bfrom===el.dataset.vdel)S.plan.bfrom=null;savePlan();$('modal').close();render()}}]));
}
function explainCategory(key,s,e){
  const ix=S.ix,cap=e>ix.latest?ix.latest:e,a=actual(S.data,s,cap,ix),ls=a.exLines.filter(l=>catKey(l)===key).sort((x,y)=>y.value-x.value);
  const pr=prevRange(s,e),pls=pr?actual(S.data,pr[0],pr[1],ix).exLines.filter(l=>catKey(l)===key):[],pt=sum(pls,l=>l.value),tot=sum(ls,l=>l.value);
  const bc=budgetCompare(s,e).list.find(r=>r.key===key);
  const top=ls.slice(0,6);
  modal(key,`<div class="kpis" style="margin-top:0"><div class="kpi card"><div class="label">Spent</div><strong>${fmt(tot)}</strong><div class="detail">${ls.length} transaction${ls.length===1?'':'s'}</div></div><div class="kpi card"><div class="label">Budget${e>ix.latest?' to date':''}</div><strong>${bc&&bc.budget>0?fmt(bc.budget):'—'}</strong><div class="detail">${bc&&bc.budget>0?(bc.variance>=0?'Under by ':'Over by ')+fmt(Math.abs(bc.variance)):'No budget set'}</div></div><div class="kpi card"><div class="label">${esc(prevText(e).replace('vs ',''))}</div><strong>${pr?fmt(pt):'—'}</strong><div class="detail">${pr&&pt?change(tot,pt,true)+' change':''}</div></div></div>
   <h3 style="margin-top:18px">Largest transactions</h3><div class="list">${top.map(l=>`<div class="row"><div><span class="t">${esc(l.description||'(no description)')}</span><small>${esc(fdate(l.date))}</small></div><div class="amt">${fmt(l.value)}</div></div>`).join('')||'<p class="sub">No transactions in this period.</p>'}</div>
   ${ls.length>6?`<p class="footnote">The top ${top.length} make up ${pct(sum(top,l=>l.value)/tot)} of this category.</p>`:''}`);
  S.mv={k:'explain',a:[key]};navCommit();
}
function editBudget(){
  const ix=S.ix,cs=currencies(),ek=editVersionKey(),own=S.plan.budgets.find(v=>v.from===ek),now=own?{v:own}:budgetFor(ek),cur0=now?now.v.cur:S.cur;
  const months=Math.min(12,monthsBetween(ix.earliest,ix.latest)+1);
  const a12=actual(S.data,addMonths(monthStart(ix.latest),-11),ix.latest,ix),tot={};
  for(const l of a12.exLines){const k=catKey(l);tot[k]=(tot[k]||0)+l.value}
  const keys=[...new Set([...Object.keys(tot),...(now?Object.keys(now.v.amounts):[])])].sort((a,b)=>(tot[b]||0)-(tot[a]||0));
  const cur=()=>$('b-cur')?.value||cur0,avg=k=>{const v=fromBase((tot[k]||0)/months,cur(),ix.latest);return v===null?0:v};
  const first=monthStart(ix.earliest),lastM=addMonths(monthStart(ix.latest),12);
  modal('Budget',`<div class="form-grid"><label class="fld"><span>Applies from</span><select id="b-from">${monthOptions(ek,first,lastM)}</select></label><label class="fld"><span>Amounts in</span><select id="b-cur">${cs.map(c=>`<option ${c===cur0?'selected':''}>${esc(c)}</option>`).join('')}</select></label></div>
   <p class="sub" style="margin:12px 0">Monthly amounts per category. The right-hand figure is your average over the last ${months} month${months>1?'s':''}.</p>
   <div class="list" id="b-list">${keys.map(k=>`<div class="row"><div><span class="t">${esc(k)}</span></div><div class="amt"><input class="num-in" type="text" inputmode="decimal" autocomplete="off" data-bk="${esc(k)}" value="${now&&now.v.amounts[k]!=null?now.v.amounts[k]:''}" aria-label="Monthly budget for ${esc(k)}"> <small data-avg="${esc(k)}">avg ${fmtIn(avg(k),cur0,0)}</small></div></div>`).join('')}</div>
   <button class="btn small" id="b-fill" style="margin-top:10px">Fill blanks with recent averages</button>`,
   [{label:'Cancel',run:()=>$('modal').close()},{label:'Save budget',primary:true,run:()=>{
     const amounts={};let bad=false;
     document.querySelectorAll('[data-bk]').forEach(el=>{if(el.value.trim()==='')return;const v=parseAmount(el.value);if(v===null||v<0)bad=true;else amounts[el.dataset.bk]=v});
     if(bad){toast('Use zero or positive amounts.');return}
     if(!Object.keys(amounts).length){toast('Enter at least one amount.');return}
     const from=$('b-from').value,v={from,cur:$('b-cur').value,amounts};
     const prevV=S.plan.budgets.find(x=>x.from===from)||(now&&now.v),keep=prevV&&prevV.cur===v.cur;if(keep)for(const[k,a]of Object.entries(prevV.amounts))if(/^(@|Income › |\+)/.test(k))amounts[k]=a;
     v.amounts=amounts;
     S.plan.budgets=[...S.plan.budgets.filter(x=>x.from!==from),v].sort((a,b)=>a.from.localeCompare(b.from));
     S.plan.bfrom=from;savePlan();$('modal').close();S.ptab='budget';render();toast('Budget saved from '+fmonLong(from+'-01')+'.');
   }}]);
  $('b-cur').onchange=()=>document.querySelectorAll('[data-avg]').forEach(el=>el.textContent='avg '+fmtIn(avg(el.dataset.avg),cur(),0));
  $('b-fill').onclick=()=>document.querySelectorAll('[data-bk]').forEach(el=>{if(el.value===''&&(tot[el.dataset.bk]||0)>0)el.value=Math.round(avg(el.dataset.bk))});
}

/* ---- goals ---- */
function goalState(g){
  const L=S.ix.latest,b=balances(S.data,L,S.ix);let have=g.current||0;
  if(g.link){const a=b.rows.find(r=>r.id===g.link);have=a&&a.value!==null?(fromBase(a.value,g.cur,L)||0):0}
  const remaining=Math.max(0,g.target-have),left=g.date?Math.max(0,monthsBetween(L,g.date)):null,planned=g.monthly||0;
  const required=remaining<=0?0:left===null?0:left>0?remaining/left:Infinity;
  let status,k;
  if(remaining<=0){status='Funded';k='good'}else if(left===null){status=planned>0?'On track':'No date set';k=planned>0?'good':'warn'}else if(left===0){status='Past target date';k='bad'}else if(planned>=required-.005){status='On track';k='good'}else{status='Behind';k='warn'}
  const finish=remaining>0&&planned>0?addMonths(monthStart(L),Math.ceil(remaining/planned)):null;
  return{have,remaining,left,required,planned,status,k,finish,shortfall:Math.max(0,required-planned)};
}
/* ============================================================
   PDF export: builds a real PDF in the page, so it works without
   the browser's print dialog (which some embedded views block).
   ============================================================ */
const HW=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WINANSI={0x2022:0x95,0xB7:0xB7,0x2014:0x97,0x2013:0x96,0x203A:0x9B,0x2039:0x8B,0x2019:0x92,0x2018:0x91,0x201C:0x93,0x201D:0x94,0x2026:0x85,0x20AC:0x80,0x2212:0x2D,0xA0:0x20};
function pdfEnc(t){
  let o='';
  for(const ch of String(t??'')){let c=ch.codePointAt(0);if(WINANSI[c])c=WINANSI[c];else if(c>255||(c>=0x80&&c<=0x9F))c=0x3F;o+=c>=32?String.fromCharCode(c):' '}
  return o;
}
function pdfWidth(t,size,bold){
  let w=0;for(const ch of pdfEnc(t)){const c=ch.charCodeAt(0);w+=(c>=32&&c<=126?(bold?HB:HW)[c-32]:556)}
  return w*size/1000;
}
function pdfFit(t,size,bold,max){
  t=String(t??'');if(pdfWidth(t,size,bold)<=max)return t;
  while(t.length>1&&pdfWidth(t+'...',size,bold)>max)t=t.slice(0,-1);
  return t+'...';
}
class PdfDoc{
  constructor(){this.W=595.28;this.H=841.89;this.pages=[];this.newPage()}
  newPage(){this.cur=[];this.pages.push(this.cur);return this}
  op(s){this.cur.push(s)}
  static rgb(h){const n=parseInt(h.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255].map(v=>v.toFixed(3)).join(' ')}
  text(x,y,t,{size=10,bold=false,color='#15233b',align='l',page}={}){
    const s=pdfEnc(t).replace(/[\\()]/g,'\\$&'),w=pdfWidth(t,size,bold);
    const px=align==='r'?x-w:align==='c'?x-w/2:x;
    (page||this.cur).push(`BT ${PdfDoc.rgb(color)} rg /${bold?'F2':'F1'} ${size} Tf ${px.toFixed(2)} ${(this.H-y).toFixed(2)} Td (${s}) Tj ET`);
  }
  rect(x,top,w,h,fill,page){(page||this.cur).push(`${PdfDoc.rgb(fill)} rg ${x.toFixed(2)} ${(this.H-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)}
  round(x,top,w,h,r,fill){
    const k=.5523*r,x0=x,y0=this.H-top-h,x1=x+w,y1=this.H-top,f=n=>n.toFixed(2);
    this.op(`${PdfDoc.rgb(fill)} rg ${f(x0+r)} ${f(y0)} m ${f(x1-r)} ${f(y0)} l ${f(x1-r+k)} ${f(y0)} ${f(x1)} ${f(y0+r-k)} ${f(x1)} ${f(y0+r)} c ${f(x1)} ${f(y1-r)} l ${f(x1)} ${f(y1-r+k)} ${f(x1-r+k)} ${f(y1)} ${f(x1-r)} ${f(y1)} c ${f(x0+r)} ${f(y1)} l ${f(x0+r-k)} ${f(y1)} ${f(x0)} ${f(y1-r+k)} ${f(x0)} ${f(y1-r)} c ${f(x0)} ${f(y0+r)} l ${f(x0)} ${f(y0+r-k)} ${f(x0+r-k)} ${f(y0)} ${f(x0+r)} ${f(y0)} c f`);
  }
  tri(cx,cy,size,up,color){
    const h=this.H,f=n=>n.toFixed(2),a=size/2;
    this.op(`${PdfDoc.rgb(color)} rg ${f(cx-a)} ${f(h-(up?cy+a*.8:cy-a*.8))} m ${f(cx+a)} ${f(h-(up?cy+a*.8:cy-a*.8))} l ${f(cx)} ${f(h-(up?cy-a*.9:cy+a*.9))} l f`);
  }
  line(x1,y1,x2,y2,color='#dde4ee',w=.6,page){(page||this.cur).push(`${PdfDoc.rgb(color).split(' ').join(' ')} RG ${w} w ${x1.toFixed(2)} ${(this.H-y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H-y2).toFixed(2)} l S`)}
  bytes(title){
    const n=this.pages.length,objs=[];
    objs[1]='<< /Type /Catalog /Pages 2 0 R >>';
    objs[2]=`<< /Type /Pages /Kids [${this.pages.map((_,i)=>(6+2*i)+' 0 R').join(' ')}] /Count ${n} >>`;
    objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const d=new Date(),p2=x=>String(x).padStart(2,'0');
    objs[5]=`<< /Title (${pdfEnc(title).replace(/[\\()]/g,'\\$&')}) /Producer (Money status) /CreationDate (D:${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`;
    this.pages.forEach((ops,i)=>{
      const body=ops.join('\n');
      objs[6+2*i]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7+2*i} 0 R >>`;
      objs[7+2*i]=`<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
    });
    let out='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offs=[];
    for(let i=1;i<objs.length;i++){offs[i]=out.length;out+=`${i} 0 obj\n${objs[i]}\nendobj\n`}
    const xr=out.length;
    out+=`xref\n0 ${objs.length}\n0000000000 65535 f \n`+offs.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xr}\n%%EOF`;
    const u=new Uint8Array(out.length);for(let i=0;i<out.length;i++)u[i]=out.charCodeAt(i)&255;
    return u;
  }
}

const PDFC={ink:'#15233b',muted:'#5d6c85',line:'#dde4ee',navy:'#0f1c33',soft:'#eef2f8',good:['#e4f4ec','#156643'],bad:['#fbe8ec','#a53a4c'],flat:['#eef2f8','#5d6c85']};
function pdfChip(doc,d,rightX,top){
  if(!d)return;
  const pal=S.look&&S.look.variance==='bo'?{good:['#dbeafe','#1d4ed8'],bad:['#ffe8d1','#9a4506'],flat:PDFC.flat}:PDFC;
  const [bg,fg]=pal[d.tone]||PDFC.flat,size=7.5,tw=pdfWidth(d.text,size,true),w=tw+(d.dir==='flat'?12:24),x=rightX-w;
  doc.round(x,top,w,12.5,6.2,bg);
  if(d.dir!=='flat')doc.tri(x+9,top+6.4,5.2,d.dir==='up',fg);
  doc.text(x+(d.dir==='flat'?6:15),top+9.3,d.text,{size,bold:true,color:fg});
}
/* A small layout engine: rows flow down the page and break to new pages. */
class PdfFlow{
  constructor(doc){this.doc=doc;this.y=44;this.L=40;this.R=doc.W-40;this.first=true}
  ensure(h){if(this.y+h>this.doc.H-52){this.doc.newPage();this.y=64}}
  title(t,sub){
    this.ensure(70);
    this.doc.text(this.L,this.y+16,t,{size:this.first?20:14,bold:true,color:PDFC.navy});this.y+=this.first?26:20;
    if(sub){this.doc.text(this.L,this.y+9,sub,{size:9.5,color:PDFC.muted});this.y+=16}
    this.first=false;this.y+=6;
  }
  para(t,{size=8.5,color=PDFC.muted,gap=4}={}){
    const words=String(t).split(' '),max=this.R-this.L;let line='';
    for(const w of words){const test=line?line+' '+w:w;if(pdfWidth(test,size,false)>max&&line){this.ensure(13);this.doc.text(this.L,this.y+9,line,{size,color});this.y+=12;line=w}else line=test}
    if(line){this.ensure(13);this.doc.text(this.L,this.y+9,line,{size,color});this.y+=12}
    this.y+=gap;
  }
  table(rows,{mid=false,headers=null}={}){
    const d=this.doc,amtR=mid?this.L+245:this.L+300,midR=this.L+325,chipR=this.R;
    if(headers){this.ensure(24);d.text(amtR,this.y+9,headers[0],{size:8,color:PDFC.muted,align:'r'});if(mid&&headers[2])d.text(midR,this.y+9,headers[2],{size:8,color:PDFC.muted,align:'r'});d.text(chipR,this.y+9,headers[1],{size:8,color:PDFC.muted,align:'r'});d.line(this.L,this.y+13,this.R,this.y+13);this.y+=15}
    for(const r of rows){
      const head=r.cls==='head',total=r.cls==='total',small=r.cls==='check',h=head?28:19;
      this.ensure(head?h+40:h);
      if(head){d.text(this.L,this.y+19,r.label,{size:11,bold:true,color:PDFC.navy});if(r.v!==null&&r.v!==undefined)d.text(amtR,this.y+19,typeof r.v==='string'?r.v:fmt(r.v,r.dec??0),{size:9.5,bold:true,color:PDFC.ink,align:'r'});d.line(this.L,this.y+24,this.R,this.y+24,'#b9c4d6',.9);this.y+=h;continue}
      if(total)d.rect(this.L,this.y,this.R-this.L,h-1,PDFC.soft);
      const indent=r.cls==='sub'||r.cls==='row'?10:total?4:0,size=small?8.5:9.5;
      d.text(this.L+indent,this.y+13,pdfFit(r.label,size,total,amtR-this.L-indent-(mid?70:60)-(r.mid?0:0)),{size,bold:total,color:small?PDFC.muted:(r.cls==='sub'?'#33415a':PDFC.ink)});
      if(r.v!==null&&r.v!==undefined)d.text(amtR,this.y+13,typeof r.v==='string'?r.v:fmt(r.v,r.dec??0),{size,bold:total,color:small?PDFC.muted:PDFC.ink,align:'r'});
      if(mid&&r.mid)d.text(midR,this.y+13,r.mid,{size:8.5,color:PDFC.muted,align:'r'});
      pdfChip(d,r.vd,chipR-3,this.y+3);
      if(!total)d.line(this.L,this.y+h-1,this.R,this.y+h-1);
      this.y+=h;
    }
    this.y+=8;
  }
  tableHeight(rows,headers){let h=headers?15:0;for(const r of rows)h+=r.cls==='head'?28:19;return h+8}
  block(title,sub,rows,opts={}){
    const need=(sub?44:36)+this.tableHeight(rows,opts.headers),avail=this.doc.H-52-64;
    this.ensure(need<=avail?need:120);
    this.title(title,sub);this.table(rows,opts);
  }
  gap(n=8){this.y+=n}
}
function pdfFinish(doc,title,periodText,dataThrough){
  const n=doc.pages.length,now=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  doc.pages.forEach((pg,i)=>{
    doc.text(40,24,'Money status',{size:8.5,bold:true,color:PDFC.navy,page:pg});
    doc.text(doc.W-40,24,periodText,{size:8.5,color:PDFC.muted,align:'r',page:pg});
    doc.line(40,30,doc.W-40,30,PDFC.line,.6,pg);
    doc.line(40,doc.H-40,doc.W-40,doc.H-40,PDFC.line,.6,pg);
    doc.text(40,doc.H-27,`Data through ${dataThrough} · Created ${now} · Amounts in ${S.cur}`,{size:7.5,color:PDFC.muted,page:pg});
    doc.text(doc.W-40,doc.H-27,`Page ${i+1} of ${n}`,{size:7.5,color:PDFC.muted,align:'r',page:pg});
  });
  return doc.bytes(title);
}

/* ---- what goes in the PDFs ---- */
function pdfRows(rows){return rows.map(([label,v,cls,vdt,mid])=>({label,v,cls:cls||'row',vd:vdt||null,mid:mid||'',dec:2}))}
function spendingModel(s,e){
  const d=S.data,ix=S.ix,a=actual(d,s,e,ix),bl=baseline(s),f=pace(s,e),tree={};
  for(const l of a.exLines){const mn=l.main||'Uncategorised',kn=l.level2||l.label,M=(tree[mn]??={v:0,kids:{}});M.v+=l.value;M.kids[kn]=(M.kids[kn]||0)+l.value}
  const total=a.expense,rows=[];
  for(const[mn,M]of Object.entries(tree).sort((x,y)=>y[1].v-x[1].v)){
    rows.push({label:mn,v:M.v,cls:'total',vd:bl?vd(M.v-(bl.byMain[mn]||0)*f,true,'avg'):null,mid:pct(total>0?M.v/total:null),dec:0});
    for(const[kn,v]of Object.entries(M.kids).sort((x,y)=>y[1]-x[1]))rows.push({label:kn,v,cls:'sub',vd:bl?vd(v-(bl.byKey[mn+'|'+kn]||0)*f,true,'avg'):null,mid:pct(total>0?v/total:null),dec:0});
  }
  return{rows,total,bl};
}
function pdfBudgetRows(s,e){
  const bc=budgetCompare(s,e);if(!bc.has)return null;
  const rows=bc.list.map(r=>({label:r.key,v:r.actual,cls:'sub',dec:0,mid:r.budget>0?'of '+fmt(r.budget):'no budget',vd:r.budget>0?vd(r.actual-r.budget,true,'budget'):null}));
  rows.push({label:'Total',v:bc.tot.actual,cls:'total',dec:0,mid:'of '+fmt(bc.tot.budget),vd:bc.tot.budget>0?vd(bc.tot.actual-bc.tot.budget,true,'budget'):null});
  return rows;
}
function buildPdf(kind){
  const wasMasked=S.mask;S.mask=false;
  try{
    const ix=S.ix,[s,e]=range(),doc=new PdfDoc(),fl=new PdfFlow(doc),per=periodLabel(),through=fdate(ix.latest);
    const bo=S.look&&S.look.variance==='bo',legend=bo?'Blue is better for you and orange is worse. Spending above your average is orange and below is blue; income and savings above average are blue.':'Green is better for you and red is worse. Spending above your average is red and below is green; income and savings above average are green.';
    if(kind==='close'){
      const mk=closeMonthKey(),cm=closeModel(mk),st=closedStatus(S.data,ix);
      fl.title('Month-end close · '+fmonLong(cm.s),S.cur);
      fl.table(cm.items.flatMap(i=>{const t=itemStatus(i);return[{label:i.label,v:'',cls:'row',vd:{dir:t.dir,tone:t.tone,text:t.t},mid:'',dec:0},{label:i.note,v:null,cls:'check',vd:null,mid:''}]}),{headers:['','Status']});
      fl.block('Figures for the month',S.cur,[{label:'Income',v:cm.figs.income,cls:'row',dec:0},{label:'Spending',v:cm.figs.expense,cls:'row',dec:0},{label:'Surplus or deficit',v:cm.figs.income-cm.figs.expense,cls:'total',dec:0},{label:'Net worth at month-end',v:cm.figs.net,cls:'row',dec:0},{label:'Transactions',v:String(cm.figs.tx),cls:'row'}],{});
      fl.block('Closed months','Snapshots kept when you closed them',st.slice(0,14).map(x=>({label:fmonLong(x.mk+'-01')+' · closed '+new Date(x.snap.at).toLocaleDateString('en-GB'),v:'',cls:'sub',vd:{dir:x.changed?'down':'up',tone:x.changed?'bad':'good',text:x.changed?'Changed since closing':'Unchanged'}})).concat(st.length?[]:[{label:'No months closed yet',v:'',cls:'check'}]),{});
      return{bytes:pdfFinish(doc,'Month-end close '+mk,fmonLong(cm.s),through),name:'Money-status-month-end-close-'+mk+'.pdf'};
    }
    if(kind==='year'){
      const ym=yearModel(),yp=(ym.partial?'Year to date ':'Year ')+ym.y;
      fl.title('Year in review '+ym.y+(ym.partial?' (to date)':''),ym.hasPrev?'Compared with the same period last year':'There is no earlier year to compare with');
      fl.para(bo?'Blue is better for you and orange is worse. Spending above last year is orange and below is blue; income and savings above last year are blue.':'Green is better for you and red is worse. Spending above last year is red and below is green; income and savings above last year are green.');
      fl.table(pdfRows(ym.rows),{headers:['Amount','Against last year']});
      fl.block('Where the money went',S.cur+' · biggest categories',ym.catRows,{mid:true,headers:['Spent','Against last year','Share']});
      fl.block('Month by month',S.cur,ym.months,{mid:true,headers:['Income','Result','Spending']});
      fl.block('Largest single payments',S.cur,ym.big,{headers:['Amount']});
      fl.para('Amounts are converted at the exchange rates in your export unless you entered your own monthly rates. Transfers between accounts, investment purchases, loan principal and card payments are not counted as income or spending.',{gap:0});
      return{bytes:pdfFinish(doc,'Year in review '+ym.y,yp,through),name:'Money-status-year-in-review-'+ym.y+'.pdf'};
    }
    if(kind==='summary'){
      const b=balances(S.data,e,ix),a=actual(S.data,s,e,ix),bl=baseline(s),f=pace(s,e),V=(x,low)=>bl?vd(x,low,'avg'):null;
      fl.title('Financial summary',`${per} · ${S.cur}`);
      fl.para(legend);
      fl.table(pdfRows([
        ['Net worth as of '+fdate(b.asOf),b.networth,'total'],['Total assets',b.assets],['Total liabilities',b.debt],['Cash and bank',b.cash],
        ['Income',a.income,'row',V(a.income-(bl?bl.income*f:0),false)],['Spending',a.expense,'row',V(a.expense-(bl?bl.expense*f:0),true)],
        ['Surplus or deficit',a.surplus,'row',V(a.surplus-(bl?(bl.income-bl.expense)*f:0),false)],['Savings rate',pct(a.savingsRate),'row',ptsd(a.savingsRate,bl)]]),{headers:['Amount','Against your average']});
      for(const k of ['income','position','cash','ratios']){const m=reportModel(k,s,e);fl.block(m.title,m.sub,pdfRows(m.rows),{headers:k==='ratios'?['Value','Rule of thumb']:m.rows.some(r=>r[3])?['Amount','Against your average']:null});}
      const sp=spendingModel(s,e);fl.block('Spending by category',`${per} · ${S.cur}`,sp.rows,{mid:true,headers:['Amount','Against your average','Share']});
      const br=pdfBudgetRows(s,e);if(br)fl.block('Budget and actual',`${per} · ${S.cur}`,br,{mid:true,headers:['Spent','Against budget','Budget']});
      fl.para('The average is your last three full months before this period, scaled to the days counted. Amounts are converted at the exchange rates in your export unless you entered your own monthly rates. Transfers between accounts, investment purchases, loan principal and card payments are not counted as income or spending.',{gap:0});
      return{bytes:pdfFinish(doc,'Financial summary '+per,per,through),name:'Money-status-summary-'+periodSlug(s,e)+'.pdf'};
    }
    const m=reportModel(kind,s,e);
    fl.title(m.title,m.sub);
    if(m.bl!==undefined)fl.para(legend);
    fl.table(pdfRows(m.rows),{headers:kind==='ratios'?['Value','Rule of thumb']:m.rows.some(r=>r[3])?['Amount','Against your average']:null});
    if(m.note)fl.para(m.note,{gap:0});
    return{bytes:pdfFinish(doc,m.title+' '+per,per,through),name:'Money-status-'+({position:'balance-sheet',income:'income-statement',cash:'cash-flow',ratios:'financial-ratios'}[kind]||kind)+'-'+periodSlug(s,e)+'.pdf'};
  }finally{S.mask=wasMasked}
}
const periodSlug=(s,e)=>S.per.mode==='month'?s.slice(0,7):S.per.mode==='year'?String(S.per.y):s+'_to_'+e;

/* ---- saving the file wherever the page is running ---- */
const isFramed=()=>{try{return window.top!==window.self}catch(e){return true}};
const savePdf=(bytes,filename)=>saveFile(new Blob([bytes],{type:'application/pdf'}),filename,'PDF');
async function exportPdf(kind){
  try{const r=buildPdf(kind);await savePdf(r.bytes,r.name)}catch(e){toast('The PDF could not be created: '+e.message)}
}

