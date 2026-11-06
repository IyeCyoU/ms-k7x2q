/* Money status service worker: keeps the app working offline. It never touches your data.
   The deploy workflow stamps V with a new value on every release, so old caches are dropped. */
const V='money-status-dev';
const CORE=['./','index.html','manifest.webmanifest','css/app.css',
  'js/01-engine.js','js/02-state.js','js/03-charts.js','js/04-pages.js','js/05-plan.js','js/06-appearance.js',
  'js/07-extras.js','js/08-controls.js','js/09-planning.js','js/10-shell.js','js/99-sw-register.js'];
const OPTIONAL=['icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(V).then(async c=>{
    await c.addAll(CORE.map(u=>new Request(u,{cache:'reload'})));   // the app itself must cache, fresh from the network
    await Promise.allSettled(OPTIONAL.map(u=>c.add(u)));            // a missing icon must never block install
  }));
  // No skipWaiting here: the page asks the user before switching to a new version.
});

self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

/* Network first for app files (so the page and its scripts are always the same release),
   with a short timeout on slow connections, then the offline copy. Icons: cache first. */
const TIMEOUT_MS=4000;
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  if(/\/icons\//.test(u.pathname)){
    e.respondWith(caches.match(r).then(hit=>hit||fetch(r)));
    return;
  }
  e.respondWith((async()=>{
    const cache=await caches.open(V);
    const net=fetch(r,{cache:'no-cache'}).then(res=>{if(res&&res.ok)cache.put(r,res.clone());return res});
    const timer=new Promise(res=>setTimeout(res,TIMEOUT_MS));
    try{
      const res=await Promise.race([net,timer.then(()=>{throw new Error('slow')})]);
      if(res)return res;
    }catch(err){}
    const hit=await cache.match(r,{ignoreSearch:true})||(r.mode==='navigate'&&await cache.match('index.html'));
    return hit||net;   // nothing cached: keep waiting for the network
  })());
});
