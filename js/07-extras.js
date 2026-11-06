'use strict';
/* ============================================================
   Extras: one-offs, Needs/Wants mapping, repeating payments,
   debts, currency mix, reconcile, plan files, year in review
   ============================================================ */
const isOneoff=tx=>!!(S.plan&&S.plan.oneoffs&&S.plan.oneoffs[tx]);
const oneoffCount=()=>S.plan?Object.keys(S.plan.oneoffs||{}).length:0;
const defaultClass=l=>/^needs?$/i.test(l.main)?'needs':/^wants?$/i.test(l.main)?'wants':'other';
const lineClass=l=>{const m=S.data&&S.data.classMap;return(m&&m[catKey(l)])||defaultClass(l)};

function toggleOneoff(tx){
  if(S.plan.oneoffs[tx])delete S.plan.oneoffs[tx];else S.plan.oneoffs[tx]=true;
  monthStatCache.delete(S.ix);savePlan();
}

/* ---- Needs / Wants mapping ---- */
function classCard(){
  const ix=S.ix,a=actual(S.data,addMonths(monthStart(ix.latest),-11),ix.latest,ix),tot={};
  for(const l of a.exLines){const k=catKey(l);(tot[k]??={v:0,cls:defaultClass(l)}).v+=l.value}
  const rows=Object.entries(tot).sort((x,y)=>y[1].v-x[1].v).slice(0,40),map=S.plan.classMap||{};
  const seg=(k,def)=>{const cur=map[k]||def;return`<div class="seg" role="group" aria-label="Class for ${esc(k)}">${[['needs','Needs'],['wants','Wants'],['other','Other']].map(([v,t])=>`<button data-cm="${esc(k)}" data-v="${v}" aria-pressed="${cur===v}">${t}</button>`).join('')}</div>`};
  return`<p class="sub">Decide which categories count as Needs, Wants or neither. This drives the Needs, Wants and Saved shares against your targets. Your Moneydance category names are the starting point.</p>
   <div class="list">${rows.map(([k,r])=>`<div class="row"><div><span class="t">${esc(k)}</span><small>${esc(S.cur)} ${fmt(r.v)} in the last 12 months${map[k]?' · changed by you':''}</small></div><div class="amt">${seg(k,r.cls)}</div></div>`).join('')||'<p class="sub">No spending yet.</p>'}</div>
   ${Object.keys(map).length?'<div style="margin-top:12px"><button class="btn small" id="cm-reset">Reset to Moneydance names</button></div>':''}`;
}
function bindClassCard(){
  document.querySelectorAll('[data-cm]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.cm,v=b.dataset.v,ix=S.ix,l=ix.good.find(x=>x.group==='Expense'&&catKey(x)===k),def=l?defaultClass(l):'other';
    if(v===def)delete S.plan.classMap[k];else S.plan.classMap[k]=v;
    savePlan();rebuild();render();
  });
  if($('cm-reset'))$('cm-reset').onclick=()=>{S.plan.classMap={};savePlan();rebuild();render()};
}

/* ---- pasted exchange rates ---- */
function parseRates(text){
  const out={},bad=[],MN={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    let y,m,rest,x;
    if(x=line.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?[\s,;:=\t]+(.+)$/)){y=+x[1];m=+x[2];rest=x[3]}
    else if(x=line.match(/^(\d{1,2})[-\/.](\d{4})[\s,;:=\t]+(.+)$/)){m=+x[1];y=+x[2];rest=x[3]}
    else if(x=line.match(/^([A-Za-z]{3,9})\.?[\s,\-]*(\d{4})[\s,;:=\t]+(.+)$/)){m=MN[x[1].toLowerCase().slice(0,3)];y=+x[2];rest=x[3]}
    let n=rest===undefined?'':String(rest).trim().split(/\s+/)[0];
    if(n.includes('.')&&n.includes(','))n=n.replace(/,/g,'');else if(n.includes(','))n=n.replace(',','.');
    const v=parseFloat(n);
    if(m>=1&&m<=12&&y>=1990&&y<=2100&&v>0&&Number.isFinite(v))out[y+'-'+String(m).padStart(2,'0')]=v;else bad.push(line);
  }
  return{rates:out,bad};
}
function pasteRates(cur){
  modal('Paste '+cur+' rates',`<p class="sub">One month per line, for example <code>2026-08 22.9</code>, <code>08/2026 22.9</code> or <code>Aug 2026 22.9</code>. You can paste straight from a spreadsheet. They fill the boxes below, and nothing changes until you press Apply exchange rates.</p><textarea id="pr-text" rows="9" style="width:100%;border:1px solid var(--line);border-radius:var(--rs);padding:10px;background:var(--surface);color:var(--ink);font:inherit"></textarea><p class="footnote" id="pr-note"></p>`,
   [{label:'Cancel',run:()=>$('modal').close()},{label:'Fill the boxes',primary:true,run:()=>{
     const r=parseRates($('pr-text').value),keys=Object.keys(r.rates);
     if(!keys.length){$('pr-note').textContent='No months could be read. Use a month, then a rate, on each line.';return}
     let n=0;keys.forEach(k=>{const el=document.querySelector(`[data-fx="${cur}|${k}"]`);if(el){el.value=r.rates[k];n++}});
     $('modal').close();toast('Filled '+n+' month'+(n===1?'':'s')+(r.bad.length?', skipped '+r.bad.length+' line'+(r.bad.length===1?'':'s'):'')+'. Press Apply exchange rates to use them.');
   }}]);
}

/* ---- reconcile against Moneydance ---- */
function reconcileCompare(cur,date,nw,month,inc,sp){
  const ix=S.ix,rows=[],add=(label,md,app)=>{const diff=app-md,tol=Math.max(1,Math.abs(md)*.001);rows.push({label,md,app,diff,ok:Math.abs(diff)<=tol})};
  if(nw!==null&&Number.isFinite(nw)){const b=balances(S.data,date,ix);add('Net worth as of '+fdate(date>ix.latest?ix.latest:date),nw,fromBase(b.networth,cur,date))}
  if(month&&(Number.isFinite(inc)||Number.isFinite(sp))){
    const s=month+'-01',e=endMonth(s),a=actual(S.data,s,e,ix);
    if(Number.isFinite(inc))add('Income in '+fmonLong(s),inc,fromBase(a.income,cur,e));
    if(Number.isFinite(sp))add('Spending in '+fmonLong(s),sp,fromBase(a.expense,cur,e));
  }
  return rows;
}
function reconcileCard(){
  const cs=currencies(),base=baseCurrency(S.data),ix=S.ix,months=[];
  for(let m=monthStart(ix.earliest);m<=ix.latest;m=addMonths(m,1))months.push(m.slice(0,7));
  const full=months.filter(m=>endMonth(m+'-01')<=ix.latest),sel=(full.at(-1)||months.at(-1));
  return`<p class="sub">Type in what Moneydance shows and see whether this app agrees. Use the same currency Moneydance reports in${base?' (your export’s base currency is '+esc(base)+')':''}. Fill in only what you want to check.</p>
   <div class="form-grid"><label class="fld"><span>Currency</span><select id="rc-cur">${cs.map(c=>`<option ${c===base?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
   <label class="fld"><span>Net worth as of</span><input id="rc-date" type="date" value="${ix.latest}"></label>
   <label class="fld"><span>Net worth in Moneydance</span><input id="rc-nw" type="text" inputmode="decimal" autocomplete="off" data-num step="any"></label>
   <label class="fld"><span>Month to compare</span><select id="rc-month">${months.map(m=>`<option value="${m}" ${m===sel?'selected':''}>${esc(fmonLong(m+'-01'))}</option>`).join('')}</select></label>
   <label class="fld"><span>Income that month</span><input id="rc-inc" type="text" inputmode="decimal" autocomplete="off" data-num step="any"></label>
   <label class="fld"><span>Spending that month</span><input id="rc-sp" type="text" inputmode="decimal" autocomplete="off" data-num step="any"></label></div>
   <div style="margin-top:12px"><button class="btn primary small" id="rc-go">Compare</button></div><div id="rc-out"></div>`;
}
function bindReconcile(){
  $('rc-go').onclick=()=>{
    const num=id=>{const v=$(id).value.trim();return v===''?null:+v};
    const rows=reconcileCompare($('rc-cur').value,$('rc-date').value||S.ix.latest,num('rc-nw'),$('rc-month').value,num('rc-inc')??NaN,num('rc-sp')??NaN),cur=$('rc-cur').value;
    if(!rows.length){$('rc-out').innerHTML='<p class="sub" style="margin-top:12px">Enter at least one figure from Moneydance.</p>';return}
    const bad=rows.some(r=>!r.ok);
    $('rc-out').innerHTML=`<div class="list" style="margin-top:14px">${rows.map(r=>`<div class="row"><div><span class="t">${esc(r.label)}</span><small>Moneydance ${fmtIn(r.md,cur,2)} · this app ${fmtIn(r.app,cur,2)} · difference ${fmtIn(r.diff,cur,2)}</small></div><div class="amt">${pill(r.ok?'Matches':'Differs',r.ok?'good':'bad')}</div></div>`).join('')}</div>
     ${bad?`<p class="footnote"><strong>If something differs,</strong> the usual causes are: ${S.ix.errors.length?S.ix.errors.length+' transaction'+(S.ix.errors.length>1?'s':'')+' left out of the totals (see Checks); ':''}an export that stopped before the date you typed; future-dated entries; exchange rates, since this app uses the export’s current rate unless you entered monthly rates; or Moneydance treating a transfer as income or spending.</p>`:'<p class="footnote">Everything you entered agrees to within 0.1%.</p>'}`;
  };
}

/* ---- plan file (save on one device, load on another) ---- */
async function saveFile(blob,filename,what='file'){
  let dl=null;
  if(window.claude&&typeof window.claude.use==='function'){try{dl=await window.claude.use('downloads')}catch(e){dl=null}}
  if(dl){
    try{await dl.save({filename,data:blob});toast('Saved '+filename+'.')}
    catch(e){if(!(e&&e.code==='declined'))toast('The '+what+' could not be saved here: '+((e&&e.message)||'not available')+'.')}
    return;
  }
  if(isFramed()){toast('Saving files is not available in this view. Open the app from its own address to save files.');return}
  const file=new File([blob],filename,{type:blob.type});
  const touch=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
  if(touch&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:filename});return}catch(e){if(e&&e.name==='AbortError')return}
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  toast('Ready: '+filename+'. Look in your Downloads.');
}
function planPayload(withLook){
  return{app:'money-status',kind:'plan',v:1,savedAt:new Date().toISOString(),plan:S.plan,targets:S.targets,...(withLook?{look:S.look}:{})};
}
async function buildPlanFile(withLook,password){
  const text=JSON.stringify(planPayload(withLook));
  if(!password)return text;
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await CR.derive(password,salt),o=await CR.enc(key,text);
  return JSON.stringify({app:'money-status',kind:'plan',v:1,enc:true,salt:b64(salt),iv:b64(o.iv),ct:b64(o.ct)});
}
async function readPlanFile(text,password){
  const obj=JSON.parse(text);
  if(!obj||obj.app!=='money-status'||obj.kind!=='plan')throw new Error('This is not a Money status plan file.');
  if(obj.enc){
    if(!password)return{needsPassword:true};
    try{const key=await CR.derive(password,unb64(obj.salt));return{payload:JSON.parse(await CR.dec(key,{iv:unb64(obj.iv),ct:unb64(obj.ct)}))}}
    catch(e){throw new Error('That password did not open the file.')}
  }
  return{payload:obj};
}
function planSummary(p){
  const pl=p.plan||{};
  return{budgets:(pl.budgets||[]).length,goals:(pl.goals||[]).length,events:((pl.fc||{}).events||[]).length,rates:Object.values(pl.fxh||{}).reduce((n,h)=>n+Object.keys(h).length,0),oneoffs:Object.keys(pl.oneoffs||{}).length,classes:Object.keys(pl.classMap||{}).length,loans:Object.keys(pl.loans||{}).length,commitments:(pl.commitments||[]).length};
}
function savePlanDialog(){
  modal('Save plan file',`<p class="sub">This makes one small file with your budgets, goals, forecast settings, exchange rates, one-off marks and Needs/Wants choices. It does <strong>not</strong> contain your Moneydance export. Save it to iCloud Drive, then open it on your other device.</p>
   <label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" id="sp-look"> Include my appearance choices</label>
   <label class="fld"><span>Password for the file (optional, keep it safe)</span><input id="sp-pass" type="password" autocomplete="new-password"></label>`,
   [{label:'Cancel',run:()=>$('modal').close()},{label:'Save file',primary:true,run:async()=>{
     const pw=$('sp-pass').value,look=$('sp-look').checked;
     if(pw&&pw.length<6){toast('Use at least 6 characters, or leave the password empty.');return}
     if(pw&&!CR.available()){toast('Encryption is not available in this browser.');return}
     try{const text=await buildPlanFile(look,pw),d=new Date().toISOString().slice(0,10);$('modal').close();await saveFile(new Blob([text],{type:'application/json'}),'Money-status-plan-'+d+'.json','plan file')}
     catch(e){toast('The plan file could not be created: '+e.message)}
   }}]);
}
async function loadPlanText(text){
  try{
    let r=await readPlanFile(text,null);
    if(r.needsPassword){
      modal('This file is protected',`<label class="fld"><span>File password</span><input id="lp-pass" type="password" autocomplete="off"></label><p class="footnote" id="lp-err" style="color:var(--red)"></p>`,
       [{label:'Cancel',run:()=>$('modal').close()},{label:'Open',primary:true,run:async()=>{try{const r2=await readPlanFile(text,$('lp-pass').value);confirmPlanLoad(r2.payload)}catch(e){$('lp-err').textContent=e.message}}}]);
      return;
    }
    confirmPlanLoad(r.payload);
  }catch(e){toast(e.message&&e.message.includes('JSON')?'That file could not be read.':e.message)}
}
function confirmPlanLoad(p){
  const sm=planSummary(p),older=p.savedAt&&S.plan.updatedAt&&Date.parse(p.savedAt)<S.plan.updatedAt,now=planSummary({plan:S.plan}),rc=Object.keys((p.plan||{}).recat||{}).length;
  modal('Load this plan?',`<p>Saved ${esc(p.savedAt?new Date(p.savedAt).toLocaleString('en-GB'):'at an unknown time')}. It contains ${sm.budgets} budget version${sm.budgets===1?'':'s'}, ${sm.goals} goal${sm.goals===1?'':'s'}, ${sm.events} one-off forecast item${sm.events===1?'':'s'}, ${sm.rates} monthly exchange rate${sm.rates===1?'':'s'}, ${sm.oneoffs} one-off mark${sm.oneoffs===1?'':'s'}, ${sm.classes} Needs/Wants choice${sm.classes===1?'':'s'} ${sm.commitments?`, ${sm.commitments} commitment${sm.commitments===1?'':'s'}`:''} and ${rc} category change${rc===1?'':'s'}.</p>
   <p class="sub">On this device now: ${now.budgets} budget versions, ${now.goals} goals.</p>
   ${older?notice('This file is older than the last change you made on this device.'):''}
   <div style="display:grid;gap:8px;margin-top:12px"><label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="pm" value="merge" checked> <span><strong>Add to this device’s plan.</strong> Keeps what is here and adds what is in the file. If both have the same budget month, goal or category change, the file wins.</span></label>
   <label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="pm" value="replace"> <span><strong>Replace this device’s plan.</strong> Everything here is swapped for the file.</span></label></div>
   ${p.look?'<p class="footnote">The file also carries appearance choices, which will be applied.</p>':''}`,
   [{label:'Cancel',run:()=>$('modal').close()},{label:'Load plan',primary:true,run:()=>{
     const replace=document.querySelector('input[name=pm]:checked').value==='replace';
     S.plan=replace?mergePlan(p.plan||{}):mergePlans(S.plan,p.plan||{});if(p.targets)S.targets={...S.targets,...p.targets};
     if(p.look){S.look={...defaultLook(),...p.look};applyLook()}
     store.set();savePlan();if(S.data)rebuild();$('modal').close();render();toast('Plan loaded.');
   }}]);
}

function planFileCard(){
  return`<p class="sub">Your budgets and goals live on each device separately. Save them to a file, keep it in iCloud Drive, and load it on the other device.</p>
   <ol class="steps"><li><b>Save plan file</b>, then on iPhone choose <b>Save to Files</b> and pick iCloud Drive. On the Mac, move the file from Downloads into iCloud Drive.</li><li>On the other device tap <b>Load plan file</b> and choose it from iCloud Drive.</li></ol>
   <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary small" id="pf-save">Save plan file</button><button class="btn small" id="pf-load">Load plan file</button></div>
   <input type="file" id="plan-file" accept=".json,application/json" hidden>
   <p class="footnote">Loading replaces the plan on this device, and warns you if the file is older than your latest change.</p>`;
}
function bindPlanFile(){
  $('pf-save').onclick=savePlanDialog;
  $('pf-load').onclick=()=>$('plan-file').click();
  $('plan-file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{loadPlanText(await f.text())}catch(err){toast('That file could not be read.')}};
}

/* ---- full backup: export + import history + plan + settings, always encrypted ---- */
const BACKUP_MIN_PW=8;
async function backupPayload(){
  const saved=await DB.get('export'),hist=(await DB.get('history'))||[];
  return{app:'money-status',kind:'backup',v:1,savedAt:new Date().toISOString(),
    export:saved?{filename:saved.filename,importedAt:saved.importedAt,text:saved.text??await unpack(saved.payload)}:null,
    history:await Promise.all(hist.map(async h=>({filename:h.filename,importedAt:h.importedAt,accounts:h.accounts,txCount:h.txCount,latest:h.latest,text:await unpack(h.payload)}))),
    plan:S.plan,settings:store.get()};
}
async function buildBackupFile(password){
  if(!password||password.length<BACKUP_MIN_PW)throw new Error('Use a password of at least '+BACKUP_MIN_PW+' characters.');
  const text=JSON.stringify(await backupPayload()),salt=crypto.getRandomValues(new Uint8Array(16)),key=await CR.derive(password,salt),o=await CR.enc(key,text);
  return JSON.stringify({app:'money-status',kind:'backup',v:1,enc:true,salt:b64(salt),iv:b64(o.iv),ct:b64(o.ct)});
}
async function readBackupFile(text,password){
  let obj;try{obj=JSON.parse(text)}catch(e){throw new Error('That file could not be read.')}
  if(!obj||obj.app!=='money-status'||obj.kind!=='backup'||!obj.enc)throw new Error(obj&&obj.kind==='plan'?'This is a plan file. Use Load plan file instead.':'This is not a Money status backup.');
  let p;try{const key=await CR.derive(password,unb64(obj.salt));p=JSON.parse(await CR.dec(key,{iv:unb64(obj.iv),ct:unb64(obj.ct)}))}
  catch(e){throw new Error('That password did not open the backup.')}
  if(p.export){const t=parseTXT(p.export.text,p.export.filename);if(t.errors.length)throw new Error('The export inside this backup is damaged: '+t.errors[0])}
  return p;
}
async function restoreBackup(p){
  const out={plan:await pack(JSON.stringify(mergePlan(p.plan||{}))),
    history:await Promise.all((p.history||[]).map(async h=>({filename:h.filename,importedAt:h.importedAt,accounts:h.accounts,txCount:h.txCount,latest:h.latest,payload:await pack(h.text)})))};
  if(p.export)out.export={filename:p.export.filename,importedAt:p.export.importedAt,payload:await pack(p.export.text)};
  else await DB.del('export');
  await DB.putMany(out);
  const st=p.settings||{};
  if(st.cur)S.cur=st.cur;if(st.theme)S.theme=st.theme;if(st.targets)S.targets={...S.targets,...st.targets};if(st.look){S.look={...defaultLook(),...st.look};applyLook()}
  if(typeof st.mask==='boolean')S.mask=st.mask;if(st.layout)S.layout=st.layout;
  S.data=null;S.ix=null;S.meta=null;
  await loadAll();store.set();
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
}
function backupAge(){if(!S.lastBackup)return null;return Math.floor((Date.now()-Date.parse(S.lastBackup))/864e5)}
function backupCard(){
  const age=backupAge(),has=!!(S.data&&!S.meta?.sample);
  const status=age===null?(has?notice('You have no backup yet. If this browser clears its storage, your data and plan are gone.'):''):
    `<p class="sub">Last backup on this device: <strong>${esc(new Date(S.lastBackup).toLocaleDateString('en-GB'))}</strong>${age>0?` (${age} day${age===1?'':'s'} ago)`:' (today)'}.</p>${age>30&&has?notice('Your last backup is over a month old.'):''}`;
  return`${status}<p class="sub">One encrypted file with everything on this device: your Moneydance export, import history, plan, budgets, goals and settings. Keep it in iCloud Drive. Restoring it brings this device back exactly as it was.</p>
   <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary small" id="bk-save" ${has?'':'disabled'}>Save backup</button><button class="btn small" id="bk-load">Restore backup</button></div>
   <input type="file" id="bk-file" accept=".json,application/json" hidden>
   <p class="footnote">The backup always needs a password, because it holds your financial data. Without the password it cannot be opened, by anyone.</p>`;
}
function bindBackup(){
  if($('bk-save'))$('bk-save').onclick=()=>{
    if(!CR.available()){toast('Encryption is not available in this browser, so a backup cannot be made.');return}
    modal('Save full backup',`<p class="sub">Choose a password for this backup. Write it down: there is no way to recover it.</p>
     <label class="fld"><span>Password (at least ${BACKUP_MIN_PW} characters)</span><input id="bk-pass" type="password" autocomplete="new-password"></label>
     <label class="fld"><span>Type it again</span><input id="bk-pass2" type="password" autocomplete="new-password"></label><p class="footnote" id="bk-err" style="color:var(--red)"></p>`,
     [{label:'Cancel',run:()=>$('modal').close()},{label:'Save backup',primary:true,run:async()=>{
       const pw=$('bk-pass').value;
       if(pw.length<BACKUP_MIN_PW){$('bk-err').textContent='Use at least '+BACKUP_MIN_PW+' characters.';return}
       if(pw!==$('bk-pass2').value){$('bk-err').textContent='The two passwords are different.';return}
       try{const text=await buildBackupFile(pw),d=new Date().toISOString().slice(0,10);$('modal').close();
         await saveFile(new Blob([text],{type:'application/json'}),'Money-status-backup-'+d+'.json','backup');
         S.lastBackup=new Date().toISOString();store.set();if(S.page==='data')render()}
       catch(e){$('bk-err').textContent='The backup could not be made: '+e.message}
     }}]);
  };
  if(!$('bk-load'))return;
  $('bk-load').onclick=()=>$('bk-file').click();
  $('bk-file').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    let text;try{text=await f.text()}catch(err){toast('That file could not be read.');return}
    modal('Restore backup',`<label class="fld"><span>Backup password</span><input id="br-pass" type="password" autocomplete="off"></label><p class="footnote" id="br-err" style="color:var(--red)"></p>`,
     [{label:'Cancel',run:()=>$('modal').close()},{label:'Open',primary:true,run:async()=>{
       let p;try{p=await readBackupFile(text,$('br-pass').value)}catch(err){$('br-err').textContent=err.message;return}
       const sm=planSummary(p);
       modal('Replace everything on this device?',`<p>Backup from <strong>${esc(new Date(p.savedAt).toLocaleString('en-GB'))}</strong>.</p>
        <p class="sub">${p.export?`Export: ${esc(p.export.filename)}, imported ${esc(new Date(p.export.importedAt).toLocaleDateString('en-GB'))}.`:'No export.'} ${(p.history||[]).length} earlier export${(p.history||[]).length===1?'':'s'}, ${sm.budgets} budget version${sm.budgets===1?'':'s'}, ${sm.goals} goal${sm.goals===1?'':'s'}, ${sm.commitments} commitment${sm.commitments===1?'':'s'}.</p>
        ${S.data&&!S.meta?.sample?notice('Your current data and plan on this device will be replaced. Save a backup of them first if you might need them.'):''}`,
        [{label:'Cancel',run:()=>$('modal').close()},{label:'Restore',primary:true,run:async()=>{
          try{await restoreBackup(p);$('modal').close();S.page=S.data?'overview':'data';render();toast('Backup restored.')}
          catch(err){toast('The backup could not be restored: '+err.message)}
        }}]);
     }}]);
  };
}

/* ---- currency and asset mix ---- */
function exposureCard(b){
  const by={},lia={};let assets=0;
  for(const r of b.rows){
    if(r.value===null)continue;
    const k=r.type==='SECURITY'?'Securities':String(r.currency).toUpperCase();
    if(r.group==='Asset'){by[k]=(by[k]||0)+r.value;assets+=r.value}
    else if(r.group==='Liability')lia[k]=(lia[k]||0)-r.value;
  }
  const keys=[...new Set([...Object.keys(by),...Object.keys(lia)])].sort((x,y)=>(by[y]||0)-(by[x]||0));
  const bar=(v,c)=>`<div class="track"><b style="width:${assets>0?Math.max(0,Math.min(100,v/assets*100)):0}%;background:${c}"></b></div>`;
  const mix=[['Cash and bank',b.cash,'var(--blue)'],['Investments',b.investments,'var(--teal)'],['Other assets',b.other,'var(--violet)']];
  return`<section class="card block"><div class="head"><div><h2>Where your money sits</h2><p class="sub">${esc(S.cur)} · as of ${fdate(b.asOf)}. Share of total assets.</p></div></div>
   <div class="grid even" style="margin-top:0"><div><h3>By currency</h3>${keys.map(k=>`<div class="share-row" style="grid-template-columns:82px minmax(0,1fr) 64px"><span>${esc(k)}</span>${bar(by[k]||0,'var(--blue)')}<span class="num">${pct(assets>0?(by[k]||0)/assets:null)}</span></div><p class="share-note" style="margin-left:94px">Assets ${fmt(by[k]||0)}${lia[k]?' · debts '+fmt(lia[k]):''} · net ${fmt((by[k]||0)-(lia[k]||0))}</p>`).join('')||'<p class="sub">No balances yet.</p>'}</div>
   <div><h3>By type</h3>${mix.map(([n,v,c])=>`<div class="share-row" style="grid-template-columns:110px minmax(0,1fr) 64px"><span>${n}</span>${bar(v,c)}<span class="num">${pct(assets>0?v/assets:null)}</span></div><p class="share-note" style="margin-left:122px">${fmt(v)}</p>`).join('')}</div></div></section>`;
}

/* ---- repeating payments ---- */
function activeRecurring(){return detectRecurring().filter(r=>!r.ignored)}
/* ---- debts ---- */
function amortize(balance,apr,pay){
  if(!(balance>0))return{months:0,interest:0};
  if(!(pay>0))return null;
  const r=apr/1200;let b=balance,m=0,interest=0;
  if(r>0&&pay<=b*r)return{never:true};
  while(b>0.005&&m<1200){const i=b*r;interest+=i;b=b+i-pay;m++;if(b<0)b=0}
  return{months:m,interest};
}
function loanList(){
  const ix=S.ix,b=balances(S.data,ix.latest,ix);
  return b.rows.filter(a=>a.group==='Liability'&&(a.type==='LIABILITY'||a.type==='LOAN')&&a.native<-0.005).map(a=>{
    const pays={};for(const l of ix.good)if(l.account===a.id&&l.amount>0){const k=l.date.slice(0,7);pays[k]=(pays[k]||0)+l.amount}
    const recent=Object.keys(pays).sort().slice(-6).map(k=>pays[k]);
    return{id:a.id,name:a.label,cur:a.currency,balance:-a.native,detected:recent.length?median(recent):0};
  });
}
function pDebt(){
  const ls=loanList(),L=S.ix.latest;
  const card=l=>{
    const cfg=S.plan.loans[l.id]||{},apr=+cfg.apr||0,pay=cfg.payment!=null&&cfg.payment!==''?+cfg.payment:l.detected,extra=+cfg.extra||0;
    const base=amortize(l.balance,apr,pay),fast=extra>0?amortize(l.balance,apr,pay+extra):null;
    let body;
    if(!(pay>0))body='<p class="sub">Add your monthly payment to see a payoff date.</p>';
    else if(base&&base.never)body=`<p class="sub" style="color:var(--red)">A payment of ${fmtIn(pay,l.cur,0)} does not cover the interest, so the balance never falls.</p>`;
    else body=`<p class="sub">At ${fmtIn(pay,l.cur,0)} a month${apr?' and '+apr+'% a year':''}: paid off <strong>${esc(fmonLong(addMonths(monthStart(L),base.months)))}</strong> (${base.months} months), interest about ${fmtIn(base.interest,l.cur,0)}.</p>${fast&&!fast.never?`<p class="sub">With ${fmtIn(extra,l.cur,0)} extra a month: ${esc(fmonLong(addMonths(monthStart(L),fast.months)))}, <span class="vchip good">▼ ${base.months-fast.months} months sooner</span> <span class="vchip good">▼ ${fmtIn(base.interest-fast.interest,l.cur,0)} less interest</span></p>`:''}`;
    return`<article class="goal"><div class="head" style="margin-bottom:6px"><h3>${esc(l.name)}</h3>${pill(l.cur,'')}</div><div class="goal-amt">${fmtIn(l.balance,l.cur,0)} <small class="muted">owed</small></div>${body}<p class="footnote">${cfg.payment!=null&&cfg.payment!==''?'Payment set by you.':l.detected>0?'Payment taken from your recent history.':''}</p><button class="btn small" data-loan="${esc(l.id)}">Edit terms</button></article>`;
  };
  $('ptab').innerHTML=`<section class="card"><div class="head"><div><h2>Debt payoff</h2><p class="sub">Loans and other debts with a balance. Add the interest rate and payment to see when each is paid off, and what extra payments would save.</p></div></div>${ls.length?`<div class="goals">${ls.map(card).join('')}</div>`:'<div class="empty">No loans with a balance found. Credit cards are not included here.</div>'}</section>`;
  document.querySelectorAll('[data-loan]').forEach(b=>b.onclick=()=>editLoan(ls.find(x=>x.id===b.dataset.loan)));
}
function editLoan(l){
  const cfg=S.plan.loans[l.id]||{};
  modal('Terms for '+l.name,`<div class="form-grid"><label class="fld"><span>Interest rate (% a year)</span><input id="ln-apr" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${cfg.apr??''}"></label>
   <label class="fld"><span>Monthly payment (${esc(l.cur)})</span><input id="ln-pay" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${cfg.payment??''}" placeholder="${l.detected?Math.round(l.detected):''}"></label>
   <label class="fld"><span>Extra each month (${esc(l.cur)})</span><input id="ln-extra" type="text" inputmode="decimal" autocomplete="off" data-num min="0" step="any" value="${cfg.extra??''}"></label></div>
   <p class="footnote">Leave the payment empty to use what your history shows${l.detected?' (about '+fmtIn(l.detected,l.cur,0)+')':''}. Interest is assumed to be charged monthly.</p>`,
   [{label:'Clear',run:()=>{delete S.plan.loans[l.id];savePlan();$('modal').close();render()}},{label:'Cancel',run:()=>$('modal').close()},{label:'Save',primary:true,run:()=>{
     const g=id=>{const v=$(id).value.trim();return v===''?null:+v},apr=g('ln-apr'),pay=g('ln-pay'),ex=g('ln-extra');
     if([apr,pay,ex].some(v=>v!==null&&(!Number.isFinite(v)||v<0))){toast('Use zero or positive numbers.');return}
     S.plan.loans[l.id]={apr:apr??0,payment:pay,extra:ex??0};savePlan();$('modal').close();render();
   }}]);
}

/* ---- year in review (PDF) ---- */
function yearBounds(){
  const ix=S.ix,y=S.per.mode==='year'?S.per.y:+ix.latest.slice(0,4),s=y+'-01-01',end=y+'-12-31',e=end>ix.latest?ix.latest:end;
  return{y,s,e,partial:end>ix.latest};
}
function yearModel(){
  const ix=S.ix,d=S.data,{y,s,e,partial}=yearBounds(),ps=shiftYear(s,-1),pe=shiftYear(e,-1),hasPrev=pe>=ix.earliest;
  const a=actual(d,s,e,ix),pa=hasPrev?actual(d,ps,pe,ix):null,b1=balances(d,e,ix),b0=balances(d,addDays(s,-1),ix),bp=hasPrev?balances(d,pe,ix):null;
  const V=(cur,prev,low)=>pa&&prev!==undefined?vd(cur-prev,low,'yoy'):null;
  const rows=[['Income',a.income,'row',pa?V(a.income,pa.income,false):null],['Spending',a.expense,'row',pa?V(a.expense,pa.expense,true):null],['Surplus or deficit',a.surplus,'total',pa?V(a.surplus,pa.surplus,false):null],
    ['Savings rate',pct(a.savingsRate),'check',pa&&a.savingsRate!==null&&pa.savingsRate!==null?(()=>{const pts=(a.savingsRate-pa.savingsRate)*100;return{dir:Math.abs(pts)<.05?'flat':pts>0?'up':'down',tone:Math.abs(pts)<.05?'flat':pts>0?'good':'bad',text:Math.abs(pts)<.05?'Unchanged':Math.abs(pts).toFixed(1)+' pts '+(pts>0?'above':'below')+' last year'}})():null],
    ['Net worth at '+fdate(e),b1.networth,'total',bp?V(b1.networth,bp.networth,false):null],['Net worth change over the year',b1.networth-b0.networth,'row',null]];
  const cats={},pcats={};
  for(const l of a.exLines){const k=catKey(l);cats[k]=(cats[k]||0)+l.value}
  if(pa)for(const l of pa.exLines){const k=catKey(l);pcats[k]=(pcats[k]||0)+l.value}
  const catRows=Object.entries(cats).sort((x,y)=>y[1]-x[1]).slice(0,14).map(([k,v])=>({label:k,v,cls:'sub',dec:0,mid:pct(a.expense>0?v/a.expense:null),vd:pa?vd(v-(pcats[k]||0),true,'yoy'):null}));
  const months=[];for(let m=monthStart(s);m<=e;m=addMonths(m,1)){const x=actual(d,m,endMonth(m)>e?e:endMonth(m),ix),sur=x.income-x.expense;months.push({label:fmonLong(m),v:x.income,cls:'sub',dec:0,mid:fmt(x.expense),vd:{dir:sur>=0?'up':'down',tone:Math.abs(conv(sur))<.5?'flat':sur>0?'good':'bad',text:fmt(Math.abs(sur))+(sur>=0?' saved':' overspent')}})}
  const big=a.exLines.slice().sort((p,q)=>q.value-p.value).slice(0,6).map(l=>({label:(l.description||'(no description)')+' · '+fdate(l.date),v:l.value,cls:'sub',dec:0}));
  return{y,s,e,partial,hasPrev,rows,catRows,months,big,a};
}
