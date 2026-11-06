'use strict';
/* ============================================================
   Engine: Moneydance tab-delimited export -> ledger, balances
   ============================================================ */
const sum=(a,f=x=>x)=>a.reduce((s,x)=>s+f(x),0);
/* Amounts as people type them: "1500", "1,500", "1 500", "1500.5", "1500,5", "1.500,50". null if not a number. */
function parseAmount(t){
  let s=String(t??'').trim().replace(/[\s  ']/g,'');
  if(!s)return null;
  const c=s.lastIndexOf(','),d=s.lastIndexOf('.');
  if(c>-1&&d>-1)s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');   // both: the last one is the decimal mark
  else if(c>-1)s=/^-?\d{1,3}(,\d{3})+$/.test(s)?s.replace(/,/g,''):s.replace(',','.'); // "1,500" thousands, "12,5" decimal
  if(!/^-?\d*\.?\d+$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)?n:null;
}
const iso=d=>d.toISOString().slice(0,10);
const D=s=>new Date(s+'T12:00:00Z');
const addMonths=(d,n)=>{const a=D(d);a.setUTCDate(1);a.setUTCMonth(a.getUTCMonth()+n);return iso(a)};
const monthStart=d=>d.slice(0,7)+'-01';
const endMonth=d=>iso(new Date(D(addMonths(d,1)).getTime()-86400000));
const addDays=(d,n)=>iso(new Date(D(d).getTime()+n*86400000));
const daysBetween=(a,b)=>Math.round((D(b)-D(a))/86400000)+1;
const shiftYear=(d,n)=>{const a=D(d),day=a.getUTCDate(),m=a.getUTCMonth();a.setUTCDate(1);a.setUTCFullYear(a.getUTCFullYear()+n);a.setUTCMonth(m);const last=new Date(Date.UTC(a.getUTCFullYear(),m+1,0)).getUTCDate();a.setUTCDate(Math.min(day,last));return iso(a)};
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

const clean=x=>String(x||'').replace(/\*\*/g,'').replace(/^\d+\.\s*/,'').trim();
const GROUPS={BANK:'Asset',ASSET:'Asset',INVESTMENT:'Asset',SECURITY:'Asset','CREDIT CARD':'Liability',LIABILITY:'Liability',LOAN:'Liability',INCOME:'Income',EXPENSE:'Expense',EQUITY:'Equity'};
function classify(name,type){
  const parts=name.split(':').map(clean),last=parts.at(-1)||'';
  const cm=last.match(/^(\d{4})\s*[-.]/);
  return{group:GROUPS[String(type).toUpperCase()]||'Other',main:parts[0]||'',level2:parts[1]||'',label:last.replace(/^\d{4}\s*[-.]\s*/,''),code:cm?cm[1]:'',leaf:true};
}
function rate(d,c){
  const v=d.fx[c]??d.fx[Object.keys(d.fx).find(k=>k.toUpperCase()===String(c).toUpperCase())];
  return Number.isFinite(v)&&v>0?v:null;
}

/* Rate in force for a currency on a date: the user's own monthly rates when entered
   (base currency per 1 unit), otherwise the current rate saved in the export. */
function fxAt(d,c,date){
  const h=d.fxh&&d.fxh[String(c).toUpperCase()];
  if(h){const key=date.slice(0,7);let best=null;for(const k in h){if(k<=key&&(best===null||k>best)&&Number.isFinite(h[k])&&h[k]>0)best=k}if(best!==null)return h[best]}
  return rate(d,c);
}
function baseCurrency(d){const k=Object.keys(d.fx).find(c=>Math.abs(d.fx[c]-1)<1e-9);return k?k.toUpperCase():''}

function parseTXT(text,filename){
  text=text.replace(/^\uFEFF/,'');
  if(!text.includes('#Currency\t')||!text.includes('#Account\t')||!text.includes('#Date\t'))
    throw new Error('This does not look like a Moneydance tab-delimited export. Export all accounts as tab-delimited text and try again.');
  const lines=[],accounts=[],fx={},errors=[],warnings=[],occ={},seen=new Set();
  let mode='',account=null,refs=0;
  const rows=text.split(/\r?\n/);
  for(let i=0;i<rows.length;i++){
    const raw=rows[i];if(!raw.trim())continue;
    const c=raw.split('\t');
    if(c[0]==='#Currency'){mode='currency';continue}
    if(c[0]==='#Account'){mode='account';continue}
    if(c[0]==='#Date'){mode='transactions';continue}
    if(c[0].startsWith('#')){mode='';continue}
    if(mode==='currency'){
      const r=Number(c[3]);
      if(c[0]&&Number.isFinite(r)&&r>0)fx[c[0]]=1/r;
      else warnings.push('No usable exchange rate for '+(c[0]||'a currency')+' (row '+(i+1)+').');
      continue;
    }
    if(mode==='account'){
      if(!c[0]&&!c[1]){mode='';continue}
      if(c.length<5||!c[1]){errors.push('Invalid account at row '+(i+1));continue}
      if(seen.has(c[1]))errors.push('Duplicate account ID at row '+(i+1));
      seen.add(c[1]);
      account={id:c[1],name:c[0],type:c[2],currency:c[3],opening:Number(c[4]),...classify(c[0],c[2])};
      if(!Number.isFinite(account.opening))errors.push('Invalid opening balance at row '+(i+1));
      accounts.push(account);mode='';continue;
    }
    if(mode==='transactions'){
      if(c[0]==='-'){refs++;continue}
      if(!account||!/^\d{4}\.\d{2}\.\d{2}$/.test(c[0])||!c[2]||c.length<9||c[8].trim()===''){errors.push('Invalid posting at row '+(i+1));continue}
      const date=c[0].replace(/\./g,'-'),parsed=new Date(date+'T12:00:00Z');
      if(!Number.isFinite(parsed.getTime())||iso(parsed)!==date){errors.push('Invalid date at row '+(i+1));continue}
      if(c[6]!==account.name)errors.push('Posting does not match account header at row '+(i+1));
      const amount=Number(c[8].replace(/,/g,''));
      if(!Number.isFinite(amount)){errors.push('Invalid amount at row '+(i+1));continue}
      const tx='TX|'+c[2],key=tx+'|'+account.id,n=occ[key]=(occ[key]||0)+1;
      lines.push({id:key+'|'+String(n).padStart(3,'0'),tx,date,account:account.id,amount,description:c[4]||'',memo:c[7]||'',status:(c[5]||'').trim(),sourceRow:i+1});
    }
  }
  if(!lines.length)errors.push('No dated postings found');
  const names=new Set(accounts.map(a=>a.name));
  for(const a of accounts)a.leaf=![...names].some(n=>n.startsWith(a.name+':'));
  const txCount=new Set(lines.map(l=>l.tx)).size;
  if(refs!==2*(lines.length-txCount))warnings.push('Split references do not add up exactly. Make sure you exported every account.');
  let latest='',earliest='9999-12-31';
  for(const l of lines){if(l.date>latest)latest=l.date;if(l.date<earliest)earliest=l.date}
  return{filename,lines,accounts,fx,errors:errors.slice(0,200),warnings,refs,txCount,latest,earliest};
}

const NW=/^(needs?|wants?)$/i;
const isCash=a=>a.type==='BANK'||(a.type==='ASSET'&&/cash/i.test(a.main));
const pathOf=l=>[l.main,...(l.level2&&l.level2!==l.label?[l.level2]:[]),l.label].filter((x,i,a)=>x&&a.indexOf(x)===i);

function summarize(tx,ls){
  const inc=-sum(ls.filter(l=>l.group==='Income'),l=>l.value),exp=sum(ls.filter(l=>l.group==='Expense'),l=>l.value);
  const cats=ls.filter(l=>l.group==='Income'||l.group==='Expense');
  let kind,amount,cat='';
  if(cats.length){
    kind=inc!==0&&Math.abs(inc)>=Math.abs(exp)?'income':'expense';amount=inc-exp;
    const top=cats.reduce((a,b)=>Math.abs(b.value)>Math.abs(a.value)?b:a);cat=pathOf(top).join(' › ');
  }else{kind='transfer';amount=Math.max(0,...ls.map(l=>Math.abs(l.value)))}
  const accts=[...new Set(ls.filter(l=>!(l.group==='Income'||l.group==='Expense')).map(l=>l.label))];
  const first=ls[0];
  return{tx,date:first.date,description:first.description||'(no description)',kind,amount,cat,accts,ids:new Set(ls.map(l=>l.account)),
    q:(ls.map(l=>l.description+' '+l.memo+' '+l.label+' '+l.main).join(' ')).toLowerCase(),lines:ls};
}

function buildIndex(d){
  const accounts=Object.fromEntries(d.accounts.map(a=>[a.id,a]));
  const cache={},r=(c,date)=>{const key=c+'|'+date.slice(0,7);return key in cache?cache[key]:(cache[key]=fxAt(d,c,date))};
  const lines=d.lines.map(l=>{
    const a=accounts[l.account];
    if(!a)return{...l,a:null,group:'Unknown',value:null};
    const k=r(a.currency,l.date);
    let cat=a;
    if(a.group==='Income'||a.group==='Expense'){const tid=(d.recat&&d.recat[l.id])||(d.catMap&&d.catMap[a.id]),t=tid&&accounts[tid];if(t&&(t.group==='Income'||t.group==='Expense'))cat=t}
    return{...l,a,catId:cat.id,group:cat.group,main:cat.main,level2:cat.level2,label:cat.label,code:cat.code,recat:cat!==a,value:k===null?null:l.amount*k};
  });
  const groups={};for(const l of lines)(groups[l.tx]??=[]).push(l);
  const errors=[],multi=[],good=[],txs=[];
  for(const [tx,ls] of Object.entries(groups)){
    const cur=new Set(ls.map(l=>l.a?.currency));
    const bad=ls.some(l=>!l.a||l.value===null||!DATE_RE.test(l.date)||!Number.isFinite(l.amount));
    const bal=sum(ls,l=>l.amount);
    if(bad||(cur.size===1&&Math.abs(bal)>.02)){
      errors.push({tx,date:ls[0].date,description:ls[0].description,reason:bad?'Missing account or exchange rate':'Debits and credits differ by '+bal.toFixed(2)});continue;
    }
    for(const l of ls)good.push(l);
    if(cur.size>1)multi.push({tx});
    txs.push(summarize(tx,ls));
  }
  txs.sort((a,b)=>b.date.localeCompare(a.date)||a.tx.localeCompare(b.tx));
  let latest='',earliest='9999-12-31';
  for(const l of lines){if(l.date>latest)latest=l.date;if(l.date<earliest)earliest=l.date}
  const ix={accounts,lines,good,groups,errors,multi,txs,latest,earliest,errTx:new Set(errors.map(e=>e.tx))};
  ix.nw=netWorthSeries(d,ix);
  return ix;
}

function netWorthSeries(d,ix){
  if(!ix.good.length)return[];
  const months=[];for(let m=monthStart(ix.earliest);m<=ix.latest;m=addMonths(m,1))months.push(m);
  const mv={};
  for(const l of ix.good){const k=l.date.slice(0,7)+'-01',o=(mv[l.account]??={});o[k]=(o[k]||0)+l.amount}
  const cum={};
  const track=d.accounts.filter(a=>a.group==='Asset'||a.group==='Liability').map(a=>({a,bal:a.opening||0}));
  const kc={},kf=(c,m)=>{const key=c+'|'+m.slice(0,7);return key in kc?kc[key]:(kc[key]=fxAt(d,c,m))};
  return months.map(m=>{
    let assets=0,debt=0;
    for(const t of track){t.bal+=(mv[t.a.id]?.[m]||0);const k=kf(t.a.currency,m);if(k===null)continue;const v=t.bal*k;if(t.a.group==='Asset')assets+=v;else debt-=v}
    return{month:m,assets,debt,net:assets-debt};
  });
}

function balances(d,end,ix){
  const native={};for(const a of d.accounts)native[a.id]=a.opening||0;
  for(const l of ix.good)if(l.date<=end)native[l.account]+=l.amount;
  const kc={},rows=d.accounts.filter(a=>a.leaf||Math.abs(native[a.id])>1e-5).map(a=>{const k=a.currency in kc?kc[a.currency]:(kc[a.currency]=fxAt(d,a.currency,end));return{...a,native:native[a.id],value:k===null?null:native[a.id]*k}});
  const S_=(f)=>sum(rows.filter(f),a=>a.value||0);
  const assets=S_(a=>a.group==='Asset'),debt=-S_(a=>a.group==='Liability'),cash=S_(isCash),
        investments=S_(a=>a.type==='SECURITY'||a.type==='INVESTMENT'),cards=-S_(a=>a.type==='CREDIT CARD');
  return{rows,assets,debt,cash,investments,cards,loans:debt-cards,other:assets-cash-investments,networth:assets-debt,asOf:end>ix.latest?ix.latest:end,missing:rows.filter(a=>a.value===null).length};
}

function actual(d,start,end,ix){
  const lines=ix.good.filter(l=>l.date>=start&&l.date<=end);
  const income=-sum(lines.filter(l=>l.group==='Income'),l=>l.value);
  const ex=lines.filter(l=>l.group==='Expense');
  const expense=sum(ex,l=>l.value);
  const cmap=d.classMap||null,ck=l=>NW.test(l.main)?l.main+' › '+(l.level2||l.label):(l.main||'Uncategorised'),cls=l=>(cmap&&cmap[ck(l)])||(/^needs?$/i.test(l.main)?'needs':/^wants?$/i.test(l.main)?'wants':'other');
  const needs=sum(ex.filter(l=>cls(l)==='needs'),l=>l.value),wants=sum(ex.filter(l=>cls(l)==='wants'),l=>l.value);
  return{income,expense,needs,wants,surplus:income-expense,savingsRate:income>0?(income-expense)/income:null,lines,exLines:ex,incLines:lines.filter(l=>l.group==='Income')};
}

function cashflow(d,start,end,ix){
  const r={operating:0,investing:0,financing:0,translation:0,review:0};
  for(const ls of Object.values(ix.groups)){
    if(ls[0].date<start||ls[0].date>end||ix.errTx.has(ls[0].tx))continue;
    const cash=ls.filter(l=>isCash(l.a));if(!cash.length)continue;
    const net=sum(cash,l=>l.value),non=ls.filter(l=>!isCash(l.a)&&Math.abs(l.amount)>1e-6);
    let key='review';
    if(!non.length)key='translation';
    else if(non.some(l=>l.group==='Income'||l.group==='Expense'))key='operating';
    else if(non.some(l=>l.group==='Liability'||l.group==='Equity'))key='financing';
    else if(non.some(l=>l.group==='Asset'))key='investing';
    r[key]+=net;
  }
  r.opening=balances(d,addDays(start,-1),ix).cash;r.closing=balances(d,end,ix).cash;
  r.net=r.operating+r.investing+r.financing+r.translation+r.review;
  r.difference=r.opening+r.net-r.closing;
  return r;
}

/* ============================================================
   Sample data (so the app can be tried without a real export)
   ============================================================ */
function sampleText(){
  let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,pick=(a,b)=>Math.round(a+rnd()*(b-a));
  const A={
    main:['Assets:Cash & Bank:Everyday','a-main','BANK','QAR',18500],
    sav:['Assets:Cash & Bank:Savings','a-sav','BANK','QAR',40000],
    ind:['Assets:Cash & Bank:India account','a-ind','BANK','INR',300000],
    fund:['Assets:Investments:Index fund','a-fund','INVESTMENT','QAR',22000],
    visa:['Liabilities:Visa card','l-visa','CREDIT CARD','QAR',0],
    loan:['Liabilities:Car loan','l-loan','LIABILITY','QAR',-30000],
    sal:['Income:Salary','i-sal','INCOME','QAR',0],
    int:['Income:Interest','i-int','INCOME','QAR',0],
    gain:['Income:Investment gains','i-gain','INCOME','QAR',0],
    rent:['Needs:Housing:Rent','e-rent','EXPENSE','QAR',0],
    util:['Needs:Housing:Utilities','e-util','EXPENSE','QAR',0],
    groc:['Needs:Food:Groceries','e-groc','EXPENSE','QAR',0],
    fuel:['Needs:Transport:Fuel','e-fuel','EXPENSE','QAR',0],
    fam:['Needs:Family:Support in India','e-fam','EXPENSE','INR',0],
    dine:['Wants:Dining out','e-dine','EXPENSE','QAR',0],
    subs:['Wants:Subscriptions','e-subs','EXPENSE','QAR',0],
    shop:['Wants:Shopping','e-shop','EXPENSE','QAR',0],
    trip:['Wants:Travel','e-trip','EXPENSE','QAR',0]
  };
  const INR=22.6,tx=[];let n=0,visaOwed=0;
  const add=(date,desc,legs)=>{if(date>'2026-09-18')return;tx.push({date,desc,legs,id:'2025'+String(++n).padStart(6,'0')})};
  const pad=x=>String(x).padStart(2,'0');
  for(let k=0;k<15;k++){
    const y=2025+Math.floor((6+k)/12),m=(6+k)%12+1,ds=day=>`${y}-${pad(m)}-${pad(day)}`;
    if(ds(1)>'2026-09-18')break;
    add(ds(1),'Salary',[[A.main,14500+(k>=8?800:0)],[A.sal,-(14500+(k>=8?800:0))]]);
    add(ds(2),'Rent',[[A.main,-4200],[A.rent,4200]]);
    add(ds(3),'Money to India',[[A.main,-2500],[A.ind,Math.round(2500*INR)]]);
    add(ds(4),'Family support',[[A.ind,-18000],[A.fam,18000]]);
    add(ds(5),'Electricity and water',[[A.main,-pick(300,460)],[A.util,pick(300,460)]].map((x,i,a)=>i?[x[0],-a[0][1]]:x));
    for(const dd of [4,11,18,25]){const v=pick(210,430);add(ds(dd),'Supermarket',[[A.visa,-v],[A.groc,v]]);visaOwed+=v}
    for(const dd of [8,22]){const v=pick(110,190);add(ds(dd),'Fuel',[[A.visa,-v],[A.fuel,v]]);visaOwed+=v}
    for(const dd of [6,14,27]){const v=pick(55,190);add(ds(dd),'Restaurant',[[A.visa,-v],[A.dine,v]]);visaOwed+=v}
    add(ds(9),'Streaming and apps',[[A.visa,-72],[A.subs,72]]);visaOwed+=72;
    if(rnd()>.35){const v=pick(150,720);add(ds(16),'Shopping',[[A.visa,-v],[A.shop,v]]);visaOwed+=v}
    if(k===3||k===9){const v=pick(1800,2600);add(ds(20),'Flights and hotel',[[A.visa,-v],[A.trip,v]]);visaOwed+=v}
    if(ds(28)<='2026-09-18'){
      add(ds(24),'Card payment',[[A.main,-visaOwed],[A.visa,visaOwed]]);visaOwed=0;
      add(ds(26),'Car loan payment',[[A.main,-900],[A.loan,900]]);
      add(ds(27),'Move to savings',[[A.main,-2000],[A.sav,2000]]);
      add(ds(27),'Monthly investment',[[A.main,-1500],[A.fund,1500]]);
      add(ds(28),'Savings interest',[[A.sav,pick(30,45)],[A.int,-0]].map((x,i,a)=>i?[x[0],-a[0][1]]:x));
      const g=pick(-300,650);add(ds(28),'Fund valuation',[[A.fund,g],[A.gain,-g]]);
    }
  }
  const out=[];
  out.push('#Currency\tID\tName\tRate');
  out.push('QAR\tQatari Riyal\t\t1');out.push('INR\tIndian Rupee\t\t'+INR);out.push('');
  for(const a of Object.values(A)){
    out.push('#Account\tName\tID\tType\tCurrency\tOpening');
    out.push([a[0],a[1],a[2],a[3],a[4]].join('\t'));
    out.push('#Date\tDate\t\tEntered\t\tDescription\tStatus\tAccount\tMemo\tAmount');
    for(const t of tx.filter(t=>t.legs.some(l=>l[0]===a)).sort((x,y)=>x.date.localeCompare(y.date))){
      for(const l of t.legs.filter(l=>l[0]===a)){
        out.push([t.date.replace(/-/g,'.'),'',t.id,'',t.desc,'',a[0],'',l[1].toFixed(2)].join('\t'));
        out.push(['-','','','','','','','',''].join('\t'));
      }
    }
    out.push('');
  }
  return out.join('\n');
}

