'use strict';
/* ============================================================
   Appearance: templates, custom colours, type, spacing, corners
   ============================================================ */
const PRESETS={
  ledger:{name:'Ledger',note:'Navy and blue. The original look.',panel:'#0f1c33',accent:'#2f5be7',teal:'#0d9793',violet:'#7057d6'},
  ocean:{name:'Ocean',note:'Deep teal with a cool accent.',panel:'#0b2a33',accent:'#0e7490',teal:'#b7791f',violet:'#6d5bd0'},
  amethyst:{name:'Amethyst',note:'Ink purple, calm and clear.',panel:'#1d1533',accent:'#6d4bd6',teal:'#0d8f8b',violet:'#c2418d'},
  graphite:{name:'Graphite',note:'Neutral grey for a quiet look.',panel:'#1f2430',accent:'#4b5fd0',teal:'#3e8f8f',violet:'#8a6bc9'},
  sand:{name:'Sand',note:'Warm paper tones.',panel:'#2b2118',accent:'#a15c07',teal:'#0d7c86',violet:'#7a4fbf'},
  rose:{name:'Rose',note:'Wine and rose.',panel:'#2a1120',accent:'#b02a6b',teal:'#0d8f8b',violet:'#6d5bd0'},
  mono:{name:'Mono',note:'Black and white. Prints well.',panel:'#111111',accent:'#222222',teal:'#666666',violet:'#999999'}
};
const FONTS={serif:{label:'Classic serif',css:null},sans:{label:'Modern sans',css:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"},rounded:{label:'Rounded',css:"ui-rounded,'SF Pro Rounded','Hiragino Maru Gothic ProN',system-ui,sans-serif"},mono:{label:'Monospace',css:"ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"}};
const defaultLook=()=>({preset:'ledger',accent:'',panel:'',font:'serif',density:'comfortable',radius:'soft',variance:'gr'});
const isDefaultLook=l=>l.preset==='ledger'&&!l.accent&&!l.panel&&l.font==='serif'&&l.density==='comfortable'&&l.radius==='soft'&&l.variance==='gr';
const LOOK_VARS=['--bg','--surface','--soft','--line','--ink','--muted','--navy','--navy2','--blue','--teal','--violet','--on-accent','--good-bg','--good-fg','--bad-bg','--bad-fg','--green','--red','--hero-up','--hero-down','--hero-line','--pad','--rowpad','--gap','--r','--rs','--serif'];

const clampN=(x,a,b)=>Math.min(b,Math.max(a,x));
const HEX=/^#[0-9a-f]{6}$/i;
function h2rgb(h){const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
function rgb2h(r,g,b){return'#'+[r,g,b].map(v=>Math.round(clampN(v,0,255)).toString(16).padStart(2,'0')).join('')}
function h2hsl(hex){
  const[r,g,b]=h2rgb(hex).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;let h=0,s=0;
  if(d){s=d/(1-Math.abs(2*l-1));h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}
  return[h,s,l];
}
function hsl2h(h,s,l){
  h=((h%360)+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const[r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return rgb2h((r+m)*255,(g+m)*255,(b+m)*255);
}
function relLum(hex){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)},[r,g,b]=h2rgb(hex);return .2126*f(r)+.7152*f(g)+.0722*f(b)}
function contrastRatio(a,b){const x=relLum(a),y=relLum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function fitColor(hex,bg,min,lighten){let[h,s,l]=h2hsl(hex),c=hex,i=0;while(contrastRatio(c,bg)<min&&i<50){l=clampN(l+(lighten?.02:-.02),0,1);c=hsl2h(h,s,l);i++}return c}

/* Builds every colour and size from a template plus the person's own choices,
   and always keeps text readable whatever they pick. */
function lookTokens(look,dark){
  const P=PRESETS[look.preset]||PRESETS.ledger,t={};
  const rawPanel=HEX.test(look.panel)?look.panel:P.panel;
  let[h,s,l]=h2hsl(rawPanel);if(l>.22)l=.16;s=clampN(s,0,.7);
  const panel=hsl2h(h,s,l),s1=clampN(s*.5,.04,.3),acc0=HEX.test(look.accent)?look.accent:P.accent;
  if(!dark){
    t['--bg']=hsl2h(h,s1,.96);t['--surface']='#ffffff';t['--soft']=hsl2h(h,s1,.93);t['--line']=hsl2h(h,s1*.9,.88);
    t['--ink']=hsl2h(h,clampN(s,.15,.45),.15);t['--muted']=hsl2h(h,.14,.4);
    t['--navy']=panel;t['--navy2']=hsl2h(h,s,clampN(l+.07,0,.4));
    const acc=fitColor(acc0,'#ffffff',4.5,false);
    t['--blue']=acc;t['--teal']=fitColor(P.teal,'#ffffff',3,false);t['--violet']=fitColor(P.violet,'#ffffff',3,false);
    t['--on-accent']=contrastRatio(acc,'#ffffff')>=contrastRatio(acc,'#0b1322')?'#ffffff':'#0b1322';
  }else{
    const surf=hsl2h(h,s1,.115),nav=hsl2h(h,s,l*.62);
    t['--bg']=hsl2h(h,s1,.075);t['--surface']=surf;t['--soft']=hsl2h(h,s1,.16);t['--line']=hsl2h(h,s1,.22);
    t['--ink']=hsl2h(h,.3,.92);t['--muted']=hsl2h(h,.16,.68);
    t['--navy']=nav;t['--navy2']=hsl2h(h,s,l*.62+.07);
    const acc=fitColor(acc0,surf,4.5,true);
    t['--blue']=acc;t['--teal']=fitColor(P.teal,surf,3.5,true);t['--violet']=fitColor(P.violet,surf,3.5,true);
    t['--on-accent']=contrastRatio(acc,'#ffffff')>=contrastRatio(acc,'#0b1322')?'#ffffff':'#0b1322';
  }
  t['--hero-line']=fitColor(acc0,t['--navy'],5,true);
  if(look.variance==='bo'){
    if(!dark)Object.assign(t,{'--good-bg':'#dbeafe','--good-fg':'#1d4ed8','--bad-bg':'#ffe8d1','--bad-fg':'#9a4506','--green':'#1d4ed8','--red':'#c2570c'});
    else Object.assign(t,{'--good-bg':'#1a2c50','--good-fg':'#9ec0ff','--bad-bg':'#3b2610','--bad-fg':'#f5b27a','--green':'#7fa8ff','--red':'#f59e5b'});
    Object.assign(t,{'--hero-up':'#93c5fd','--hero-down':'#fdba74'});
  }
  if(look.density==='compact')Object.assign(t,{'--pad':'14px','--rowpad':'8px','--gap':'14px'});
  if(look.radius==='sharp')Object.assign(t,{'--r':'4px','--rs':'3px'});
  else if(look.radius==='round')Object.assign(t,{'--r':'20px','--rs':'14px'});
  if(FONTS[look.font]&&FONTS[look.font].css)t['--serif']=FONTS[look.font].css;
  return t;
}
const osDark=()=>!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
const isDarkNow=()=>S.theme==='dark'||(S.theme==='auto'&&osDark());
function applyLook(){
  const st=document.documentElement.style;LOOK_VARS.forEach(k=>st.removeProperty(k));
  if(!isDefaultLook(S.look)){const t=lookTokens(S.look,isDarkNow());for(const k in t)st.setProperty(k,t[k])}
  const m=document.querySelector('meta[name="theme-color"]');
  if(m)m.setAttribute('content',isDefaultLook(S.look)?'#0f1c33':(getComputedStyle(document.documentElement).getPropertyValue('--navy').trim()||'#0f1c33'));
}
if(window.matchMedia)try{window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyLook())}catch(e){}

function openAppearance(){
  const L=S.look,P=PRESETS[L.preset]||PRESETS.ledger,keep=$('modal-body').scrollTop;
  const seg=(key,opts,cur)=>`<div class="seg" role="group" aria-label="${key}">${opts.map(([v,t])=>`<button data-lk="${key}" data-v="${v}" aria-pressed="${cur===v}">${t}</button>`).join('')}</div>`;
  const acc=HEX.test(L.accent)?L.accent:P.accent,pan=HEX.test(L.panel)?L.panel:P.panel;
  modal('Appearance',`
   <h3>Mode</h3>${seg('mode',[['auto','Match my device'],['light','Light'],['dark','Dark']],S.theme)}
   <h3 class="lk-h">Theme templates</h3>
   <div class="tiles">${Object.entries(PRESETS).map(([k,p])=>`<button class="tile" data-preset="${k}" aria-pressed="${L.preset===k}"><span class="sw"><i style="background:${p.panel}"></i><i style="background:${p.accent}"></i><i style="background:${p.teal}"></i><i style="background:${p.violet}"></i></span><strong>${p.name}</strong><small>${p.note}</small></button>`).join('')}</div>
   <h3 class="lk-h">Your own colours</h3>
   <div class="form-grid"><label class="fld"><span>Accent (buttons, links, charts)</span><span class="colorrow"><input type="color" id="lk-accent" value="${acc}"><button class="btn small" id="lk-accent-reset" ${L.accent?'':'disabled'}>Use template colour</button></span></label>
   <label class="fld"><span>Sidebar and headline panel</span><span class="colorrow"><input type="color" id="lk-panel" value="${pan}"><button class="btn small" id="lk-panel-reset" ${L.panel?'':'disabled'}>Use template colour</button></span></label></div>
   <p class="footnote" style="margin-top:8px">Colours are adjusted automatically when needed so text stays easy to read.</p>
   <h3 class="lk-h">Headings and big numbers</h3>${seg('font',Object.entries(FONTS).map(([k,f])=>[k,f.label]),L.font)}
   <div class="form-grid" style="margin-top:6px"><div><h3 class="lk-h">Spacing</h3>${seg('density',[['comfortable','Comfortable'],['compact','Compact']],L.density)}</div><div><h3 class="lk-h">Corners</h3>${seg('radius',[['sharp','Sharp'],['soft','Soft'],['round','Round']],L.radius)}</div></div>
   <h3 class="lk-h">Better and worse colours</h3>${seg('variance',[['gr','Green and red'],['bo','Blue and orange (colour-blind friendly)']],L.variance)}
   <p class="vlegend" style="margin-top:10px">Spending <span class="vchip bad">▲ 120 above avg</span> <span class="vchip good">▼ 85 below avg</span> Triangles always show the direction, whatever the colours.</p>`,
   [{label:'Reset to default',run:()=>{S.look=defaultLook();applyLook();store.set();openAppearance()}},{label:'Done',primary:true,run:()=>$('modal').close()}]);
  const set=(patch)=>{Object.assign(S.look,patch);applyLook();store.set();openAppearance()};
  document.querySelectorAll('[data-lk]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.lk,v=b.dataset.v;
    if(k==='mode'){S.theme=v;applyTheme();store.set();openAppearance();if(S.data)render()}else set({[k]:v});
  });
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>set({preset:b.dataset.preset,accent:'',panel:''}));
  const live=(id,key)=>{const el=$(id);el.oninput=()=>{S.look[key]=el.value;applyLook()};el.onchange=()=>{store.set();openAppearance()}};
  live('lk-accent','accent');live('lk-panel','panel');
  $('lk-accent-reset').onclick=()=>set({accent:''});$('lk-panel-reset').onclick=()=>set({panel:''});
  $('modal-body').scrollTop=keep;
}

