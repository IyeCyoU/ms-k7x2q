'use strict';
/* ============================================================
   Charts (hand-drawn SVG, sized to their container)
   ============================================================ */
function barChart(w,spec){
  const rows=spec.rows,series=spec.series,H=spec.h||230,L=44,R=8,T=12,B=28;
  const vals=rows.flatMap(r=>series.map(s=>r[s.key])).filter(Number.isFinite);
  if(!vals.length)return'<div class="empty">No values for this period.</div>';
  let min=Math.min(0,...vals),max=Math.max(1,...vals);const pad=(max-min)*.08;max+=pad;if(min<0)min-=pad;
  const y=v=>T+(max-v)/(max-min)*(H-T-B),step=(w-L-R)/Math.max(1,rows.length),bw=Math.max(4,Math.min(26,step/(series.length+.8)));
  let svg=`<svg viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(spec.label)}">`;
  for(let i=0;i<5;i++){const v=min+(max-min)*i/4;svg+=`<line class="gl" x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${compact(v)}</text>`}
  const every=Math.max(1,Math.ceil(rows.length/Math.max(1,Math.floor((w-L)/52))));
  rows.forEach((r,i)=>{
    const cx=L+step*i+step/2;
    series.forEach((s,j)=>{
      const v=r[s.key];if(!Number.isFinite(v))return;
      const yy=Math.min(y(v),y(0)),hh=Math.max(1,Math.abs(y(v)-y(0)));
      svg+=`<rect class="bar ${s.cls}" ${spec.click?`data-month="${r.month}" tabindex="0" role="button" aria-label="Open ${esc(fmon(r.month))}"`:''}${spec.tip?` data-tip="${esc(spec.tip(r))}"`:''} x="${cx-series.length*bw/2+j*bw+.5}" y="${yy}" width="${bw-1.5}" height="${hh}" rx="2"><title>${esc(fmon(r.month)+' · '+s.label+': '+S.cur+' '+fmt(v))}</title></rect>`;
    });
    if(i%every===0)svg+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${esc(fmon(r.month))}</text>`;
  });
  return svg+'</svg>';
}
function lineChart(w,spec){
  const pts=spec.points,H=spec.h||190,L=46,R=10,T=12,B=26;
  if(pts.length<2)return'<div class="empty" style="padding:24px 0">Net worth history appears once there are two months of data.</div>';
  const vs=pts.map(p=>p.v).concat(Number.isFinite(spec.ref)?[spec.ref]:[]);let min=Math.min(...vs),max=Math.max(...vs);const pad=(max-min||Math.abs(max)||1)*.12;min-=pad;max+=pad;
  const x=i=>L+i*(w-L-R)/(pts.length-1),y=v=>T+(max-v)/(max-min)*(H-T-B);
  const id=spec.id||'nw';
  let svg=`<svg class="${spec.tone==='light'?'lc-light':''}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(spec.label)}" data-w="${w}">`;
  for(let i=0;i<4;i++){const v=min+(max-min)*i/3;svg+=`<line class="gl" x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${compact(v)}</text>`}
  const base=H-B;
  if(Number.isFinite(spec.ref))svg+=`<line class="ref" x1="${L}" x2="${w-R}" y1="${y(spec.ref)}" y2="${y(spec.ref)}"/><text x="${w-R-4}" y="${y(spec.ref)-5}" text-anchor="end" class="ref-t">Reserve</text>`;
  svg+=`<path class="nw-area" d="M${x(0)},${base} ${pts.map((p,i)=>'L'+x(i)+','+y(p.v)).join(' ')} L${x(pts.length-1)},${base}Z"/>`;
  svg+=`<path class="nw-line" d="${pts.map((p,i)=>(i?'L':'M')+x(i)+','+y(p.v)).join(' ')}"/>`;
  const every=Math.max(1,Math.ceil(pts.length/Math.max(1,Math.floor((w-L)/58))));
  pts.forEach((p,i)=>{if(i%every===0||i===pts.length-1&&every===1)svg+=`<text x="${x(i)}" y="${H-7}" text-anchor="middle">${esc(fmon(p.month))}</text>`});
  svg+=`<line class="nw-guide" id="${id}-guide" x1="0" x2="0" y1="${T}" y2="${base}" style="display:none"/><circle class="nw-dot" id="${id}-dot" r="5" cx="0" cy="0" style="display:none"/>`;
  svg+=`<rect id="${id}-hit" x="${L}" y="${T}" width="${w-L-R}" height="${base-T}" fill="transparent"/>`;
  return svg+'</svg>';
}
function legend(series){return`<div class="legend">${series.map(s=>`<span><i class="${s.cls}" style="background:var(--${s.color})"></i>${esc(s.label)}</span>`).join('')}</div>`}
function paintCharts(){
  document.querySelectorAll('[data-chart]').forEach(el=>{
    const spec=S.charts[el.dataset.chart];if(!spec)return;
    const w=Math.max(280,Math.floor(el.clientWidth));
    el.innerHTML=spec.type==='line'?lineChart(w,spec):barChart(w,spec);
    if(spec.type==='line'){
      const id=spec.id||'nw',svg=el.querySelector('svg'),hit=el.querySelector('#'+id+'-hit');if(!svg||!hit)return;
      const pts=spec.points,L=46,R=10,H=spec.h||190,T=12,B=26,readout=$(id+'-read');
      const move=ev=>{
        const rect=svg.getBoundingClientRect(),px=(ev.clientX-rect.left)*(w/rect.width);
        const i=Math.max(0,Math.min(pts.length-1,Math.round((px-L)/((w-L-R)/(pts.length-1)))));
        const xx=L+i*(w-L-R)/(pts.length-1);
        const vs=pts.map(p=>p.v).concat(Number.isFinite(spec.ref)?[spec.ref]:[]);let mn=Math.min(...vs),mx=Math.max(...vs);const pad=(mx-mn||Math.abs(mx)||1)*.12;mn-=pad;mx+=pad;
        const yy=T+(mx-pts[i].v)/(mx-mn)*(H-T-B);
        const g=$(id+'-guide'),d=$(id+'-dot');g.setAttribute('x1',xx);g.setAttribute('x2',xx);g.style.display='';d.setAttribute('cx',xx);d.setAttribute('cy',yy);d.style.display='';
        if(readout)readout.textContent=fmonLong(pts[i].month)+' · '+S.cur+' '+fmt(pts[i].v);
      };
      const leave=()=>{$(id+'-guide').style.display='none';$(id+'-dot').style.display='none';if(readout)readout.textContent=spec.rest||''};
      hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);hit.addEventListener('pointerleave',leave);
    }
  });
  document.querySelectorAll('[data-month]').forEach(el=>{
    const go=()=>{const m=el.dataset.month;S.per.mode='month';S.per.y=+m.slice(0,4);S.per.m=+m.slice(5,7);render()};
    el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}};
  });
}

