'use strict';
/* ============================================================
   Pages
   ============================================================ */
const ICONS={
  overview:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  spending:'<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  accounts:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  reports:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h7"/>',
  activity:'<path d="M4 6h16M4 12h16M4 18h10"/>',
  plan:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  data:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
};
const PAGES=[['overview','Overview'],['spending','Spending'],['accounts','Accounts'],['plan','Plan'],['reports','Reports'],['activity','Activity'],['data','Data']];
const TAB_MAIN=['overview','spending','accounts','plan'];
const TITLES={overview:'Overview',spending:'Spending',accounts:'Accounts',plan:'Plan',reports:'Reports',activity:'Activity',data:'Your data',welcome:'Money status'};
const kpi=(label,value,detail,extra='')=>`<div class="card kpi">${extra}<div class="label">${esc(label)}</div><strong>${value}</strong><div class="detail">${detail||'&nbsp;'}</div></div>`;
const notice=(html,info)=>`<div class="notice ${info?'info':''}">${html}</div>`;
const txRow=t=>{
  const cls=t.kind==='transfer'?'neu':t.amount>=0?'pos':'neg';
  const amt=t.kind==='transfer'?fmt(t.amount,2):(t.amount>0?'+':'')+fmt(t.amount,2);
  return`<button class="row" data-tx="${esc(t.tx)}"><div><span class="t">${esc(t.description)}</span><small>${esc(fdate(t.date))} · ${esc(t.cat||(t.kind==='transfer'?'Transfer':''))}${t.accts.length?' · '+esc(t.accts.join(' → ')):''}${isOneoff(t.tx)?' · one-off':''}</small></div><div class="amt ${cls}">${amt}</div></button>`;
};
function catName(l){return NW.test(l.main)?(l.level2||l.label):l.main}

function vWelcome(){
  $('view').innerHTML=`<div class="drop" id="drop"><strong>Bring in your Moneydance export</strong><p>Choose the tab-delimited text file you exported from Moneydance. It is read in this browser and stays on this device.</p><div class="actions"><button class="btn primary" id="w-import">Choose export file</button><button class="btn" id="w-sample">Try with sample data</button><button class="btn" id="bk-load">Restore a backup</button></div><input type="file" id="bk-file" accept=".json,application/json" hidden><p class="sub" style="margin-top:14px">You can also drop the file anywhere on this page.</p></div>
  <section class="card block"><h2>Getting your data out of Moneydance</h2><ol class="steps" style="margin-top:12px"><li><b>Open File → Export</b> in Moneydance and choose the tab-delimited text format.</li><li><b>Include every account.</b> A file with only some accounts gives incomplete net worth and totals.</li><li><b>Save the file, then choose it here.</b> Next time, import a fresh export to replace the old one.</li></ol></section>`;
  $('w-import').onclick=()=>$('file').click();
  $('w-sample').onclick=loadSample;bindBackup();
}
function loadSample(){
  try{const text=sampleText(),p=parseTXT(text,'Sample data.txt');if(p.errors.length)throw new Error(p.errors[0]);applyParsed(p,text,undefined,true);S.page='overview';render();toast('Sample data loaded. Import your own export whenever you are ready.')}catch(e){toast('Could not build the sample: '+e.message)}
}

function pieHTML(slices,label){
  const tot=slices.reduce((a,x)=>a+x.v,0),sl=slices.filter(x=>x.v>0.005);
  if(!(tot>0)||!sl.length)return'<div class="empty" style="padding:24px 0">Nothing to show for this period.</div>';
  const C=100,R=92,pt=a=>[C+R*Math.sin(a),C-R*Math.cos(a)];let a0=0,paths='';
  for(const x of sl){
    const fr=x.v/tot,a1=a0+fr*2*Math.PI,tip=esc(x.label+': '+S.cur+' '+fmt(x.v)+' ('+(fr*100).toFixed(1)+'%)');
    if(sl.length===1)paths+=`<circle class="sl" cx="${C}" cy="${C}" r="${R}" fill="${x.color}" tabindex="0"><title>${tip}</title></circle>`;
    else{const[p,q]=[pt(a0),pt(a1)];paths+=`<path d="M${C} ${C}L${p[0].toFixed(2)} ${p[1].toFixed(2)}A${R} ${R} 0 ${fr>.5?1:0} 1 ${q[0].toFixed(2)} ${q[1].toFixed(2)}Z" fill="${x.color}" tabindex="0"><title>${tip}</title></path>`}
    a0=a1;
  }
  return`<div class="pie-wrap"><svg viewBox="0 0 200 200" role="img" aria-label="${esc(label)}">${paths}</svg><div class="pie-leg">${sl.map(x=>`<div><i style="background:${x.color}"></i><span>${esc(x.label)}</span><b>${(x.v/tot*100).toFixed(1)}%</b><small>${esc(S.cur)} ${fmt(x.v)}${x.note?' · '+esc(x.note):''}</small></div>`).join('')}</div></div>`;
}
function overviewPies(){
  const[s,e]=range(),d=S.data,ix=S.ix,a=actual(d,s,e,ix),b=balances(d,e,ix);
  const other=Math.max(0,a.expense-a.needs-a.wants),saved=Math.max(0,a.surplus),T=S.targets;
  const sp=[{label:'Needs',v:a.needs,color:'var(--blue)',note:a.income>0?'target '+T.needs+'% of income':''},{label:'Wants',v:a.wants,color:'var(--teal)',note:a.income>0?'target '+T.wants+'% of income':''}];
  if(other>Math.max(1,a.income*.01))sp.push({label:'Other spending',v:other,color:'var(--muted)'});
  sp.push({label:'Savings',v:saved,color:'var(--violet)',note:a.income>0?'target '+T.save+'% of income':''});
  const deficit=a.surplus<0?`<p class="footnote" style="margin-top:10px">Spending was ${esc(S.cur)} ${fmt(-a.surplus)} more than income, so there is no saving to show. Shares are of total spending.</p>`:`<p class="footnote" style="margin-top:10px">Shares of income. Needs, wants and savings add up to 100%.</p>`;
  const kind=r=>r.type==='SECURITY'||r.type==='INVESTMENT'?'Investments':isCash(r)?'Cash and bank':null;
  const al={};for(const r of b.rows){if(r.group!=='Asset'||!(r.value>0.005))continue;const k=kind(r)||(r.type==='ASSET'?'Other assets':String(r.type||'Other').charAt(0)+String(r.type||'other').slice(1).toLowerCase());al[k]=(al[k]||0)+r.value}
  const pal=['var(--blue)','var(--teal)','var(--violet)','var(--muted)','#c9892b','#b4506b'],order=['Cash and bank','Investments'];
  const keys=Object.keys(al).sort((x,y)=>(order.indexOf(x)<0?9:order.indexOf(x))-(order.indexOf(y)<0?9:order.indexOf(y))||al[y]-al[x]);
  const asl=keys.map((k,i)=>({label:k,v:al[k],color:pal[i%pal.length]}));
  return`<div class="pies"><section class="card" data-blk="spend"><div class="head"><div><h2>Needs, wants and savings</h2><p class="sub">Where income went · ${esc(periodLabel())}</p></div></div>${a.expense>0||a.income>0?pieHTML(a.surplus<0?sp.map(x=>x.label==='Savings'?{...x,v:0}:x):sp,'Needs, wants and savings'):'<div class="empty" style="padding:24px 0">No activity in this period.</div>'}${deficit}</section>
  <section class="card" data-blk="assets"><div class="head"><div><h2>Asset allocation</h2><p class="sub">What you own · as of ${esc(fdate(b.asOf))}</p></div></div>${pieHTML(asl,'Asset allocation')}<p class="footnote" style="margin-top:10px">Total assets ${esc(S.cur)} ${fmt(b.assets)}. Liabilities are not included.</p></section></div>`;
}

/* ---- Overview layout: drag, resize and reorder the cards ---- */
const OV_DEFAULT=[['hero',2],['kpis',2],['health',2],['spend',1],['assets',1],['flow',1],['went',1],['att',1],['coming',1]];
const OV_NAMES={hero:'Net worth and chart',kpis:'Income, spending and savings rate',health:'Financial health',spend:'Needs, wants and savings',assets:'Asset allocation',flow:'Income and spending chart',went:'Where the income went',att:'Needs attention',coming:'Coming up'};
function ovLayout(avail){
  const saved=(S.layout&&Array.isArray(S.layout.ov)?S.layout.ov:[]).filter(x=>x&&OV_NAMES[x.id]),out=[],seen=new Set();
  for(const x of saved)if(avail.includes(x.id)&&!seen.has(x.id)){seen.add(x.id);out.push({id:x.id,w:x.w===2?2:1})}
  for(const[id,w]of OV_DEFAULT)if(avail.includes(id)&&!seen.has(id)){seen.add(id);out.push({id,w})}
  return out;
}
function ovSave(order){
  const all=(S.layout&&Array.isArray(S.layout.ov)?S.layout.ov:[]).filter(x=>!order.some(o=>o.id===x.id));
  S.layout={ov:[...order,...all]};store.set();
}
function arrangeOverview(){
  const view=$('view'),els=[...view.querySelectorAll('[data-blk]')];if(!els.length)return;
  const avail=els.map(x=>x.dataset.blk),order=ovLayout(avail),byId={};els.forEach(x=>byId[x.dataset.blk]=x);
  const arranging=!!S.arr;
  const bar=document.createElement('div');bar.className='arrbar';
  bar.innerHTML=arranging?`<span class="hint">Drag the blue handle to move a card, or use the arrows. “Half” and “Full” set its width on wide screens.</span><button class="btn small" id="arr-reset">Reset</button><button class="btn small primary" id="arr-done">Done</button>`:`<button class="btn small" id="arr-btn" title="Move and resize the cards on this page">Arrange layout</button>`;
  const grid=document.createElement('div');grid.className='ovgrid'+(arranging?' arranging':'');grid.id='ovgrid';
  for(const o of order){
    const w=document.createElement('div');w.className='blk w'+o.w;w.dataset.id=o.id;w.appendChild(byId[o.id]);
    if(arranging){
      const t=document.createElement('div');t.className='arrtools';
      t.innerHTML=`<button class="grab" aria-label="Move ${esc(OV_NAMES[o.id])}. Drag, or press the arrow keys." title="Drag to move">⠿ Move</button><button data-up aria-label="Move ${esc(OV_NAMES[o.id])} up" title="Move up">↑</button><button data-dn aria-label="Move ${esc(OV_NAMES[o.id])} down" title="Move down">↓</button><button class="wtog" data-w aria-label="Make ${esc(OV_NAMES[o.id])} ${o.w===2?'half':'full'} width">${o.w===2?'Half':'Full'}</button>`;
      w.prepend(t);
    }
    grid.appendChild(w);
  }
  /* remove the old wrappers and place the new grid */
  [...view.children].forEach(c=>c.remove());view.appendChild(bar);view.appendChild(grid);
  const cur=()=>[...grid.children].map(b=>({id:b.dataset.id,w:b.classList.contains('w2')?2:1}));
  const redo=()=>{ovSave(cur());render()};
  if(!arranging){$('arr-btn').onclick=()=>{S.arr=true;render()};return}
  $('arr-done').onclick=()=>{S.arr=false;render()};
  $('arr-reset').onclick=()=>{S.layout={...(S.layout||{}),ov:[]};store.set();render()};
  grid.querySelectorAll('.blk').forEach(b=>{
    const t=b.querySelector('.arrtools'),grab=t.querySelector('.grab');
    t.querySelector('[data-w]').onclick=()=>{b.classList.toggle('w2');redo()};
    t.querySelector('[data-up]').onclick=()=>{const p=b.previousElementSibling;if(p){grid.insertBefore(b,p);redo()}};
    t.querySelector('[data-dn]').onclick=()=>{const n=b.nextElementSibling;if(n){grid.insertBefore(n,b);redo()}};
    grab.onkeydown=ev=>{if(ev.key==='ArrowUp'||ev.key==='ArrowLeft'){ev.preventDefault();const p=b.previousElementSibling;if(p){grid.insertBefore(b,p);ovSave(cur());render();setTimeout(()=>{const g=$('ovgrid')&&$('ovgrid').querySelector('[data-id="'+b.dataset.id+'"] .grab');g&&g.focus()},30)}}
      if(ev.key==='ArrowDown'||ev.key==='ArrowRight'){ev.preventDefault();const n=b.nextElementSibling;if(n){grid.insertBefore(n,b);ovSave(cur());render();setTimeout(()=>{const g=$('ovgrid')&&$('ovgrid').querySelector('[data-id="'+b.dataset.id+'"] .grab');g&&g.focus()},30)}}};
    let drag=false,px=0,py=0,raf=0;
    const tick=()=>{if(!drag)return;if(py<80)window.scrollBy(0,-16);else if(py>window.innerHeight-80)window.scrollBy(0,16);raf=requestAnimationFrame(tick)};
    const over=()=>{
      const one=getComputedStyle(grid).gridTemplateColumns.split(' ').length<2;
      const hit=[...grid.children].filter(x=>x!==b).find(x=>{const r=x.getBoundingClientRect();return px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom});
      if(!hit)return;const r=hit.getBoundingClientRect(),wide=one||hit.classList.contains('w2')||b.classList.contains('w2');
      const after=wide?py>r.top+r.height/2:px>r.left+r.width/2;
      const ref=after?hit.nextElementSibling:hit;if(ref!==b&&(after?hit.nextElementSibling!==b:hit.previousElementSibling!==b))grid.insertBefore(b,ref);
    };
    grab.onpointerdown=ev=>{if(ev.button>0)return;ev.preventDefault();try{grab.setPointerCapture(ev.pointerId)}catch(e){}drag=true;px=ev.clientX;py=ev.clientY;b.classList.add('drag');raf=requestAnimationFrame(tick)};
    grab.onpointermove=ev=>{if(!drag)return;px=ev.clientX;py=ev.clientY;over()};
    const end=()=>{if(!drag)return;drag=false;cancelAnimationFrame(raf);b.classList.remove('drag');ovSave(cur());render()};
    grab.onpointerup=end;grab.onpointercancel=end;
  });
}
function overviewRatios(){
  const[s,e]=range(),rs=ratioSet(s,e),sm=ratioSummary(rs),pick=['al','ie','sr','cm','da'].map(k=>rs.list.find(r=>r.k===k)).filter(Boolean);
  const tone=r=>r.band==='good'?'good':r.band==='watch'?'warn':r.band==='risk'?'bad':'';
  return`<section class="card" data-blk="health"><div class="head"><div><h2>Financial health</h2><p class="sub">${sm.g} healthy · ${sm.w} watch · ${sm.k} at risk, of ${sm.n} ratios</p></div><button class="btn small" data-ratios="1">All ratios</button></div><div class="rmini">${pick.map(r=>`<button class="${tone(r)}" data-ratios="1" aria-label="${esc(r.name)} ${r.f(r.v)}"><small>${esc(r.name)}</small><strong>${r.f(r.v)}</strong>${pill(r.band==='good'?'Healthy':r.band==='watch'?'Watch':r.band==='risk'?'Risk':'Info',tone(r))}</button>`).join('')}</div></section>`;
}
function vOverview(){
  const d=S.data,ix=S.ix,[s,e]=range(),ee=e>ix.latest?ix.latest:e;
  const b=balances(d,e,ix),b0=balances(d,addDays(s,-1),ix),a=actual(d,s,e,ix),pr=prevRange(s,e),pa=pr?actual(d,pr[0],pr[1],ix):null;
  const nwd=b.networth-b0.networth,upTo=monthStart(ee);
  const ya=S.per.mode==='all'?null:[shiftYear(s,-1),shiftYear(ee,-1)],yaA=ya&&ya[1]>=ix.earliest?actual(d,ya[0],ya[1],ix):null;
  const bl=baseline(s),f=pace(s,e);
  const cmp=(c,pv,yv,inv,avgv)=>{
    const lines=[pa?change(c,pv,inv)+' '+prevText(e):'',yaA?change(c,yv,inv)+' vs last year':''].filter(x=>x.replace(/<[^>]+>/g,'').trim());
    return(bl&&avgv!=null?`<div class="chips">${vchip(c-avgv*f,inv,'avg')}</div>`:'')+lines.map(x=>`<div class="cmp">${x}</div>`).join('')||'Selected period';
  };
  const series=ix.nw.filter(r=>r.month<=upTo).slice(-24).map(r=>({month:r.month,v:r.net}));
  S.charts.nw={type:'line',points:series,label:'Net worth by month',h:window.innerWidth<600?170:200,rest:'Touch or hover the chart to read a month.'};
  const months=[];for(let m=addMonths(upTo,-8);m<=upTo;m=addMonths(m,1)){
    if(endMonth(m)<ix.earliest){continue}
    const v=actual(d,m,endMonth(m),ix);months.push({month:m,income:v.income,expense:v.expense});
  }
  S.charts.ie={type:'bar',rows:months,series:[{key:'income',label:'Income',cls:'f-blue',color:'blue'},{key:'expense',label:'Spending',cls:'f-teal',color:'teal'}],click:true,label:'Income and spending by month',h:230,tip:r=>fmonLong(r.month)+'\nIncome '+fmt(r.income)+'\nSpending '+fmt(r.expense)+'\nSaved '+fmt(r.income-r.expense)};
  const T=S.targets,inc=a.income;
  const other=a.expense-a.needs-a.wants,rows=[];
  if(a.needs>0||a.wants>0){rows.push(['Needs',a.needs,T.needs,'var(--blue)']);rows.push(['Wants',a.wants,T.wants,'var(--teal)']);if(other>Math.max(1,inc*.01))rows.push(['Other spending',other,null,'var(--muted)'])}
  else rows.push(['Spending',a.expense,null,'var(--teal)']);
  rows.push(['Saved',a.surplus,T.save,'var(--violet)']);
  const share=rows.map(([n,v,t,c])=>{
    const w=inc>0?Math.max(0,Math.min(100,v/inc*100)):0,sh=inc>0?v/inc*100:null,dv=t!=null&&sh!==null?sh-t:null,goodHigher=n==='Saved',flat=dv!==null&&Math.abs(dv)<.05,good=dv!==null&&(goodHigher?dv>0:dv<0);
    const tchip=dv===null?'':`<span class="vchip ${flat?'flat':good?'good':'bad'}">${flat?'•':dv>0?'▲':'▼'} ${flat?'On target':Math.abs(dv).toFixed(1)+' pts '+(dv>0?'over':'under')+' target'}</span>`;
    return`<div class="share-row"><span>${n}</span><div class="track"><b style="width:${w}%;background:${c}"></b>${t!=null?`<i class="tick" style="left:${Math.min(100,t)}%" title="Target ${t}%"></i>`:''}</div><span class="num ${dv===null||flat?'':good?'pos':'neg'}">${inc>0?pct(v/inc):'—'}</span></div><p class="share-note">${S.cur} ${fmt(v)}${t!=null?' · target '+t+'%':''} ${tchip}</p>`}).join('');
  const cats={};for(const l of a.exLines){const k=catName(l);cats[k]=(cats[k]||0)+l.value}
  const top=Object.entries(cats).sort((x,y)=>y[1]-x[1]).slice(0,5);
  const hasData=ix.good.length>0,noPeriod=e<ix.earliest;
  const nwDelta=noPeriod?'':`<span class="${nwd>=0?'up':'down'}">${nwd>=0?'▲':'▼'} ${S.cur} ${fmt(Math.abs(nwd))}</span> since ${fdate(addDays(s,-1))}`;
  $('view').innerHTML=`
  <section class="hero" data-blk="hero" aria-labelledby="hero-l">
    <div class="hero-top">
      <div><div class="eyebrow" id="hero-l">Net worth · ${fdate(b.asOf)}</div><div class="big"><small>${esc(S.cur)}</small>${fmt(b.networth)}</div><div class="delta">${nwDelta}</div></div>
      <div class="hero-stats"><div>Assets<strong>${fmt(b.assets)}</strong></div><div>Liabilities<strong>${fmt(b.debt)}</strong></div><div>Cash and bank<strong>${fmt(b.cash)}</strong></div><div>Investments<strong>${fmt(b.investments)}</strong></div></div>
    </div>
    <div class="chart" data-chart="nw"></div><div class="readout" id="nw-read">Touch or hover the chart to read a month.</div>
  </section>
  <div data-blk="kpis"><div class="kpis">
    ${kpi('Income',noPeriod?'—':fmt(a.income),cmp(a.income,pa&&pa.income,yaA&&yaA.income,false,bl&&bl.income),spark(months.map(m=>m.income),'blue'))}
    ${kpi('Spending',noPeriod?'—':fmt(a.expense),cmp(a.expense,pa&&pa.expense,yaA&&yaA.expense,true,bl&&bl.expense),spark(months.map(m=>m.expense),'teal'))}
    ${kpi('Savings rate',noPeriod?'—':pct(a.savingsRate),`${S.cur} ${fmt(a.surplus)} left after spending`+(bl&&!noPeriod?`<div class="chips">${vchip(a.surplus-(bl.income-bl.expense)*f,false,'avg')}${ptsChip(a.savingsRate,bl)}</div>`:''),spark(months.map(m=>m.income>0?(m.income-m.expense)/m.income:NaN),'violet'))}
  </div>
  ${noPeriod?'':vlegend(bl)}</div>
  ${noPeriod?'':overviewRatios()}
  ${noPeriod?'':overviewPies()}
  <div class="grid two">
    <section class="card" data-blk="flow"><div class="head"><div><h2>Income and spending</h2><p class="sub">${esc(S.cur)} · nine months ending ${fmon(upTo)}. Select a month to open it.</p></div>${legend([{label:'Income',cls:'f-blue',color:'blue'},{label:'Spending',cls:'f-teal',color:'teal'}])}</div><div class="chart" data-chart="ie"></div></section>
    <section class="card" data-blk="went"><div class="head"><div><h2>Where the income went</h2><p class="sub">Share of income · ${esc(periodLabel())}</p></div></div>${hasData&&!noPeriod?share:'<div class="empty">No activity in this period.</div>'}
    ${top.length?`<h3 style="margin-top:22px">Biggest categories</h3><div class="list">${top.map(([n,v])=>`<button class="row" data-cat="${esc(n)}"><span class="t">${esc(n)}</span><span class="amt">${fmt(v)}</span></button>`).join('')}</div>`:''}</section>
  </div>`;
  document.querySelectorAll('[data-ratios]').forEach(el=>el.onclick=()=>{S.page='reports';S.report='ratios';S.anim=true;render();window.scrollTo(0,0)});
  document.querySelectorAll('[data-cat]').forEach(el=>el.onclick=()=>{S.page='spending';render()});
  if(!noPeriod){
    const att=attention(),o=outlook(),coming=o.up30.slice(0,5);
    $('view').insertAdjacentHTML('beforeend',`<div class="grid even">
     <section class="card" data-blk="att"><div class="head"><h2>Needs attention</h2></div>${att.length?att.map((i,n)=>`<button class="row" data-att="${n}"><div><span class="t">${esc(i.t)}</span></div><div class="amt">${pill(i.k==='bad'?'Fix':i.k==='warn'?'Check':'Note',i.k==='bad'?'bad':i.k==='warn'?'warn':'')}</div></button>`).join(''):'<div class="empty" style="padding:24px 0">Nothing needs attention right now.</div>'}</section>
     <section class="card" data-blk="coming"><div class="head"><div><h2>Coming up</h2><p class="sub">Safe to spend ${esc(S.cur)} ${fmt(o.safe)} after the next 30 days of repeating payments.</p></div><button class="btn small" data-go="plan">Open plan</button></div>${coming.map(u=>`<div class="row"><div><span class="t">${esc(u.desc||'(no description)')}</span><small>${esc(fdate(u.date))}</small></div><div class="amt ${u.amt>0?'pos':'neg'}">${u.amt>0?'+':''}${fmt(u.amt)}</div></div>`).join('')||'<div class="empty" style="padding:24px 0">No repeating payments detected yet.</div>'}</section></div>`);
    document.querySelectorAll('[data-att]').forEach(el=>el.onclick=()=>{const i=att[+el.dataset.att];if(i.act==='import'){$('file').click();return}S.page=i.go;if(i.tab)S.ptab=i.tab;if(i.report)S.report=i.report;S.anim=true;render()});
    document.querySelectorAll('#view [data-go]').forEach(el=>el.onclick=()=>{S.page=el.dataset.go;render();window.scrollTo(0,0)});
  }
  arrangeOverview();
}

function vSpending(){
  const d=S.data,ix=S.ix,[s,e]=range(),a=actual(d,s,e,ix),pr=prevRange(s,e),pa=pr?actual(d,pr[0],pr[1],ix):null;
  if(e<ix.earliest){$('view').innerHTML='<div class="card empty">No data covers this period. Your history starts '+fdate(ix.earliest)+'.</div>';return}
  const tree={};
  const add=(t,l)=>{
    const m=l.main||'Uncategorised',lv=l.level2||l.label,lb=l.label;
    const M=(t[m]??={v:0,kids:{}});M.v+=l.value;const K=(M.kids[lv]??={v:0,leaves:{},codes:{}});K.v+=l.value;K.leaves[lb]=(K.leaves[lb]||0)+l.value;if(l.code)K.codes[lb]=l.code;
  };
  for(const l of a.exLines)add(tree,l);
  const ptree={};if(pa)for(const l of pa.exLines)add(ptree,l);
  const total=a.expense,mains=Object.entries(tree).sort((x,y)=>y[1].v-x[1].v);
  const days=daysBetween(s,e>ix.latest?ix.latest:e);
  const bl=baseline(s),f=pace(s,e);
  const prevChg=(cur,prev)=>prev?change(cur,prev,true):'';
  const bar=(v,c)=>`<div class="track"><b style="width:${total>0?Math.max(0,Math.min(100,v/total*100)):0}%;background:${c}"></b></div>`;
  const cols=['var(--blue)','var(--teal)','var(--violet)','var(--amber)','var(--red)'];
  const body=mains.map(([mn,M],mi)=>{
    const c=cols[mi%cols.length],pm=ptree[mn];
    const kids=Object.entries(M.kids).sort((x,y)=>y[1].v-x[1].v).map(([kn,K])=>{
      const leaves=Object.entries(K.leaves).sort((x,y)=>y[1]-x[1]),single=leaves.length===1&&leaves[0][0]===kn;
      const share=`<span class="bar-cell">${bar(K.v,c)}</span>`;
      const pk=pm&&pm.kids[kn]?prevChg(K.v,pm.kids[kn].v):'';
      const amt=`<span class="amt">${fmt(K.v)}${bl?`<small>${vchip(K.v-(bl.byKey[mn+'|'+kn]||0)*f,true,'avg')}</small>`:''}<small>${pct(total>0?K.v/total:null)} of total</small>${pk?`<small>${pk} vs prev</small>`:''}</span>`;
      if(single)return`<div class="cat"><div class="leaf" role="button" tabindex="0" data-lines="${esc(mn+'|'+kn+'|'+kn)}"><span class="name">${K.codes[kn]?`<span class="code">${esc(K.codes[kn])}</span>`:''}${esc(kn)}</span>${share}${amt}</div></div>`;
      return`<details class="cat"><summary><span class="name">${esc(kn)}</span>${share}${amt}</summary><div class="kids">${leaves.map(([ln,lv])=>`<div class="leaf" role="button" tabindex="0" data-lines="${esc(mn+'|'+kn+'|'+ln)}"><span class="name">${K.codes[ln]?`<span class="code">${esc(K.codes[ln])}</span>`:''}${esc(ln)}</span><span class="amt">${fmt(lv)}</span></div>`).join('')}</div></details>`;
    }).join('');
    return`<div class="section-h"><span>${esc(mn)}</span><span>${S.cur} ${fmt(M.v)} <span class="muted" style="font-weight:400">· ${pct(total>0?M.v/total:null)}</span> ${bl?vchip(M.v-(bl.byMain[mn]||0)*f,true,'avg'):''}</span></div>${kids}`;
  }).join('');
  $('view').innerHTML=`
  <div class="kpis four">
    ${kpi('Total spending',fmt(total),(bl?`<div class="chips">${vchip(total-bl.expense*f,true,'avg')}</div>`:'')+(pa?`<div class="cmp">${prevChg(total,pa.expense)} ${prevText(e)}</div>`:(bl?'':'Selected period')))}
    ${kpi('Needs',a.needs||a.wants?fmt(a.needs):'—',(bl&&(a.needs||a.wants)?`<div class="chips">${vchip(a.needs-bl.needs*f,true,'avg')}</div>`:'')+(a.income>0&&(a.needs||a.wants)?`<div class="cmp">${pct(a.needs/a.income)} of income</div>`:''))}
    ${kpi('Wants',a.needs||a.wants?fmt(a.wants):'—',(bl&&(a.needs||a.wants)?`<div class="chips">${vchip(a.wants-bl.wants*f,true,'avg')}</div>`:'')+(a.income>0&&(a.needs||a.wants)?`<div class="cmp">${pct(a.wants/a.income)} of income</div>`:''))}
    ${kpi('Per day',fmt(total/Math.max(1,days)),days+' days counted')}
  </div>
  <section class="card block"><div class="head"><div><h2>Spending by category</h2><p class="sub">${esc(S.cur)} · ${esc(periodLabel())}. Select a category to see its transactions. Under each amount: how far it is above or below your average, then its share of the total and the change vs ${S.per.mode==="month"&&e>ix.latest?"the same days last month":"the previous period"}.</p></div></div>${vlegend(bl)}${mains.length?body:'<div class="empty">No spending recorded in this period.</div>'}</section>${donutCard(a)}${payeesCard(a)}`;
  document.querySelectorAll('[data-payee]').forEach(el=>el.onclick=()=>{S.q=el.dataset.payee;S.type='expense';S.acct='';S.pg=0;S.anim=true;S.page='activity';render()});
  document.querySelectorAll('[data-lines]').forEach(el=>{
    const run=()=>{const[mn,kn,ln]=el.dataset.lines.split('|');openLines(mn,kn,ln)};
    el.onclick=run;el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();run()}};
  });
}
function showLines(title,ls){
  const tot=sum(ls,l=>l.value);
  modal(title,`<p class="sub">${ls.length} transactions · total ${S.cur} ${fmt(tot,2)}</p><div class="list">${ls.slice(0,300).map(l=>`<div class="row"><div><span class="t">${esc(l.description||'(no description)')}</span><small>${esc(fdate(l.date))}</small></div><div class="amt">${fmt(l.value,2)}</div></div>`).join('')}</div>${ls.length>300?'<p class="footnote">Showing the latest 300.</p>':''}`);
}

function vAccounts(){
  const d=S.data,ix=S.ix,[,e]=range(),b=balances(d,e,ix),q=S.aq.toLowerCase();
  const rows=b.rows.filter(a=>(a.group==='Asset'||a.group==='Liability')&&(Math.abs(a.native)>1e-6||a.type==='BANK')&&(!q||a.name.toLowerCase().includes(q)));
  const secs=[['Cash and bank',r=>isCash(r),1],['Investments',r=>r.type==='SECURITY'||r.type==='INVESTMENT',1],['Other assets',r=>r.group==='Asset'&&!isCash(r)&&r.type!=='SECURITY'&&r.type!=='INVESTMENT',1],['Credit cards',r=>r.type==='CREDIT CARD',-1],['Loans and other liabilities',r=>r.group==='Liability'&&r.type!=='CREDIT CARD',-1]];
  const html=secs.map(([name,f,sg])=>{
    const rs=rows.filter(f).sort((x,y)=>Math.abs(y.value||0)-Math.abs(x.value||0));if(!rs.length)return'';
    return`<div class="section-h"><span>${name}</span><span>${S.cur} ${fmt(sg*sum(rs,r=>r.value||0))}</span></div>`+rs.map(r=>{
      const nat=sg*r.native,native=natf(nat,0,r.type==='SECURITY'?4:2);
      return`<button class="row" data-account="${esc(r.id)}"><div><span class="t">${r.code?`<span class="code">${esc(r.code)}</span>`:''}${esc(r.label)}</span><small>${esc([r.main,r.level2].filter((x,i,a)=>x&&x!==r.label&&a.indexOf(x)===i).join(' › ')||r.type)}${r.currency!==S.cur?' · '+native+' '+esc(r.currency):''}</small></div><div class="amt">${r.value===null?'No rate':fmt(sg*r.value,2)}</div></button>`;
    }).join('');
  }).join('');
  $('view').innerHTML=`<div class="kpis four">${kpi('Total assets',fmt(b.assets),'Cash, investments and other')}${kpi('Total liabilities',fmt(b.debt),'Cards, loans and payables')}${kpi('Cash and bank',fmt(b.cash),'Readily available')}${kpi('Net worth',fmt(b.networth),'As of '+fdate(b.asOf))}</div>
  ${exposureCard(b)}
  <section class="card block"><div class="head"><div><h2>Account balances</h2><p class="sub">${esc(S.cur)} · as of ${fdate(b.asOf)}. Select an account to see its activity.</p></div></div><div class="toolbar"><input class="search" id="a-search" type="search" placeholder="Search accounts" aria-label="Search accounts" value="${esc(S.aq)}"></div><div id="a-list">${html||'<div class="empty">No accounts match.</div>'}</div><p class="footnote">Securities use the prices saved in the export, and past dates use those same prices and exchange rates, so history shows what your holdings would be worth today rather than past market values.${b.missing?` ${b.missing} account(s) have no exchange rate and are left out of totals.`:''}</p></section>`;
  const bindRows=()=>document.querySelectorAll('[data-account]').forEach(el=>el.onclick=()=>{S.acct=el.dataset.account;S.q='';S.type='all';S.pg=0;S.page='activity';render()});
  bindRows();
  $('a-search').oninput=ev=>{S.aq=ev.target.value;const pos=ev.target.selectionStart;vAccounts();const i=$('a-search');i.focus();i.setSelectionRange(pos,pos)};
}

function stmt(rows,dec=2){
  const ex=rows.some(r=>r[3]);
  const head=ex?'<thead><tr><th></th><th class="hc">Amount</th><th class="hc">Against average</th></tr></thead>':'';
  return`<table class="stmt">${head}<tbody>${rows.map(([n,v,c,x,,dr])=>v===null?`<tr class="st-${c||'row'}"><th colspan="${ex?3:2}" scope="colgroup">${esc(n)}</th></tr>`:`<tr class="st-${c||'row'}${dr?' drill':''}" ${dr?`data-drill="${esc(dr)}" tabindex="0" role="button"`:''}><th scope="row">${esc(n)}</th><td>${typeof v==='string'?esc(v):fmt(v,dec)}</td>${ex?`<td class="vc">${chipHTML(x)}</td>`:''}</tr>`).join('')}</tbody></table>`;
}

/* ============================================================
   Financial ratios: balance-sheet strength and income health
   ============================================================ */
function ratioSet(s,e){
  const d=S.data,ix=S.ix,b=balances(d,e,ix),a=actual(d,s,e,ix),bl=baseline(s),pr=prevRange(s,e),pa=pr?actual(d,pr[0],pr[1],ix):null;
  const b0=balances(d,addDays(s,-1),ix),T=S.targets;
  const months=Math.max(.2,daysBetween(s,e>ix.latest?ix.latest:e)/30.4375);
  const mSpend=bl&&bl.expense>0?bl.expense:(a.expense/months),mInc=a.income/months;
  let debtPay=0;try{for(const l of loanList()){const c=S.plan.loans[l.id]||{},p=c.payment!=null&&c.payment!==''?+c.payment:l.detected;debtPay+=(p||0)*(fxAt(d,l.cur,ix.latest)||1)}}catch(x){}
  const safe=(n,m)=>m>0.0001?n/m:null;
  const fl=(inc,exp,needs,wants,spendM,incM)=>({ie:safe(inc,exp),sr:inc>0?(inc-exp)/inc:null,ni:safe(needs,inc),wi:safe(wants,inc),di:safe(debtPay,incM)});
  const cur=fl(a.income,a.expense,a.needs,a.wants,mSpend,mInc);
  const prv=pa?fl(pa.income,pa.expense,pa.needs,pa.wants):null;
  const avg=bl?fl(bl.income,bl.expense,bl.needs,bl.wants,0,bl.income):null;
  const bal=(x)=>({al:safe(x.assets,x.debt),da:safe(x.debt,x.assets),cc:x.cards>0.5?safe(x.cash,x.cards):null,cm:safe(x.cash,mSpend),ia:safe(x.investments,x.assets)});
  const B=bal(b),B0=bal(b0);
  const R=[];
  const add=(o)=>R.push(o);
  const times=v=>v===null?'—':v.toFixed(2)+'×',pc=v=>v===null?'—':(v*100).toFixed(1)+'%',mo=v=>v===null?'—':v.toFixed(1)+' months';
  /* band(value) -> good|watch|risk; thresholds are shown on the card */
  const hi=(g,w)=>v=>v===null?null:v>=g?'good':v>=w?'watch':'risk';
  const lo=(g,w)=>v=>v===null?null:v<=g?'good':v<=w?'watch':'risk';
  add({k:'al',grp:'Balance sheet',name:'Assets to liabilities',v:B.al,prev:B0.al,f:times,band:hi(1.5,1)(B.al),hb:true,scale:[0,2.5],t:[1,1.5],rule:'Healthy 1.5× or more · watch 1.0–1.5× · risk below 1.0×',what:'For every 1 you owe, how much you own. Below 1.0× means you owe more than you own.',pvLabel:'since start of period'});
  add({k:'da',grp:'Balance sheet',name:'Debt to assets',v:B.da,prev:B0.da,f:pc,band:lo(.4,1)(B.da),hb:false,scale:[0,2],t:[.4,1],rule:'Healthy up to 40% · watch 40–100% · risk above 100%',what:'Share of everything you own that is financed by debt. Above 100% means net worth is negative.',pvLabel:'since start of period'});
  add({k:'cc',grp:'Balance sheet',name:'Cash to credit-card balance',v:B.cc,prev:B0.cc,f:times,band:hi(1,.5)(B.cc),hb:true,scale:[0,2],t:[.5,1],rule:'Healthy 1.0× or more · watch 0.5–1.0× · risk below 0.5×',what:'Could your cash and bank balances clear the cards today? Card interest is usually your costliest debt.',pvLabel:'since start of period',skip:B.cc===null});
  add({k:'cm',grp:'Balance sheet',name:'Cash runway',v:B.cm,prev:B0.cm,f:mo,band:hi(6,3)(B.cm),hb:true,scale:[0,9],t:[3,6],rule:'Healthy 6+ months · watch 3–6 · risk below 3',what:'How many months your cash and bank balances would cover at your recent monthly spending.',pvLabel:'since start of period'});
  add({k:'ia',grp:'Balance sheet',name:'Investments share of assets',v:B.ia,prev:B0.ia,f:pc,band:null,hb:true,scale:[0,1],t:[.15,.3],rule:'No pass or fail. A higher share means more of your wealth can grow.',what:'How much of what you own is invested rather than sitting in cash, property or other assets.',pvLabel:'since start of period'});
  add({k:'ie',grp:'Income and spending',name:'Income to spending',v:cur.ie,prev:prv&&prv.ie,avg:avg&&avg.ie,f:times,band:hi(1.2,1)(cur.ie),hb:true,scale:[0,2],t:[1,1.2],rule:'Healthy 1.2× or more · watch 1.0–1.2× · risk below 1.0×',what:'For every 1 you spend, how much comes in. Below 1.0× means you spent more than you earned.'});
  add({k:'sr',grp:'Income and spending',name:'Savings rate',v:cur.sr,prev:prv&&prv.sr,avg:avg&&avg.sr,f:pc,band:hi(T.save/100,T.save/200)(cur.sr),hb:true,scale:[-.2,.4],t:[T.save/200,T.save/100],rule:`Healthy ${T.save}% or more (your target) · watch ${T.save/2}–${T.save}% · risk below`,what:'Share of income left after spending.'});
  add({k:'ni',grp:'Income and spending',name:'Needs to income',v:cur.ni,prev:prv&&prv.ni,avg:avg&&avg.ni,f:pc,band:lo(T.needs/100,T.needs/100+.1)(cur.ni),hb:false,scale:[0,1.2],t:[T.needs/100,T.needs/100+.1],rule:`Healthy up to ${T.needs}% (your target) · watch up to ${T.needs+10}% · risk above`,what:'Share of income taken by essentials such as rent, bills, groceries and loan costs.'});
  add({k:'wi',grp:'Income and spending',name:'Wants to income',v:cur.wi,prev:prv&&prv.wi,avg:avg&&avg.wi,f:pc,band:lo(T.wants/100,T.wants/100+.1)(cur.wi),hb:false,scale:[0,1],t:[T.wants/100,T.wants/100+.1],rule:`Healthy up to ${T.wants}% (your target) · watch up to ${T.wants+10}% · risk above`,what:'Share of income going to choices rather than essentials.'});
  add({k:'di',grp:'Income and spending',name:'Debt payments to income',v:cur.di,prev:null,f:pc,band:lo(.2,.36)(cur.di),hb:false,scale:[0,.8],t:[.2,.36],rule:'Healthy up to 20% · watch 20–36% · risk above 36%',what:'Monthly loan payments (from your Debt plan) compared with monthly income.',skip:!(debtPay>0)});
  return{list:R.filter(r=>!r.skip),b,a,asOf:b.asOf,months,debtPay,hasIncome:a.income>0};
}
function ratioChip(r,kind){
  const base=kind==='avg'?r.avg:r.prev;if(base===null||base===undefined||r.v===null)return'';
  const diff=r.v-base,flat=Math.abs(diff)<(r.k==='al'||r.k==='cc'||r.k==='ie'?.005:r.k==='cm'?.05:.0005);
  const good=r.hb?diff>0:diff<0;
  let t;if(r.k==='al'||r.k==='cc'||r.k==='ie')t=Math.abs(diff).toFixed(2)+'×';else if(r.k==='cm')t=Math.abs(diff).toFixed(1)+' mo';else t=(Math.abs(diff)*100).toFixed(1)+' pts';
  const lab=kind==='avg'?'avg':kind==='pv'?(r.pvLabel||'prev'):'prev';
  const word=kind==='avg'?(diff>0?' above avg':' below avg'):kind==='pv'?(diff>0?' higher '+lab:' lower '+lab):(diff>0?' higher than prev':' lower than prev');
  return`<span class="vchip ${flat?'flat':good?'good':'bad'}">${flat?'•':diff>0?'▲':'▼'} ${flat?(kind==='avg'?'On average':'No change'):t+word}</span>`;
}
function ratioCard(r){
  const tone=r.band==='good'?'good':r.band==='watch'?'warn':r.band==='risk'?'bad':'';
  const word=r.band==='good'?'Healthy':r.band==='watch'?'Watch':r.band==='risk'?'Risk':'Info';
  const [lo,hi]=r.scale,pos=v=>Math.max(0,Math.min(100,(v-lo)/(hi-lo)*100)),t1=pos(r.t[0]),t2=pos(r.t[1]);
  const c=(r.hb?['var(--bad-fg)','var(--warn-fg)','var(--good-fg)']:['var(--good-fg)','var(--warn-fg)','var(--bad-fg)']);
  const seg=r.band===null?'<b style="left:0;width:100%;background:var(--line)"></b>':`<b style="left:0;width:${t1}%;background:${c[0]}"></b><b style="left:${t1}%;width:${t2-t1}%;background:${c[1]}"></b><b style="left:${t2}%;width:${100-t2}%;background:${c[2]}"></b>`;
  const mk=r.v===null?'':`<i class="rmark" style="left:${pos(r.v)}%"></i>`;
  const chips=[r.prev!==undefined&&r.prev!==null&&r.pvLabel?ratioChip(r,'pv'):'',r.prev!==undefined&&r.prev!==null&&!r.pvLabel?ratioChip(r,'prev'):'',r.avg!==undefined&&r.avg!==null?ratioChip(r,'avg'):''].join('');
  return`<div class="card ratio ${tone}"><div class="rhead"><span class="rname">${esc(r.name)}</span>${pill(word,tone)}</div><strong class="rval">${r.f(r.v)}</strong><div class="rtrack" role="img" aria-label="${esc(r.name)} ${r.f(r.v)}, ${word}">${seg}${mk}</div><div class="chips">${chips}</div><p class="rwhat">${esc(r.what)}</p><p class="rrule">${esc(r.rule)}</p></div>`;
}
function ratioSummary(rs){
  const bands=rs.list.filter(r=>r.band),g=bands.filter(r=>r.band==='good').length,w=bands.filter(r=>r.band==='watch').length,k=bands.filter(r=>r.band==='risk').length;
  return{g,w,k,n:bands.length};
}
function vRatiosHTML(){
  const[s,e]=range(),rs=ratioSet(s,e),sm=ratioSummary(rs),grp=n=>rs.list.filter(r=>r.grp===n);
  const head=`<section class="card"><div class="head"><div><h2>Financial ratios</h2><p class="sub">Balance sheet as of ${esc(fdate(rs.asOf))} · income and spending for ${esc(periodLabel())}. Ratios are unitless, so they do not change with the currency you view.</p></div></div>
   <div class="rsum"><span class="pill good">${sm.g} healthy</span><span class="pill warn">${sm.w} watch</span><span class="pill bad">${sm.k} at risk</span><span class="muted"> of ${sm.n} rated</span></div>
   <p class="footnote" style="margin-top:8px">Bands are common rules of thumb, not advice. Your own targets for needs, wants and saving come from Settings.</p></section>`;
  const sec=(n,sub)=>`<h3 class="rgrp">${n}<small>${sub}</small></h3><div class="rgrid">${grp(n).map(ratioCard).join('')}</div>`;
  return head+sec('Balance sheet','How strong your position is today')+sec('Income and spending','How the selected period performed')+(rs.hasIncome?'':'<p class="footnote">There is no income in this period, so income-based ratios show a dash.</p>');
}

function reportModel(kind,s,e){
  if(kind==='ratios'){const rs=ratioSet(s,e),rows=[];for(const g of ['Balance sheet','Income and spending']){rows.push([g,null,'head']);for(const r of rs.list){if(r.grp!==g)continue;const bt=r.band==='good'?'good':r.band==='watch'?'flat':r.band==='risk'?'bad':'flat';rows.push([r.name,r.f(r.v)+(r.band?'  ·  '+(r.band==='good'?'Healthy':r.band==='watch'?'Watch':'Risk'):''),'row',r.band?{dir:'flat',tone:bt,text:r.rule,title:r.what}:null])}}return{title:'Financial ratios',sub:'Balance sheet as of '+fdate(rs.asOf)+' · income and spending for '+periodLabel(),rows,note:'Bands are common rules of thumb, not advice. Healthy, watch and risk limits are shown for each ratio in the app.'}}
  const d=S.data,ix=S.ix,b=balances(d,e,ix),a=actual(d,s,e,ix);
  if(kind==='position')return{title:'Balance sheet',sub:'As of '+fdate(b.asOf)+' · '+S.cur,rows:bsRows(b),
    note:'Net worth is assets minus liabilities, converted at the exchange rates and prices saved in your export. Select a line to see the accounts behind it.'};
  if(kind==='income'){
    const grp=(lines,neg)=>{const t={};for(const l of lines){const k=l.main||'Uncategorised';t[k]=(t[k]||0)+(neg?-l.value:l.value)}return Object.entries(t).sort((x,y)=>y[1]-x[1])};
    const inc=grp(a.incLines,true),bl=baseline(s),f=pace(s,e),V=(x,low)=>bl?vd(x,low,'avg'):null;
    const tree={};for(const l of a.exLines){const mn=l.main||'Uncategorised',kn=l.level2||l.label,M=(tree[mn]??={v:0,kids:{}});M.v+=l.value;M.kids[kn]=(M.kids[kn]||0)+l.value}
    const rk=n=>/^needs?$/i.test(n)?0:/^wants?$/i.test(n)?1:2,order=Object.keys(tree).sort((x,y)=>rk(x)-rk(y)||x.localeCompare(y));
    const expRows=order.flatMap(mn=>[[mn,null,'head'],...Object.entries(tree[mn].kids).sort((x,y)=>x[0].localeCompare(y[0])).map(([kn,v])=>[kn,v,'sub',V(v-(bl?(bl.byKey[mn+'|'+kn]||0)*f:0),true),'','exp|'+mn+'|'+kn]),['Total '+mn,tree[mn].v,'total',V(tree[mn].v-(bl?(bl.byMain[mn]||0)*f:0),true),'','exp|'+mn]]);
    return{title:'Income statement',sub:periodLabel()+' · '+S.cur,bl,rows:[
      ['Income',null,'head'],...inc.map(([n,v])=>[n,v,'sub',V(v-(bl?(bl.incMain[n]||0)*f:0),false),'','inc|'+n]),['Total income',a.income,'total',V(a.income-(bl?bl.income*f:0),false)],
      ...expRows,['Total spending',a.expense,'total',V(a.expense-(bl?bl.expense*f:0),true)],
      ['Surplus or deficit',a.surplus,'total',V(a.surplus-(bl?(bl.income-bl.expense)*f:0),false)],['Savings rate',pct(a.savingsRate),'check',ptsd(a.savingsRate,bl)]],
    note:'Transfers between accounts, investment purchases, loan principal and card payments are not counted as income or spending. Select a line to see the accounts behind it.'};
  }
  const cf=cashflow(d,s,e,ix);
  return{title:'Cash flow',sub:periodLabel()+' · cash and bank accounts · '+S.cur,rows:[
      ['Opening cash and bank',cf.opening,'head'],['Day-to-day income and spending',cf.operating,'sub'],['Investing (assets bought or sold)',cf.investing,'sub'],['Financing (loans and cards)',cf.financing,'sub'],['Currency moves between own accounts',cf.translation,'sub'],['Unclassified',cf.review,'sub'],
      ['Net change',cf.net,'total'],['Closing cash and bank',cf.closing,'total'],...(Math.abs(cf.difference)>.02?[['Exchange-rate and price effects',cf.difference,'check']]:[])],
    note:'The exchange-rate line appears when rates or prices change the value of foreign-currency balances between the two dates. You can enter your own monthly rates under Data.'};
}
function vReports(){
  const[s,e]=range(),tabs=[['position','Balance sheet'],['income','Income statement'],['cash','Cash flow'],['ratios','Ratios'],['close','Month-end close']],m=(S.report==='close'||S.report==='ratios')?null:reportModel(S.report,s,e),framed=isFramed();
  $('view').innerHTML=`<div class="tabs" role="group" aria-label="Report">${tabs.map(([k,n])=>`<button data-report="${k}" aria-pressed="${S.report===k}">${n}</button>`).join('')}<span class="tools"><button id="pdf-report">Save this report as PDF</button><button id="pdf-summary">Save full summary as PDF</button><button id="pdf-year">Save year in review as PDF</button>${framed?'':'<button id="print-btn">Print</button>'}</span></div>
  ${S.report==='close'?pClose():S.report==='ratios'?vRatiosHTML():`<section class="card"><h2>${esc(m.title)}</h2><p class="sub">${esc(m.sub)}</p>${m.bl!==undefined?vlegend(m.bl):''}${stmt(m.rows)}<p class="footnote">${esc(m.note)}</p></section>`}`;
  if(S.report==='close')bindClose();
  document.querySelectorAll('[data-report]').forEach(el=>el.onclick=()=>{S.report=el.dataset.report;S.anim=true;render()});
  document.querySelectorAll('[data-drill]').forEach(el=>{const run=()=>{const dr=el.dataset.drill,i=dr.indexOf('|');const head=dr.slice(0,i);if(head==='exp'||head==='inc')openAccounts('is',dr);else openAccounts('bs',dr)};el.onclick=run;el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();run()}}});
  $('pdf-report').onclick=()=>exportPdf(S.report);
  $('pdf-summary').onclick=()=>exportPdf('summary');
  $('pdf-year').onclick=()=>exportPdf('year');
  if($('print-btn'))$('print-btn').onclick=()=>window.print();
}

const PAGE=40;
function vActivity(){
  const ix=S.ix,[s,e]=range();
  const accOpts=S.data.accounts.filter(a=>(a.group==='Asset'||a.group==='Liability')&&ix.good.some(l=>l.account===a.id)).sort((x,y)=>x.label.localeCompare(y.label));
  const types=[['all','All'],['income','Income'],['expense','Spending'],['transfer','Transfers'],['oneoff','One-off']];
  $('view').innerHTML=`<section class="card"><div class="head"><div><h2>Transactions</h2><p class="sub" id="act-sub"></p></div></div>
  <div class="toolbar"><input class="search" id="t-search" type="search" placeholder="Search description, category or account" aria-label="Search transactions" value="${esc(S.q)}"><label class="fld" style="flex:0 1 210px"><span class="sr" style="position:absolute;left:-9999px">Account</span><select id="t-acct" aria-label="Account"><option value="">All accounts</option>${accOpts.map(a=>`<option value="${esc(a.id)}" ${S.acct===a.id?'selected':''}>${esc(a.label)}</option>`).join('')}</select></label>
    <input class="search" id="t-amin" type="number" min="0" step="any" inputmode="decimal" placeholder="Min amount" aria-label="Minimum amount" value="${esc(S.amin)}" style="flex:0 1 120px;min-width:100px"><input class="search" id="t-amax" type="number" min="0" step="any" inputmode="decimal" placeholder="Max amount" aria-label="Maximum amount" value="${esc(S.amax)}" style="flex:0 1 120px;min-width:100px"></div>
  <div class="seg" role="group" aria-label="Type" style="margin:6px 0 10px">${types.map(([k,n])=>`<button data-type="${k}" aria-pressed="${S.type===k}">${n}</button>`).join('')}</div>
  <div class="list" id="t-list"></div>
  <div class="pager"><span id="t-count"></span><div><button class="btn small" id="t-prev">Previous</button><button class="btn small" id="t-next">Next</button></div></div></section>`;
  const draw=()=>{
    const q=S.q.toLowerCase(),f=ix.txs.filter(t=>t.date>=s&&t.date<=e&&(S.type==='all'||(S.type==='oneoff'?isOneoff(t.tx):t.kind===S.type))&&(!S.acct||t.ids.has(S.acct))&&(S.amin===''||Math.abs(conv(t.amount))>=+S.amin)&&(S.amax===''||Math.abs(conv(t.amount))<=+S.amax)&&(!q||t.q.includes(q)||t.cat.toLowerCase().includes(q)));
    const pages=Math.max(1,Math.ceil(f.length/PAGE));S.pg=Math.min(S.pg,pages-1);
    $('t-list').innerHTML=f.slice(S.pg*PAGE,S.pg*PAGE+PAGE).map(txRow).join('')||'<div class="empty">No transactions match.</div>';
    $('t-count').textContent=`${f.length.toLocaleString()} transactions · page ${S.pg+1} of ${pages}`;
    $('t-prev').disabled=S.pg===0;$('t-next').disabled=S.pg>=pages-1;
    $('act-sub').textContent=periodLabel()+(S.acct?' · '+(S.ix.accounts[S.acct]?.label||''):'');
    document.querySelectorAll('[data-tx]').forEach(el=>el.onclick=()=>txModal(el.dataset.tx));
  };
  $('t-search').oninput=ev=>{S.q=ev.target.value;S.pg=0;draw();navTouch()};
  $('t-acct').onchange=ev=>{S.acct=ev.target.value;S.pg=0;draw();navTouch()};
  $('t-amin').oninput=ev=>{S.amin=ev.target.value;S.pg=0;draw();navTouch()};$('t-amax').oninput=ev=>{S.amax=ev.target.value;S.pg=0;draw();navTouch()};
  document.querySelectorAll('[data-type]').forEach(el=>el.onclick=()=>{S.type=el.dataset.type;S.pg=0;document.querySelectorAll('[data-type]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.type===S.type));draw();navTouch()});
  $('t-prev').onclick=()=>{S.pg--;draw();navTouch()};$('t-next').onclick=()=>{S.pg++;draw();navTouch()};
  draw();
}
function txModal(tx){
  const t=S.ix.txs.find(x=>x.tx===tx);if(!t)return;
  const multi=new Set(t.lines.map(l=>l.a.currency)).size>1,one=isOneoff(tx),cat=t.kind!=='transfer';
  modal(t.description,`<p class="sub">${fdate(t.date)}${one?' · marked as one-off':''}</p><div class="list">${t.lines.map(l=>`<div class="row"><div><span class="t">${l.code?esc(l.code)+' · ':''}${esc(pathOf(l).join(' › '))}</span><small>${esc(l.group)}${l.memo?' · '+esc(l.memo):''}${l.status?' · '+esc(l.status):''}</small></div><div class="amt">${natf(l.amount,2,l.a.type==='SECURITY'?4:2)} ${esc(l.a.currency)}<small>${S.cur} ${fmt(l.value,2)}</small></div></div>`).join('')}</div>${multi?'<p class="footnote">This transaction spans currencies. Converted amounts use the exchange rates saved in your export, not the rate on the day.</p>':''}
   ${t.lines.filter(l=>l.a.group==='Income'||l.a.group==='Expense').map(recatControl).join('')}
   ${cat?`<div style="margin-top:14px"><button class="btn small" id="tx-oneoff">${one?'Remove the one-off mark':'Mark as one-off'}</button><p class="footnote">One-off items still count in your totals, but are left out of your averages, the ▲▼ comparisons, repeating payments and the forecast.</p></div>`:''}`);
  if(cat)$('tx-oneoff').onclick=()=>{toggleOneoff(tx);render();txModal(tx)};
  document.querySelectorAll('[data-recat]').forEach(sel=>sel.onchange=()=>{const id=sel.dataset.recat,l=t.lines.find(x=>x.id===id);applyRecat(id,sel.value,l.account);render();txModal(tx)});
  S.mv={k:'tx',a:[tx]};navCommit();
}

function fxCard(){
  const base=baseCurrency(S.data),cs=currencies().filter(c=>c!==base);
  if(!cs.length)return'<p class="sub">All your accounts use one currency, so no exchange rates are needed.</p>';
  const months=[];for(let m=monthStart(S.ix.earliest);m<=S.ix.latest;m=addMonths(m,1))months.push(m.slice(0,7));
  return`<p class="sub">Optional. Your export only has today’s rate, so past months use it too. Enter what 1 unit of each currency was worth in ${esc(base)} for any month to make past totals and net worth more accurate. Months you leave blank use the rate before them, or today’s rate if none.</p>`+cs.map(c=>{
    const h=S.plan.fxh[c]||{},cur=rate(S.data,c);
    return`<details class="fx"><summary><strong>${esc(c)}</strong> · today ${cur===null?'no rate':(+cur.toPrecision(5))+' '+esc(base)} · ${Object.keys(h).length} month${Object.keys(h).length===1?'':'s'} entered</summary>
     <div class="fxgrid" style="margin-top:12px">${months.map(mk=>`<label class="fld"><span>${esc(fmonLong(mk+'-01'))}</span><input type="number" min="0" step="any" data-fx="${esc(c)}|${mk}" value="${h[mk]??''}" placeholder="${cur?+cur.toPrecision(4):''}"></label>`).join('')}</div>
     <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><input class="num-in" type="number" min="0" step="any" id="fxall-${esc(c)}" placeholder="One rate" aria-label="One rate for every month of ${esc(c)}"><button class="btn small" data-fxall="${esc(c)}">Fill every month</button><button class="btn small" data-fxclear="${esc(c)}">Clear ${esc(c)}</button><button class="btn small" data-fxpaste="${esc(c)}">Paste rates</button></div></details>`;
  }).join('')+`<div style="margin-top:14px"><button class="btn primary small" id="fx-save">Apply exchange rates</button></div>`;
}
function vData(){
  const ix=S.ix,m=S.meta,cf=cashflow(S.data,ix.earliest,ix.latest,ix),hasFx=Object.values(S.plan.fxh).some(h=>Object.keys(h).length);
  const noRate=m.warnings.some(w=>w.startsWith('No usable')),cst=closedStatus(S.data,ix),cstBad=cst.filter(x=>x.changed);
  const checks=[
    ['Every transaction balances',ix.errors.length?ix.errors.length+' left out':'Passed',ix.errors.length?'bad':'good',ix.errors.length?'These transactions are excluded from every total until fixed in Moneydance.':'Debits and credits agree for all single-currency transactions.',ix.errors.length?'<button class="btn small" id="show-errors">Review</button>':''],
    ['Cross-currency transactions',ix.multi.length+' found',ix.multi.length?'warn':'good',hasFx?'Converted with the monthly rates you entered.':'Converted at the export’s current rates, since the rate on the day is not in the file.',''],
    ['Exchange rates',noRate?'Some missing':hasFx?'Your rates in use':'Complete',noRate?'warn':'good','Accounts without a rate are left out of totals.',''],
    ['Cash roll-forward',Math.abs(cf.difference)<.5?'Passed':hasFx?'Rate effect':'Review',Math.abs(cf.difference)<.5?'good':'warn','Opening cash plus net cash flow should equal closing cash over the whole history. Foreign-currency balances can differ by the exchange-rate effect.',''],
    ['Closed months',cst.length?(cstBad.length?cstBad.length+' changed':cst.length+' unchanged'):'None closed',cstBad.length?'bad':'good','Months you closed are compared with the figures you closed them with.','']
  ];
  const extra=m.warnings.filter(w=>!w.startsWith('No usable')),T=S.targets,locked=!!store.lock(),hist=S.hist||[];
  $('view').innerHTML=`<div class="grid even">
   <section class="card"><div class="head"><h2>Current data</h2></div>
    <dl class="facts"><dt>File</dt><dd>${esc(m.filename)}</dd><dt>Imported</dt><dd>${esc(new Date(m.importedAt).toLocaleString('en-GB'))}</dd><dt>History</dt><dd>${fdate(m.earliest)} – ${fdate(m.latest)}</dd><dt>Accounts</dt><dd>${m.accounts}</dd><dt>Transactions</dt><dd>${m.txCount.toLocaleString()}</dd></dl>
    <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px"><button class="btn primary small" id="d-import">Replace with a new export</button><button class="btn small" id="d-forget">Remove saved data</button></div>
    <p class="footnote">Your export is kept only in this browser on this device. A new import shows what was added, changed and removed before it replaces anything.</p></section>
   <section class="card"><div class="head"><h2>Checks</h2></div>${checks.map(([n,st,k,note,act])=>`<div class="check"><div><strong>${n}</strong><p>${note}</p>${act}</div>${pill(st,k)}</div>`).join('')}${extra.map(w=>`<div class="check"><div><p>${esc(w)}</p></div>${pill('Note','warn')}</div>`).join('')}</section>
  </div>
  <section class="card block"><div class="head"><div><h2>Import history</h2><p class="sub">The last three exports you replaced. Restore one if a new export turns out to be wrong.</p></div></div>${hist.length?hist.map((h,i)=>`<div class="row"><div><span class="t">${esc(h.filename)}</span><small>Imported ${esc(new Date(h.importedAt).toLocaleDateString('en-GB'))} · ${h.accounts} accounts · ${h.txCount.toLocaleString()} transactions · through ${esc(fdate(h.latest))}</small></div><div class="amt"><button class="btn small" data-restore="${i}">Restore</button></div></div>`).join(''):'<p class="sub">Nothing yet. Your previous export is kept here the next time you import.</p>'}</section>
  <section class="card block"><div class="head"><div><h2>Check against Moneydance</h2></div></div>${reconcileCard()}</section>
  <section class="card block"><div class="head"><div><h2>Historical exchange rates</h2></div></div>${fxCard()}</section>
  <section class="card block"><div class="head"><div><h2>Needs and wants</h2></div></div>${classCard()}</section>
  <section class="card block"><div class="head"><div><h2>Category changes</h2></div></div>${overridesCard()}</section>
  <section class="card block" id="backup-card"><div class="head"><div><h2>Full backup</h2></div></div>${backupCard()}</section>
  <section class="card block"><div class="head"><div><h2>Plan file: keep devices in step</h2></div></div>${planFileCard()}</section>
  <section class="card block"><div class="head"><div><h2>Privacy and security</h2><p class="sub">Everything stays on this device. A passcode also encrypts what is saved here.</p></div></div>
   <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" id="s-mask" ${S.mask?'checked':''}> Hide amounts on screen</label>
   ${!CR.available()?'<p class="sub">Encryption is not available in this browser, so a passcode cannot be set.</p>':locked?`<div class="check" style="border:0;padding:0 0 12px"><div><strong>Passcode is on</strong><p>Saved export, history and plan are encrypted.</p></div>${pill('On','good')}</div>
    <div class="form-grid"><label class="fld"><span>Lock after inactivity</span><select id="s-auto">${[[0,'Never'],[1,'1 minute'],[5,'5 minutes'],[15,'15 minutes'],[30,'30 minutes']].map(([v,t])=>`<option value="${v}" ${S.autoLock===v?'selected':''}>${t}</option>`).join('')}</select></label></div>
    <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn small" id="s-lock">Lock now</button><button class="btn small" id="s-change">Change passcode</button><button class="btn small" id="s-remove">Remove passcode</button></div><div id="s-form"></div>`
    :`<div class="form-grid"><label class="fld"><span>New passcode (6 or more characters)</span><input id="pc1" type="password" autocomplete="new-password"></label><label class="fld"><span>Repeat passcode</span><input id="pc2" type="password" autocomplete="new-password"></label></div><div style="margin-top:12px"><button class="btn primary small" id="s-set">Set passcode</button></div>`}
   <p class="footnote">This keeps casual visitors out and protects the saved copy. It cannot protect against someone with full control of your device. If you forget the passcode, the saved data has to be removed and imported again from Moneydance.</p></section>
  <section class="card block"><div class="head"><div><h2>Preferences</h2><p class="sub">Saved on this device.</p></div></div>
   <div class="check" style="border:0;padding:0 0 12px"><div><strong>Appearance</strong><p>${esc((PRESETS[S.look.preset]||PRESETS.ledger).name)} template${isDefaultLook(S.look)?'':' with your changes'}. Choose a template, your own colours, type, spacing and corners.</p></div><button class="btn small" id="p-look">Customise</button></div>
   <div class="pref-grid"><label class="fld"><span>Needs target (% of income)</span><input type="number" min="0" max="100" id="p-needs" value="${T.needs}"></label><label class="fld"><span>Wants target (% of income)</span><input type="number" min="0" max="100" id="p-wants" value="${T.wants}"></label><label class="fld"><span>Savings target (% of income)</span><input type="number" min="0" max="100" id="p-save" value="${T.save}"></label></div>
   <p class="footnote">Needs and Wants come from the top-level category names in your Moneydance categories.</p></section>`;
  $('d-import').onclick=()=>$('file').click();
  $('d-forget').onclick=()=>modal('Remove saved data?','<p>This deletes the export, history and plan saved in this browser. Your Moneydance file is not touched, and you can import it again any time.</p>',[{label:'Cancel',run:()=>$('modal').close()},{label:'Remove',primary:true,run:async()=>{try{await DB.clear()}catch(e){}S.data=null;S.ix=null;S.meta=null;S.raw='';S.hist=[];S.plan=defaultPlan();$('modal').close();S.page='overview';render();toast('Saved data removed.')}}]);
  if($('show-errors'))$('show-errors').onclick=()=>modal('Transactions left out',`<div class="list">${ix.errors.slice(0,200).map(x=>`<div class="row"><div><span class="t">${esc(x.description||'(no description)')}</span><small>${esc(fdate(x.date))} · ${esc(x.reason)}</small></div></div>`).join('')}</div>`);
  document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreHistory(+b.dataset.restore));
  bindReconcile();bindClassCard();bindPlanFile();bindBackup();bindOverrides();
  document.querySelectorAll('[data-fxpaste]').forEach(b=>b.onclick=()=>pasteRates(b.dataset.fxpaste));
  $('s-mask').onchange=e=>{S.mask=e.target.checked;store.set();render()};
  if($('s-set'))$('s-set').onclick=async()=>{const a=$('pc1').value,b=$('pc2').value;if(a.length<6){toast('Use at least 6 characters.');return}if(a!==b){toast('The two passcodes do not match.');return}try{await setPasscode(a);toast('Passcode set. Saved data is now encrypted.');render()}catch(e){toast('Could not set the passcode: '+e.message)}};
  if($('s-auto'))$('s-auto').onchange=e=>{S.autoLock=+e.target.value;store.set()};
  if($('s-lock'))$('s-lock').onclick=lockNow;
  if($('s-change'))$('s-change').onclick=()=>{$('s-form').innerHTML='<div class="form-grid" style="margin-top:12px"><label class="fld"><span>New passcode</span><input id="pc1" type="password" autocomplete="new-password"></label><label class="fld"><span>Repeat passcode</span><input id="pc2" type="password" autocomplete="new-password"></label></div><div style="margin-top:12px"><button class="btn primary small" id="s-set2">Save new passcode</button></div>';$('s-set2').onclick=async()=>{const a=$('pc1').value,b=$('pc2').value;if(a.length<6){toast('Use at least 6 characters.');return}if(a!==b){toast('The two passcodes do not match.');return}try{await setPasscode(a);toast('Passcode changed.');render()}catch(e){toast('Could not change the passcode: '+e.message)}}};
  if($('s-remove'))$('s-remove').onclick=()=>modal('Remove the passcode?','<p>Saved data will no longer be encrypted on this device.</p>',[{label:'Cancel',run:()=>$('modal').close()},{label:'Remove passcode',primary:true,run:async()=>{try{await clearPasscode();$('modal').close();render();toast('Passcode removed.')}catch(e){toast('Could not remove it: '+e.message)}}}]);
  document.querySelectorAll('[data-fxall]').forEach(b=>b.onclick=()=>{const c=b.dataset.fxall,v=+$('fxall-'+c).value;if(!(v>0)){toast('Enter a rate above zero.');return}document.querySelectorAll(`[data-fx^="${c}|"]`).forEach(el=>el.value=v)});
  document.querySelectorAll('[data-fxclear]').forEach(b=>b.onclick=()=>document.querySelectorAll(`[data-fx^="${b.dataset.fxclear}|"]`).forEach(el=>el.value=''));
  if($('fx-save'))$('fx-save').onclick=()=>{
    const next={};let bad=false;
    document.querySelectorAll('[data-fx]').forEach(el=>{if(el.value==='')return;const v=+el.value,[c,mk]=el.dataset.fx.split('|');if(!(v>0)||!Number.isFinite(v)){bad=true;return}(next[c]??={})[mk]=v});
    if(bad){toast('Exchange rates must be above zero.');return}
    S.plan.fxh=next;savePlan();rebuild();render();toast(Object.keys(next).length?'Exchange rates applied. Totals now use your monthly rates.':'Exchange rates cleared. Totals use the export’s current rates.');
  };
  $('p-look').onclick=openAppearance;
  const tgt=(id,k)=>$(id).onchange=ev=>{const v=+ev.target.value;if(Number.isFinite(v)&&v>=0&&v<=100){S.targets[k]=v;store.set()}else{ev.target.value=S.targets[k];toast('Enter a number from 0 to 100.')}};
  tgt('p-needs','needs');tgt('p-wants','wants');tgt('p-save','save');
}
async function restoreHistory(i){
  try{
    const h=[...((await DB.get('history'))||[])],item=h[i];if(!item)return;
    const text=await unpack(item.payload),p=parseTXT(text,item.filename);
    if(p.errors.length)throw new Error('That saved export can no longer be read.');
    modal('Restore this export?',`<p><strong>${esc(item.filename)}</strong>, through ${esc(fdate(item.latest))}, will replace what you are viewing. What you are viewing now moves into history.</p>`,[{label:'Cancel',run:()=>$('modal').close()},{label:'Restore',primary:true,run:async()=>{h.splice(i,1);await DB.put('history',h);await commitImport(p,text);$('modal').close();render();toast('Restored '+item.filename+'.')}}]);
  }catch(e){toast(e.message)}
}

