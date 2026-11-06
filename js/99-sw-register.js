if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load',()=>{
    let reloading=false;
    let wantReload=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(wantReload&&!reloading){reloading=true;location.reload()}});
    const offer=w=>{
      if(!w||!navigator.serviceWorker.controller)return;   // first install: nothing to replace
      document.querySelector('.sw-update')?.remove();
      const el=document.createElement('div');el.className='toast sw-update';el.setAttribute('role','status');
      el.append('A new version is ready. ');
      const b=document.createElement('button');b.type='button';b.textContent='Reload';
      b.style.cssText='margin-left:8px;background:#fff;color:#0f1c33;border:0;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer';
      b.onclick=()=>{wantReload=true;w.postMessage('skipWaiting')};
      el.append(b);document.body.append(el);
    };
    navigator.serviceWorker.register('sw.js').then(reg=>{
      if(reg.waiting)offer(reg.waiting);
      reg.addEventListener('updatefound',()=>{const w=reg.installing;w&&w.addEventListener('statechange',()=>{if(w.state==='installed')offer(w)})});
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{})});
    }).catch(()=>{});
  });
}
