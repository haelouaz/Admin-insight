/* Page Usage des tableaux de bord — chargée par index.html quand le tableau de bord contient la feuille « Use_WB ».
   Aucune donnée dans ce fichier : tout est lu en direct dans Admin Insights (TS Events, « Access View »). */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n||0).toLocaleString('fr-FR');
const low = s => String(s||'').trim().toLowerCase();
const DAY = 864e5;
const dfr = t => t ? new Date(t).toLocaleDateString('fr-FR') : '—';
const MO = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

const GR = {
  D:{l:'Jour',     n:90, sheet:'Use_D', all:'Use_D_All', hint:'90 derniers jours'},
  W:{l:'Semaine',  n:52, sheet:'Use_W', all:'Use_W_All', hint:'52 dernières semaines'},
  M:{l:'Mois',     n:13, sheet:'Use_M', all:'Use_M_All', hint:'13 derniers mois'},
  Q:{l:'Trimestre',n:5,  sheet:'Use_Q', all:'Use_Q_All', hint:'5 derniers trimestres'}
};
const WIN = {'7':'7 j','30':'30 j','90':'90 j','365':'12 mois'};
const MET = {u:'Visiteurs uniques', v:'Visites'};
const st = {g:'W', m:'u', w:'30', q:'', wb:null, view:null, sort:null};
let WB=[], SER={}, DET={}, ERR=[];

/* ---------- lecture (toujours séquentielle) ---------- */
let queue=Promise.resolve();
const serial = fn => { const p=queue.then(fn,fn); queue=p.catch(()=>{}); return p; };
const dash = () => tableau.extensions.dashboardContent.dashboard;
const W = n => dash().worksheets.find(w=>w.name===n);
async function readTable(ws){
  if(ws.getSummaryDataReaderAsync){ const r=await ws.getSummaryDataReaderAsync(undefined,{ignoreSelection:true}); const t=await r.getAllPagesAsync(); await r.releaseAsync(); return t; }
  return ws.getSummaryDataAsync({maxRows:0, ignoreSelection:true});
}
const rd = n => serial(async()=>{ const w=W(n); if(!w) return null; try{ return await readTable(w); }catch(e){ ERR.push(n+' : '+(e&&e.message||e)); return null; } });
const cols = t => { const n=t.columns.map(c=>low(c.fieldName)); const f=(key,ex)=>n.findIndex(x=>ex? x===key : x.includes(key)); return f; };
const v = (row,i) => { if(i<0) return null; const c=row[i]; const x=c.value; return (x==null||x==='%null%'||c.formattedValue==='Null')?null:x; };
const toT = x => { if(x==null||x==='') return null; if(x instanceof Date) return x.getTime(); const t=Date.parse(String(x).replace(' ','T')); return isNaN(t)?null:t; };
const num = x => x==null ? 0 : +x || 0;
// mesures : visiteurs uniques = CNTD(...) ; visites = SUM(...)
const isU = s => /^(cntd|countd|compte distinct|nombre distinct)/.test(s) || s.includes('cntd(') ;
const isV = s => /^(sum|somme)/.test(s) || s.includes('sum(');

async function loadWB(){
  const t=await rd('Use_WB'); if(!t) throw new Error(ERR.join(' | ')||'Use_WB illisible');
  const n=t.columns.map(c=>low(c.fieldName)); const at=(pred)=>n.findIndex(pred);
  const I={wb:at(x=>x==='workbook name'), p:at(x=>x==='project name'||x==='item project name'), o:at(x=>x.includes('owner')),
    u7:at(x=>x.includes('visiteur 7')), u30:at(x=>x.includes('visiteur 30')), u90:at(x=>x.includes('visiteur 90')), u365:at(x=>isU(x)&&x.includes('actor user name')),
    v7:at(x=>x.includes('visites 7')), v30:at(x=>x.includes('visites 30')), v90:at(x=>x.includes('visites 90')), v365:at(x=>isV(x)&&(x.includes('number of')||x.includes('nombre'))),
    last:at(x=>x.includes('event date'))};
  const by={};
  t.data.forEach(r=>{ const w=v(r,I.wb); if(!w) return; const x=by[w]||(by[w]={wb:w,p:v(r,I.p)||'—',o:v(r,I.o)||'',u:{},vv:{},last:null});
    ['7','30','90','365'].forEach(k=>{ x.u[k]=Math.max(x.u[k]||0,num(v(r,I['u'+k]))); x.vv[k]=(x.vv[k]||0)+num(v(r,I['v'+k])); });
    const l=toT(v(r,I.last)); if(l&&(!x.last||l>x.last)) x.last=l; });
  WB=Object.values(by);
}
async function loadSeries(g){
  if(SER[g]) return SER[g];
  const G=GR[g]; const ta=await rd(G.all), tw=await rd(G.sheet);
  const parse=(t)=>{ if(!t) return []; const n=t.columns.map(c=>low(c.fieldName)); const pi=n.findIndex(x=>['jour','semaine','mois','trimestre'].includes(x));
    const wi=n.indexOf('workbook name'), vi=n.findIndex(isV); let ui=n.findIndex(isU);
    if(ui<0) ui=n.findIndex((x,i)=>i!==pi&&i!==wi&&i!==vi&&x.includes('actor'));
    if(ui<0) ui=n.findIndex((x,i)=>i!==pi&&i!==wi&&i!==vi);
    window.__USE_COLS=(window.__USE_COLS||{}); window.__USE_COLS[t.name||n.join('|')]=n;
    return t.data.map(r=>({k:String(v(r,pi)||''), wb:wi>=0?v(r,wi):null, u:num(v(r,ui)), v:num(v(r,vi))})).filter(x=>x.k); };
  const all=parse(ta), per=parse(tw); const byWb={};
  per.forEach(x=>{ (byWb[x.wb]||(byWb[x.wb]={}))[x.k]={u:x.u,v:x.v}; });
  const site={}; all.forEach(x=>site[x.k]={u:x.u,v:x.v});
  const keys=periods(g, Object.keys(site).concat(per.map(x=>x.k)));
  return SER[g]={keys, site, byWb};
}
async function loadDetail(wb){
  if(DET[wb]) return DET[wb];
  const ws=W('Use_Detail'); if(!ws) return null;
  return serial(async()=>{
    try{ await ws.applyFilterAsync('Workbook Name',[wb],tableau.FilterUpdateType.Replace); }catch(e){ ERR.push('Filtre Use_Detail : '+(e&&e.message||e)); return null; }
    let t; try{ t=await readTable(ws); }catch(e){ ERR.push('Use_Detail : '+(e&&e.message||e)); return null; }
    const n=t.columns.map(c=>low(c.fieldName)); const at=p=>n.findIndex(p);
    const I={wb:at(x=>x==='workbook name'), it:at(x=>x==='item name'), u:at(x=>x==='actor user name'),
      v7:at(x=>x.includes('visites 7')), v30:at(x=>x.includes('visites 30')), v90:at(x=>x.includes('visites 90')), v365:at(x=>isV(x)&&(x.includes('number of')||x.includes('nombre'))), last:at(x=>x.includes('event date'))};
    const rows=t.data.map(r=>({wb:v(r,I.wb), it:v(r,I.it)||'—', u:v(r,I.u)||'—', vv:{'7':num(v(r,I.v7)),'30':num(v(r,I.v30)),'90':num(v(r,I.v90)),'365':num(v(r,I.v365))}, last:toT(v(r,I.last))})).filter(x=>x.wb===wb);
    return DET[wb]=rows;
  });
}

/* ---------- périodes ---------- */
const pad = n => String(n).padStart(2,'0');
const ymd = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function periods(g, seen){
  const now=new Date(); const out=[];
  if(g==='D'){ for(let i=GR.D.n-1;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); out.push(ymd(d)); } return out; }
  if(g==='M'){ for(let i=GR.M.n-1;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); out.push(d.getFullYear()+'-'+pad(d.getMonth()+1)); } return out; }
  if(g==='Q'){ let y=now.getFullYear(), q=Math.floor(now.getMonth()/3)+1; for(let i=0;i<GR.Q.n;i++){ out.unshift(y+'-T'+q); q--; if(!q){q=4;y--;} } return out; }
  // semaines : on part des débuts de semaine vus dans les données (règle de début de semaine du site), complétés à 7 jours d’écart
  const ks=[...new Set(seen)].filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  let last = ks.length ? new Date(ks[ks.length-1]+'T00:00:00') : (()=>{ const d=new Date(now); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; })();
  while((now-last)/DAY>=7) last=new Date(last.getTime()+7*DAY);
  for(let i=GR.W.n-1;i>=0;i--){ const d=new Date(last); d.setDate(d.getDate()-7*i); out.push(ymd(d)); }
  return out;
}
function pstart(g,k){ if(g==='D'||g==='W') return new Date(k+'T00:00:00').getTime(); if(g==='M') return new Date(+k.slice(0,4), +k.slice(5,7)-1, 1).getTime(); const y=+k.slice(0,4), q=+k.slice(-1); return new Date(y,(q-1)*3,1).getTime(); }
const HIST0 = Date.now()-365*DAY;
function label(g,k,short){
  if(g==='D'){ const [y,m,d]=k.split('-'); return short? d+'/'+m : d+' '+MO[+m-1]+' '+y; }
  if(g==='W'){ const [y,m,d]=k.split('-'); return short? d+'/'+m : 'Semaine du '+d+' '+MO[+m-1]+' '+y; }
  if(g==='M'){ const [y,m]=k.split('-'); return short? MO[+m-1].replace('.','')+(m==='01'?' '+y.slice(2):'') : MO[+m-1]+' '+y; }
  const [y,q]=k.split('-'); return short? q+' '+y.slice(2) : q.replace('T','T')+' '+y;
}

/* ---------- calculs ---------- */
const wv = x => x.vv[st.w]||0, wu = x => x.u[st.w]||0;
const metricOf = x => st.m==='u' ? wu(x) : wv(x);
function filtered(){ const q=low(st.q); return WB.filter(x=>(wv(x)>0||st.w==='365') && (!q||low(x.wb).includes(q)||low(x.p).includes(q)||low(x.o).includes(q))); }
const delta = (a,b) => b ? Math.round((a-b)*100/b) : null;
const dtag = d => d==null ? '' : '<em class="dl '+(d>0?'up':d<0?'dn':'')+'">'+(d>0?'+':'')+d+' %</em>';

function bans(S){
  const site=S.site, ks=S.keys; const cur=ks[ks.length-1], prev=ks[ks.length-2], prev2=ks[ks.length-3];
  const g=GR[st.g].l.toLowerCase(); const c=k=>site[k]||{u:0,v:0};
  const act=WB.filter(x=>wv(x)>0); const totV=act.reduce((a,x)=>a+wv(x),0);
  const top=act.slice().sort((a,b)=>wv(b)-wv(a)).slice(0,10).reduce((a,x)=>a+wv(x),0);
  const vis=act.reduce((a,x)=>a+wu(x),0);
  const b=[
    [fmt(c(prev).u)+dtag(delta(c(prev).u,c(prev2).u)),'Visiteurs uniques · '+g+' précédent'+(st.g==='W'||st.g==='M'?'':'e')],
    [fmt(c(prev).v)+dtag(delta(c(prev).v,c(prev2).v)),'Visites · '+g+' précédent'+(st.g==='W'||st.g==='M'?'':'e')],
    [fmt(c(cur).u),'Visiteurs uniques · '+g+' en cours'],
    [fmt(totV),'Visites · '+WIN[st.w]],
    [fmt(act.length),'Classeurs consultés · '+WIN[st.w]],
    [(totV?Math.round(top*100/totV):0)+' %','Part des 10 classeurs les plus vus'],
    [(c(prev).u?(c(prev).v/c(prev).u):0).toFixed(1).replace('.',','),'Visites par visiteur · '+g+' précédent'+(st.g==='W'||st.g==='M'?'':'e')]
  ];
  $('useBans').innerHTML=b.map(x=>'<div class="ban'+(x[2]?' alert':'')+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join('');
}

function chart(S){
  const ks=S.keys, src = st.wb ? (S.byWb[st.wb]||{}) : S.site; const vals=ks.map(k=>(src[k]||{})[st.m]||0);
  const max=Math.max(1,...vals); const Wd=1000, H=230, pl=44, pr=8, pt=16, pb=26; const iw=Wd-pl-pr, ih=H-pt-pb; const n=ks.length; const bw=iw/n;
  const nice=(m)=>{ const p=Math.pow(10,Math.floor(Math.log10(m))); const f=m/p; return (f<=1?1:f<=2?2:f<=5?5:10)*p; }; const top=nice(max);
  let s='<svg viewBox="0 0 '+Wd+' '+H+'" preserveAspectRatio="none" class="uchart" role="img" aria-label="'+esc(MET[st.m]+' par '+GR[st.g].l.toLowerCase())+'"><defs><pattern id="uhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#D7E5F6"/><line x1="0" y1="0" x2="0" y2="6" stroke="#8DB8EA" stroke-width="3"/></pattern></defs>';
  for(let i=0;i<=4;i++){ const y=pt+ih-ih*i/4; s+='<line x1="'+pl+'" x2="'+(Wd-pr)+'" y1="'+y+'" y2="'+y+'" class="gl"/><text x="'+(pl-6)+'" y="'+(y+3.5)+'" class="ax" text-anchor="end">'+fmt(top*i/4)+'</text>'; }
  const step=Math.ceil(n/14);
  ks.forEach((k,i)=>{ const h=vals[i]*ih/top, x=pl+i*bw+bw*0.14, w=Math.max(1,bw*0.72), y=pt+ih-h; const curP=i===n-1, part=!curP && pstart(st.g,k)<HIST0;
    s+='<g class="bk"><rect x="'+(pl+i*bw)+'" y="'+pt+'" width="'+bw+'" height="'+ih+'" class="hit"/><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+Math.max(h,vals[i]?1.5:0)+'" rx="'+Math.min(3,w/3)+'" class="'+(curP?'b cur':part?'b part':'b')+'"/><title>'+esc(label(st.g,k)+(curP?' (en cours)':part?' (historique incomplet)':'')+' · '+fmt(vals[i])+' '+MET[st.m].toLowerCase())+'</title></g>';
    if(i%step===0||curP) s+='<text x="'+(pl+i*bw+bw/2)+'" y="'+(H-8)+'" class="ax" text-anchor="middle">'+esc(label(st.g,k,true))+'</text>';
    if(n<=16 && vals[i]) s+='<text x="'+(pl+i*bw+bw/2)+'" y="'+(y-4)+'" class="vl" text-anchor="middle">'+fmt(vals[i])+'</text>'; });
  s+='</svg>';
  const tot=vals.reduce((a,b)=>a+b,0);
  $('useChartT').innerHTML = (st.wb?'<span class="k">'+esc(st.wb)+'</span> ':'Site france · ')+esc(MET[st.m])+' par '+esc(GR[st.g].l.toLowerCase())+' <small>· '+esc(GR[st.g].hint)+(st.m==='v'?' · total '+fmt(tot):'')+'</small>';
  $('useChart').innerHTML=s+'<p class="hint">La dernière barre (plus claire) est la période en cours, donc incomplète.'+(ks.some((k,i)=>i<n-1&&pstart(st.g,k)<HIST0)?' Les barres hachurées sont partielles : TS Events ne conserve que 12 mois.':'')+(st.m==='u'?' Visiteurs uniques comptés par période : ils ne s’additionnent pas d’une période à l’autre.':'')+'</p>';
}

function spark(S,wb){
  const src=S.byWb[wb]||{}; const ks=S.keys.slice(-Math.min(S.keys.length, st.g==='D'?30:st.g==='W'?12:S.keys.length)); const vals=ks.map(k=>(src[k]||{})[st.m]||0); const m=Math.max(1,...vals);
  const w=96,h=22, bw=w/vals.length; return '<svg width="'+w+'" height="'+h+'" class="spk" aria-hidden="true">'+vals.map((x,i)=>'<rect x="'+(i*bw+0.5)+'" y="'+(h-x*h/m)+'" width="'+Math.max(1,bw-1)+'" height="'+(x*h/m)+'" class="'+(i===vals.length-1?'cur':'')+'"/>').join('')+'</svg>';
}

function table(S){
  const list=filtered(); const key=st.sort||st.m;
  const val={u:wu, v:wv, r:x=>wu(x)?wv(x)/wu(x):0, l:x=>x.last||0};
  list.sort((a,b)=>val[key](b)-val[key](a)||a.wb.localeCompare(b.wb));
  const th=(k,l)=>'<th class="n sortable" data-sort="'+k+'" aria-sort="'+(key===k?'descending':'none')+'">'+l+(key===k?' ▾':'')+'</th>';
  const max=Math.max(1,...list.map(metricOf));
  let h='<table class="gtab"><thead><tr><th style="width:28px">#</th><th>Classeur</th>'+th('u','Visiteurs uniques · '+WIN[st.w])+th('v','Visites · '+WIN[st.w])+th('r','Visites / visiteur')+th('l','Dernière visite')+'<th>Tendance · '+esc(GR[st.g].l.toLowerCase())+'</th></tr></thead><tbody>';
  h+=list.slice(0,200).map((x,i)=>'<tr data-g="'+esc(x.wb)+'" class="'+(st.wb===x.wb?'sel':'')+'"><td class="rk">'+(i+1)+'</td><td><div class="wbn"><b>'+esc(x.wb)+'</b><small>'+esc(x.p)+(x.o?' · '+esc(x.o):'')+'</small></div><div class="bar" style="height:4px;margin-top:5px"><i style="width:'+(metricOf(x)*100/max)+'%;background:var(--blue)"></i></div></td><td class="n"><b>'+fmt(wu(x))+'</b></td><td class="n">'+fmt(wv(x))+'</td><td class="n">'+(wu(x)?(wv(x)/wu(x)).toFixed(1).replace('.',','):'—')+'</td><td class="n">'+dfr(x.last)+'</td><td>'+spark(S,x.wb)+'</td></tr>').join('');
  h+='</tbody></table>'+(list.length>200?'<p class="hint">200 premiers classeurs affichés · affinez avec la recherche.</p>':'')+(!list.length?'<p class="hint">Aucun classeur consulté sur cette fenêtre.</p>':'');
  $('useTable').innerHTML=h;
  $('useTableT').innerHTML='Classement des classeurs <small>· '+fmt(list.length)+' consultés sur '+esc(WIN[st.w])+' · cliquez pour voir les vues et les visiteurs</small>';
  $('useTable').querySelectorAll('tr[data-g]').forEach(tr=>tr.onclick=()=>selectWb(tr.dataset.g===st.wb?null:tr.dataset.g));
  $('useTable').querySelectorAll('th[data-sort]').forEach(t=>t.onclick=()=>{ st.sort=t.dataset.sort; table(S); });
}

/* ---------- panneau ---------- */
function aggViews(rows){ const by={}; rows.forEach(r=>{ const x=r.vv[st.w]||0; if(!x) return; const o=by[r.it]||(by[r.it]={it:r.it,v:0,us:new Set(),last:null}); o.v+=x; o.us.add(r.u); if(r.last&&(!o.last||r.last>o.last)) o.last=r.last; }); return Object.values(by).sort((a,b)=>(st.m==='u'?b.us.size-a.us.size:b.v-a.v)||b.v-a.v); }
function aggUsers(rows,view){ const by={}; rows.forEach(r=>{ if(view&&r.it!==view) return; const x=r.vv[st.w]||0; if(!x) return; const o=by[r.u]||(by[r.u]={u:r.u,v:0,its:new Set(),last:null}); o.v+=x; o.its.add(r.it); if(r.last&&(!o.last||r.last>o.last)) o.last=r.last; }); return Object.values(by).sort((a,b)=>b.v-a.v); }
async function panel(){
  const p=$('usePanel'); const S=SER[st.g];
  if(!st.wb){
    const act=WB.filter(x=>wv(x)>0).sort((a,b)=>wv(b)-wv(a)); const f=[];
    const one=act.filter(x=>wu(x)===1).length; if(one) f.push(['',fmt(one)+' classeurs n’ont qu’un seul visiteur sur '+WIN[st.w]+' (souvent l’auteur) : à vérifier avant d’investir dessus.']);
    if(act.length){ const tv=act.reduce((a,x)=>a+wv(x),0), t10=act.slice(0,10).reduce((a,x)=>a+wv(x),0); f.push(['info','Les 10 classeurs les plus vus font '+Math.round(t10*100/tv)+' % des visites sur '+WIN[st.w]+'. Les classeurs dormants sont suivis dans l’onglet Arborescence.']); }
    if(S){ const k=S.keys, a=(S.site[k[k.length-2]]||{}).u||0, b=(S.site[k[k.length-3]]||{}).u||0, d=delta(a,b); if(d!=null && Math.abs(d)>=10) f.push([d<0?'':'info','Visiteurs uniques '+(d<0?'en baisse':'en hausse')+' de '+Math.abs(d)+' % sur la dernière '+(st.g==='W'?'semaine':st.g==='M'?'période mensuelle':st.g==='Q'?'période trimestrielle':'journée')+' complète.']); }
    let h='<div><div class="eyebrow">Site france</div><h2>Usage des tableaux de bord</h2><p class="hint">Visite = une vue ouverte (« Access View », TS Events). Visiteur unique = utilisateur distinct sur la période.</p></div>';
    h+='<ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul>';
    h+='<div class="sec"><div class="eyebrow">Top 10 · '+esc(MET[st.m].toLowerCase())+' · '+esc(WIN[st.w])+'</div><div class="list">'+act.slice().sort((a,b)=>metricOf(b)-metricOf(a)).slice(0,10).map(x=>'<button type="button" class="urow" data-g="'+esc(x.wb)+'"><span class="nm"><b>'+esc(x.wb)+'</b><small>'+esc(x.p)+'</small></span><span class="r"><b>'+fmt(metricOf(x))+'</b></span></button>').join('')+'</div></div>';
    if(ERR.length) h+='<ul class="flags">'+ERR.map(e=>'<li>Lecture : '+esc(e)+'</li>').join('')+'</ul>';
    p.innerHTML=h; p.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>selectWb(b.dataset.g)); return;
  }
  const x=WB.find(w=>w.wb===st.wb)||{wb:st.wb,p:'—',u:{},vv:{}};
  const head='<div><button type="button" class="back" id="useBack">← Tous les classeurs</button><div class="eyebrow">Classeur · '+esc(x.p)+'</div><h2>'+esc(x.wb)+'</h2>'+(x.o?'<p class="hint">Propriétaire : '+esc(x.o)+'</p>':'')+'</div>'+
    '<div class="pk"><div class="cell"><span>Visiteurs uniques · '+esc(WIN[st.w])+'</span><b>'+fmt(wu(x))+'</b></div><div class="cell"><span>Visites · '+esc(WIN[st.w])+'</span><b>'+fmt(wv(x))+'</b></div></div><p class="hint">Dernière visite le '+dfr(x.last)+' · '+(wu(x)?(wv(x)/wu(x)).toFixed(1).replace('.',','):'—')+' visites par visiteur</p>';
  p.innerHTML=head+'<p class="hint loading">Chargement des vues et des visiteurs… (jusqu’à une minute pour les classeurs très consultés)</p>'; $('useBack').onclick=()=>selectWb(null);
  const rows=await loadDetail(st.wb); if(st.wb!==x.wb) return;
  if(!rows){ p.innerHTML=head+'<ul class="flags"><li>Détail indisponible. '+esc(ERR.slice(-1)[0]||'')+'</li></ul>'; $('useBack').onclick=()=>selectWb(null); return; }
  const views=aggViews(rows); const vmax=Math.max(1,...views.map(o=>st.m==='u'?o.us.size:o.v));
  let h=head+'<div class="sec"><div class="eyebrow">Vues les plus consultées · '+esc(WIN[st.w])+'</div><div class="list">'+
    views.map(o=>'<button type="button" class="urow vrow'+(st.view===o.it?' on':'')+'" data-v="'+esc(o.it)+'"><span class="nm"><b>'+esc(o.it)+'</b><span class="bar" style="height:4px;margin-top:4px"><i style="width:'+((st.m==='u'?o.us.size:o.v)*100/vmax)+'%;background:var(--blue)"></i></span></span><span class="r"><b>'+fmt(o.v)+'</b> visites<br>'+fmt(o.us.size)+' visiteurs</span></button>').join('')+(views.length?'':'<p class="hint">Aucune vue consultée sur cette fenêtre.</p>')+'</div></div>';
  const users=aggUsers(rows,st.view);
  h+='<div class="sec"><div class="eyebrow">'+(st.view?'Qui consulte « '+esc(st.view)+' »':'Qui consulte ce classeur')+' · '+fmt(users.length)+' visiteurs'+(st.view?' <button type="button" class="lnk" id="useAllV">toutes les vues</button>':'')+'</div><div class="list">'+
    users.slice(0,300).map(u=>'<div class="urow"><span class="nm"><b>'+esc(u.u)+'</b><small>'+(st.view?'':fmt(u.its.size)+' vue'+(u.its.size>1?'s':'')+' · ')+'dernière visite '+dfr(u.last)+'</small></span><span class="r"><b>'+fmt(u.v)+'</b> fois</span></div>').join('')+'</div>'+(users.length>300?'<p class="hint">300 premiers affichés.</p>':'')+'</div>';
  p.innerHTML=h; $('useBack').onclick=()=>selectWb(null);
  p.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ st.view = st.view===b.dataset.v?null:b.dataset.v; panel(); });
  const av=$('useAllV'); if(av) av.onclick=()=>{ st.view=null; panel(); };
}
function selectWb(wb){ st.wb=wb; st.view=null; const S=SER[st.g]; if(S){ chart(S); table(S); } panel(); }

/* ---------- rendu global ---------- */
async function render(){
  $('useMain').setAttribute('aria-busy','true');
  let S; try{ S=await loadSeries(st.g); }catch(e){ ERR.push(String(e&&e.message||e)); }
  $('useMain').removeAttribute('aria-busy');
  if(!S) return;
  bans(S); chart(S); table(S); panel(); controls();
}
function controls(){
  const grp=(id,obj,cur,attr)=>{ $(id).innerHTML=Object.entries(obj).map(([k,o])=>'<button type="button" class="chip" data-'+attr+'="'+k+'" aria-pressed="'+(cur===k)+'">'+esc(typeof o==='string'?o:o.l)+'</button>').join(''); };
  grp('useG',GR,st.g,'g'); grp('useM',MET,st.m,'m'); grp('useW',WIN,st.w,'w');
  $('useG').querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ st.g=b.dataset.g; controls(); if(!SER[st.g]) $('useChart').innerHTML='<p class="hint loading">Chargement de la granularité « '+esc(GR[st.g].l)+' »…</p>'; render(); });
  $('useM').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ st.m=b.dataset.m; st.sort=null; render(); });
  $('useW').querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{ st.w=b.dataset.w; render(); });
}
function mount(){
  ['licences.css?v=2','usage.css?v=2'].forEach(href=>{ if(!document.querySelector('link[href^="'+href.split('?')[0]+'"]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l); } });
  const app=document.createElement('div'); app.className='app lic use'; app.id='use'; app.hidden=true;
  app.innerHTML='<header class="head bans-wrap"><div class="bans" id="useBans"></div></header>'+
    '<div class="tools utools"><div class="cg"><span class="cl">Granularité</span><div class="chips" role="group" aria-label="Granularité" id="useG"></div></div>'+
    '<div class="cg"><span class="cl">Mesure</span><div class="chips" role="group" aria-label="Mesure" id="useM"></div></div>'+
    '<div class="cg"><span class="cl">Fenêtre du classement</span><div class="chips" role="group" aria-label="Fenêtre" id="useW"></div></div>'+
    '<label class="search" style="max-width:260px;margin-left:auto"><span style="position:absolute;left:-9999px">Rechercher</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="useQ" type="search" placeholder="Classeur, projet, propriétaire…" autocomplete="off"></label></div>'+
    '<div class="main"><div class="canvas" id="useMain" style="padding:16px 18px;display:block">'+
      '<section class="block" style="margin-top:0"><h3 id="useChartT"></h3><div id="useChart"></div></section>'+
      '<section class="block"><h3 id="useTableT"></h3><div id="useTable"></div></section>'+
    '</div><aside class="panel" id="usePanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
}
window.USE_START = async function(){
  mount(); controls(); await loadWB(); await render();
  $('useQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); const S=SER[st.g]; if(S) table(S); });
};
})();
