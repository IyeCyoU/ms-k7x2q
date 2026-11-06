/* Money status service worker: keeps the app working offline. It never touches your data.
   Bump V on every release so old caches are dropped. */
const V='money-status-202611064';
const CORE=['./','index.html','manifest.webmanifest'];
const OPTIONAL=['icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(V).then(async c=>{
    await c.addAll(CORE);                                  // the app itself must cache
    await Promise.allSettled(OPTIONAL.map(u=>c.add(u)));   // a missing icon must never block install
  }));
  // No skipWaiting here: the page asks the user before switching to a new version.
});

self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  const isPage=r.mode==='navigate'||/\/(index\.html)?$/.test(new URL(r.url).pathname);
  const put=res=>{if(res&&res.ok){const copy=res.clone();caches.open(V).then(c=>c.put(r,copy))}return res};
  if(isPage){
    // Network first for the app page so updates arrive on first open; cache when offline.
    e.respondWith(fetch(r,{cache:'no-cache'}).then(put).catch(()=>caches.match(r,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))));
    return;
  }
  // Everything else: cache first, refresh in the background.
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>{
    const net=fetch(r).then(put).catch(()=>hit);
    return hit||net;
  }));
});
