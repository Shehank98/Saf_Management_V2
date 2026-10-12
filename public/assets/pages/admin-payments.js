
adminShell({active:'payments.html',title:'Payments & profit'});
let tab=P.get('tab')||'overview',range='30';
const allTrips=()=>TRIPS, payoutLines=()=>PAYOUT_LINES;
const RANGES=[['month','This month'],['30','Last 30 days'],['90','Last 90 days'],['all','All time']];
const inRange=d=>{const x=parseIso(d);if(range==='all')return true;if(range==='month')return x.getMonth()===TODAY.getMonth()&&x.getFullYear()===TODAY.getFullYear()&&x<=TODAY;return x>=addDays(TODAY,-(+range))&&x<=TODAY};
// Trips that ran count on their trip date; upcoming paid trips count on the day they were booked (costs estimated), fees kept from cancellations on the cancel day.
const when=t=>['Upcoming','Cancelled'].includes(t.status)?(t.bookedOn||t.date):t.date;
const counted=t=>['Completed','Started','Cancelled','Upcoming'].includes(t.status);
const done=()=>allTrips().filter(t=>counted(t)&&inRange(when(t)));
const received=()=>CUSTOMER_PAYMENTS.filter(r=>inRange(r.d)&&!r.pendingRefund).reduce((a,r)=>a+r.amt,0);
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'-';
const k=n=>n>=1e6?(n/1e6).toFixed(1)+'M':Math.round(n/1000)+'k';
function countUp(el,to,f=fmt){const t0=performance.now();const step=t=>{const p=Math.min(1,(t-t0)/900),e=1-Math.pow(1-p,3);el.textContent=f(to*e);if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
function shell(){
  $('#tabs').innerHTML=[['overview','Overview'],['trips','Profit per trip'],['payouts','Partner payouts'],['incoming','Customer payments']].map(([k,l])=>`<button data-k="${k}" class="${k===tab?'on':''}">${l}</button>`).join('');
  $$('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.k;render()});
  $('#range').innerHTML=RANGES.map(([k,l])=>`<button data-r="${k}" class="${k===range?'on':''}">${l}</button>`).join('');
  $$('#range button').forEach(b=>b.onclick=()=>{range=b.dataset.r;render()});
  $('#range').style.display=tab==='payouts'?'none':'';
}
function render(){shell();({overview,trips,payouts,incoming})[tab]()}
/* ---------- Overview ---------- */
function overview(){
  const T=done(),rev=T.reduce((a,t)=>a+t.revenue,0),cost=T.reduce((a,t)=>a+t.cost.total,0),prof=rev-cost,owed=payoutLines().filter(l=>!l.paid).reduce((a,l)=>a+l.amount,0);
  $('#pane').innerHTML=`<div class="kpis"><div class="kpi"><div class="l">Money received</div><div class="v" id="k0"></div><div class="d muted">card, cash and bank, after refunds</div></div><div class="kpi"><div class="l">Sales</div><div class="v" id="k1"></div><div class="d muted">${T.filter(t=>t.status!=='Upcoming').length} run · ${T.filter(t=>t.status==='Upcoming').length} upcoming</div></div><div class="kpi"><div class="l">Partner costs</div><div class="v" id="k2"></div><div class="d muted">jeeps, trackers, meals</div></div><div class="kpi hero"><div class="l">Profit</div><div class="v" id="k3"></div><div class="d muted">margin ${pct(prof,rev)}${T.some(t=>t.est)?' · upcoming costs estimated':''}</div></div><div class="kpi"><div class="l">Still owed to partners</div><div class="v" id="k4"></div><div class="d"><a href="#" id="gopay">Pay partners →</a></div></div></div>
  <div class="two"><div class="panel"><div class="ph"><h3>Revenue split by week</h3><span class="small muted">bar height = revenue</span></div><div class="pb"><div class="legend"><span><i style="background:var(--c-profit)"></i>Profit</span><span><i style="background:var(--c-cost)"></i>Partner costs</span></div><div class="chart" id="chart"></div><div class="xaxis" id="xaxis"></div></div></div>
  <div class="panel"><div class="ph"><h3>Profit by session</h3></div><div class="pb" id="bySes"></div><div class="ph" style="border-top:1px solid var(--line)"><h3>Private vs shared</h3></div><div class="pb" id="byKind"></div></div></div>`;
  countUp($('#k0'),received());countUp($('#k1'),rev);countUp($('#k2'),cost);countUp($('#k3'),prof);countUp($('#k4'),owed);
  $('#gopay').onclick=e=>{e.preventDefault();tab='payouts';render()};
  // weekly buckets (8 weeks ending today)
  const W=Array.from({length:8},(_,i)=>{const end=addDays(TODAY,-(7*(7-i))),start=addDays(end,-6);const ts=allTrips().filter(t=>counted(t)&&parseIso(when(t))>=start&&parseIso(when(t))<=end);const r=ts.reduce((a,t)=>a+t.revenue,0),c=ts.reduce((a,t)=>a+t.cost.total,0);return{start,end,r,c,p:r-c,n:ts.length}});
  const mx=Math.max(...W.map(w=>w.r),1),top=Math.ceil(mx/100000)*100000;
  $('#chart').innerHTML=[.5,1].map(f=>`<div class="grid" style="bottom:${f*100}%"><span>${k(top*f)}</span></div>`).join('')+W.map((w,i)=>`<div class="col" data-i="${i}" tabindex="0" aria-label="Week of ${w.start.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}: revenue ${fmt(w.r)}, profit ${fmt(w.p)}"><div class="seg2 cost" style="height:${w.c/top*100}%;animation-delay:${i*.05}s"></div><div class="seg2 prof" style="height:${Math.max(0,w.p)/top*100}%;animation-delay:${i*.05+.1}s"></div></div>`).join('');
  $('#xaxis').innerHTML=W.map(w=>`<span>${w.start.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>`).join('');
  const tip=$('#tip');$$('.chart .col').forEach(c=>{const w=W[+c.dataset.i];const show=e=>{tip.innerHTML=`<b>${w.start.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} - ${w.end.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</b><br>Revenue ${fmt(w.r)}<br>Partner costs ${fmt(w.c)}<br>Profit ${fmt(w.p)} (${pct(w.p,w.r)})<br>${w.n} trips`;const r=c.getBoundingClientRect();tip.style.left=Math.min(innerWidth-200,r.left)+'px';tip.style.top=(r.top-110)+'px';tip.classList.add('show')};c.onmouseenter=show;c.onfocus=show;c.onmouseleave=c.onblur=()=>tip.classList.remove('show')});
  const bar=(rows,el)=>{const m=Math.max(...rows.map(r=>r[1]),1);$(el).innerHTML=rows.map(([l,v,n],i)=>`<div class="hbar"><span>${l}<div class="tiny muted">${n} trips</div></span><div class="track"><span style="width:${Math.max(0,v)/m*100}%;animation-delay:${i*.08}s"></span></div><span class="num">${fmt(v)}</span></div>`).join('')};
  bar(Object.entries(SESS).map(([s,x])=>{const ts=T.filter(t=>t.ses===s);return[x.short,ts.reduce((a,t)=>a+t.profit,0),ts.length]}),'#bySes');
  bar(['Private','Shared'].map(kd=>{const ts=T.filter(t=>t.kind===kd);return[kd,ts.reduce((a,t)=>a+t.profit,0),ts.length]}),'#byKind');
}
/* ---------- Trips P&L ---------- */
function trips(){
  const T=done(),sum=f=>T.reduce((a,t)=>a+f(t),0);
  $('#pane').innerHTML=`<div class="panel"><div class="ph"><h3>Profit per trip</h3><span class="small muted">Trips run, upcoming paid trips (costs estimated) and fees kept from cancellations · tap a row</span></div><div class="tblw"><table class="t"><thead><tr><th>Date</th><th>Trip</th><th>Guests</th><th class="num">Revenue</th><th class="num">Jeep</th><th class="num">Tracker</th><th class="num">Meals/other</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead>
  <tbody>${T.map((t,i)=>`<tr data-c="${t.code}" style="animation:fade .3s ${Math.min(i,20)*.02}s both"><td>${shortDate(t.date)}</td><td><b class="mono">${t.code}</b><div class="tiny muted">${t.kind} · ${SESS[t.ses].short}${t.status==='Started'?' · <span style="color:var(--info)">in progress</span>':t.status==='Upcoming'?' · <span style="color:var(--warn)">upcoming · cost estimated</span>':t.status==='Cancelled'?' · <span style="color:var(--bad)">cancelled, fee kept</span>':''}</div></td><td>${t.guests}</td><td class="num">${fmt(t.revenue)}</td><td class="num">${fmt(t.cost.jeep)}</td><td class="num">${fmt(t.cost.guide)}</td><td class="num">${fmt(t.cost.meals+t.cost.cam)}</td><td class="num ${t.profit>=0?'pos':'neg'}"><b>${fmt(t.profit)}</b></td><td class="num">${pct(t.profit,t.revenue)}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No trips in this period</td></tr>'}</tbody>
  <tfoot><tr><td colspan="3">Total · ${T.length} trips</td><td class="num">${fmt(sum(t=>t.revenue))}</td><td class="num">${fmt(sum(t=>t.cost.jeep))}</td><td class="num">${fmt(sum(t=>t.cost.guide))}</td><td class="num">${fmt(sum(t=>t.cost.meals+t.cost.cam))}</td><td class="num">${fmt(sum(t=>t.profit))}</td><td class="num">${pct(sum(t=>t.profit),sum(t=>t.revenue))}</td></tr></tfoot></table></div></div>`;
  $$('[data-c]').forEach(r=>r.onclick=()=>tripDrawer(r.dataset.c));
}
function tripDrawer(code){const t=allTrips().find(x=>x.code===code),L=payoutLines().filter(l=>l.code===code);
  const w=v=>t.revenue?Math.max(0,v/t.revenue*100):0;
  openDrawer(`<div class="dh"><div><div class="mono" style="font-size:20px">${t.code}</div><div class="small muted">${t.kind} · ${nice(t.date)} · ${SESS[t.ses].name} · ${ppl(t.guests)}</div></div><button class="x" aria-label="Close">×</button></div>
  <div class="db"><div class="sec-t">Where the money went</div>
  <div style="display:flex;height:16px;border-radius:99px;overflow:hidden;gap:2px;margin:6px 0 10px">${[[t.cost.jeep,'var(--c-cost)'],[t.cost.guide,'color-mix(in srgb,var(--c-cost) 70%,var(--paper))'],[t.cost.meals+t.cost.cam,'color-mix(in srgb,var(--c-cost) 45%,var(--paper))'],[Math.max(0,t.profit),'var(--c-profit)']].map(([v,c])=>`<span style="width:${w(v)}%;background:${c};animation:growx .7s both"></span>`).join('')}</div>
  <dl class="dl"><dt>Revenue</dt><dd>${fmt(t.revenue)}</dd><dt>Jeep (${t.jeeps}×)</dt><dd>− ${fmt(t.cost.jeep)} · ${esc(vendorName(t.vendor))||'-'}</dd><dt>Tracker</dt><dd>− ${fmt(t.cost.guide)} · ${esc(vendorName(t.guide))||'-'}</dd><dt>Meals</dt><dd>− ${fmt(t.cost.meals)} (${t.mealsN} × ${fmt(SETTINGS.costs.mealCost)})</dd>${t.cost.cam?`<dt>Camera rental</dt><dd>− ${fmt(t.cost.cam)}</dd>`:''}<dt><b>Profit</b></dt><dd class="${t.profit>=0?'pos':'neg'}" style="font-size:18px">${fmt(t.profit)} · ${pct(t.profit,t.revenue)}</dd></dl>
  <div class="sec-t">Partner payments for this trip</div>${L.map(l=>`<div class="chk"><span>${l.paid?'✅':'⏳'}</span><span><b>${esc(vendorName(l.vendor))}</b><div class="tiny muted">${l.role}</div></span><span class="num">${fmt(l.amount)}<div class="tiny muted">${l.paid?'paid '+shortDate(l.paidAt)+' · '+l.ref:'unpaid'}</div></span></div>`).join('')||`<p class="small muted">${t.est?'Not run yet: costs above are estimated from Settings. Partner lines are created when the trip starts.':'No partner lines yet (trip not started).'}</p>`}
  </div><div class="df"><a class="btn" href="${t.kind==='Private'?'/admin/bookings?open='+t.code:'/admin/shared?open='+t.code}">Open booking</a></div>`)}
/* ---------- Partner payouts ---------- */
function payouts(){
  const L=payoutLines(),byV={};L.forEach(l=>{(byV[l.vendor]=byV[l.vendor]||[]).push(l)});
  const hist={};L.filter(l=>l.paid).forEach(l=>{const key=l.ref;(hist[key]=hist[key]||{ref:l.ref,vendor:l.vendor,at:l.paidAt,method:l.method,amount:0,n:0});hist[key].amount+=l.amount;hist[key].n++});
  $('#pane').innerHTML=`<div class="note" style="margin-bottom:14px">Partner lines are created automatically when a trip <b>starts</b> (driver scans the first ticket), using the fees in Settings. Pay them here; each partner gets an email with their statement.</div>
  <div class="pcards">${Object.entries(byV).map(([v,ls],i)=>{const un=ls.filter(l=>!l.paid),o=un.reduce((a,l)=>a+l.amount,0);const vv=VENDORS.find(x=>x.id===v)||{name:'Partner #'+v,type:''};return `<div class="pcard ${o?'':'zero'}" style="animation-delay:${i*.05}s"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${esc(vv.name)}</b><div class="tiny muted">${vv.type}</div></div>${o?`<span class="tag warn">${un.length} unpaid</span>`:'<span class="tag ok">All paid</span>'}</div>
    <div class="owed" style="margin:8px 0 2px">${fmt(o)}</div><div class="tiny muted">owed · paid this year ${fmt(ls.filter(l=>l.paid).reduce((a,l)=>a+l.amount,0))}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm ${o?'primary':''}" data-pay="${v}" ${o?'':'disabled'}>Pay ${o?fmt(o):''}</button><button class="btn sm" data-st="${v}">Statement</button></div></div>`}).join('')||'<div class="empty">No partner lines yet. They appear when a trip starts.</div>'}</div>
  <div class="panel" style="margin-top:16px"><div class="ph"><h3>Payout history</h3></div><div class="tblw"><table class="t"><thead><tr><th>Paid on</th><th>Reference</th><th>Partner</th><th>Method</th><th>Lines</th><th class="num">Amount</th></tr></thead><tbody>${Object.values(hist).sort((a,b)=>b.at.localeCompare(a.at)).map(h=>`<tr class="${h.fresh?'paid-anim':''}"><td>${shortDate(h.at)}</td><td class="mono">${h.ref}</td><td>${esc(vendorName(h.vendor))}</td><td>${h.method}</td><td>${h.n}</td><td class="num">${fmt(h.amount)}</td></tr>`).join('')}</tbody></table></div></div>`;
  $$('[data-pay]').forEach(b=>b.onclick=()=>payModal(b.dataset.pay));
  $$('[data-st]').forEach(b=>b.onclick=()=>statement(b.dataset.st));
}
function payModal(v){const un=payoutLines().filter(l=>l.vendor===v&&!l.paid);const vv=VENDORS.find(x=>x.id===v);
  openModal(`<h3>Pay ${esc(vv.name)}</h3><p class="small muted">Tick the trips you're paying for.</p><div id="lines">${un.map(l=>`<label class="chk"><input type="checkbox" checked data-id="${l.id}" data-a="${l.amount}"><span>${shortDate(l.date)} · <b class="mono">${l.code}</b><div class="tiny muted">${l.role} · ${SESS[l.ses].short}</div></span><span class="num">${fmt(l.amount)}</span></label>`).join('')}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><div class="field"><label for="pm">Method</label><select class="inp" id="pm"><option>Bank transfer</option><option>Cash</option><option>Cheque</option></select></div><div class="field"><label for="pr">Reference</label><input class="inp" id="pr" value="PO-${String(Date.now()).slice(-6)}"></div></div>
  <p style="display:flex;justify-content:space-between;font-weight:800;font-size:17px"><span>Total</span><span id="pt"></span></p>
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn ok" id="pOk">Mark as paid &amp; email partner</button></div>`);
  const tot=()=>{$('#pt').textContent=fmt($$('#lines input:checked').reduce((a,i)=>a+ +i.dataset.a,0))};$$('#lines input').forEach(i=>i.onchange=tot);tot();
  $('#pOk').onclick=async e=>{const sel=$$('#lines input:checked');if(!sel.length)return;const tot=$('#pt').textContent;
    if(await act(()=>POST('/api/admin/payouts',{partnerId:+v,lineIds:sel.map(i=>+i.dataset.id),method:$('#pm').value,reference:$('#pr').value}),`${tot} paid to ${esc(vv.name)} · statement emailed`,e.target)){closeModal();render()}}}
function statement(v){const ls=payoutLines().filter(l=>l.vendor===v).sort((a,b)=>b.date.localeCompare(a.date));const vv=VENDORS.find(x=>x.id===v)||{name:'Partner #'+v,type:''};
  openDrawer(`<div class="dh"><div><b style="font-size:19px">${esc(vv.name)}</b><div class="small muted">Statement · ${vv.type}</div></div><button class="x" aria-label="Close">×</button></div><div class="db"><table class="t"><thead><tr><th>Date</th><th>Trip</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${ls.map(l=>`<tr><td>${shortDate(l.date)}</td><td class="mono">${l.code}<div class="tiny muted">${l.role}</div></td><td class="num">${fmt(l.amount)}</td><td>${l.paid?`<span class="tag ok">Paid</span><div class="tiny muted">${l.ref}</div>`:'<span class="tag warn">Unpaid</span>'}</td></tr>`).join('')}</tbody></table></div><div class="df"><button class="btn" id="stCsv">⬇ Download CSV</button></div>`);
  $('#stCsv').onclick=()=>{const rows=ls.map(l=>[l.date,l.code,l.role,l.amount,l.paid?'paid':'unpaid',l.ref].join(','));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['date,trip,role,amount,status,reference\n'+rows.join('\n')],{type:'text/csv'}));a.download=`statement-${(vv.name||'partner').replace(/\W+/g,'-')}.csv`;a.click()}}
/* ---------- Customer payments ---------- */
function incoming(){
  const rows=CUSTOMER_PAYMENTS.filter(r=>r.pendingRefund||inRange(r.d));
  const due=BOOKINGS.filter(b=>['Confirmed','Deposit paid','Request','Started'].includes(b.status)).map(b=>({b,bal:b.total-b.paid})).filter(x=>x.bal>0).sort((a,b)=>a.b.date.localeCompare(b.b.date));
  $('#pane').innerHTML=`<div class="two" style="margin-top:0"><div class="panel"><div class="ph"><h3>Money received</h3></div><div class="tblw"><table class="t"><thead><tr><th>Date</th><th>Booking</th><th>Guest</th><th>Type</th><th class="num">Amount</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${shortDate(r.d)}</td><td class="mono">${esc(r.code)}</td><td>${esc(r.who)}</td><td>${esc(r.kind)}${r.pendingRefund?` <button class="btn sm" data-rf="${r.id}">Mark refunded</button>`:''}</td><td class="num ${r.amt<0?'neg':''}">${fmt(r.amt)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No payments yet</td></tr>'}</tbody></table></div></div>
  <div class="panel"><div class="ph"><h3>To collect at pickup</h3><span class="tag warn">${fmt(due.reduce((a,x)=>a+x.bal,0))}</span></div><div class="pb">${due.map(({b,bal})=>`<div class="chk"><span>${b.status==='Request'?'\u23f3':'\ud83d\ude99'}</span><span><b class="mono">${b.code}</b> \u00b7 ${esc(b.name)}<div class="tiny muted">${shortDate(b.date)} ${SESS[b.ses].short} \u00b7 driver: ${esc(vendorName(b.vendor))||'not assigned'}</div></span><span class="num">${fmt(bal)}</span></div>`).join('')||'<div class="empty">Nothing to collect</div>'}</div></div></div>`;
  $$('[data-rf]').forEach(b=>b.onclick=async()=>{if(await act(()=>POST(`/api/admin/payments/${b.dataset.rf}/refunded`),'Marked as refunded'))render()});
}
$('#csv').onclick=()=>{const T=done();const head='date,trip,type,session,guests,revenue,jeep_cost,tracker_cost,meals_other_cost,profit\n';const body=T.map(t=>[t.date,t.code,t.kind,t.ses,t.guests,t.revenue,t.cost.jeep,t.cost.guide,t.cost.meals+t.cost.cam,t.profit].join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([head+body],{type:'text/csv'}));a.download=`trips-profit-${range}.csv`;a.click();toast('CSV downloaded')};
render();

function onDataChanged(){render()}
