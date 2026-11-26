/* Page Performance — chargée par index.html quand le tableau de bord contient la feuille « Perf_View ».
   Aucune donnée dans ce fichier : temps de chargement lus en direct dans Admin Insights (Viz Load Times),
   complexité lue dans l'instantané Metadata API du classeur (feuille Perf_Meta). */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n||0).toLocaleString('fr-FR');
const sec = n => n==null||isNaN(n) ? '—' : (n<10 ? n.toFixed(1).replace('.',',') : fmt(n))+' s';
const low = s => String(s||'').trim().toLowerCase();
const dfr = t => t ? new Date(t).toLocaleDateString('fr-FR') : '—';
const mb = b => !b ? '—' : b>=1e9 ? (b/1e9).toFixed(1).replace('.',',')+' Go' : fmt(b/1e6)+' Mo';

/* seuils sur la médiane des chargements (recommandation Tableau : < 3 s pour une page interactive) */
const ST = [
  {k:'ok',  l:'Bon',            max:3,   c:'#1F8A50', d:'Médiane ≤ 3 s'},
  {k:'watch',l:'À surveiller',  max:7,   c:'#C98A00', d:'Médiane 3 à 7 s'},
  {k:'slow',l:'Lent',           max:15,  c:'#E8730C', d:'Médiane 7 à 15 s'},
  {k:'crit',l:'Critique',       max:1e9, c:'#E2001A', d:'Médiane > 15 s'}
];
const stOf = m => m==null ? null : ST.find(s=>m<=s.max);
const st = {f:'all', q:'', sel:null, sort:'impact'};
let V=[], Q={}, QN={}, R={}, DAY=[], HOUR=[], DAYW=null, ERR=[], UNIT=1;

/* ---------- lecture ---------- */
let queue=Promise.resolve();
const serial = fn => { const p=queue.then(fn,fn); queue=p.catch(()=>{}); return p; };
const W = n => tableau.extensions.dashboardContent.dashboard.worksheets.find(w=>w.name===n);
async function readTable(ws){
  if(ws.getSummaryDataReaderAsync){ const r=await ws.getSummaryDataReaderAsync(undefined,{ignoreSelection:true}); const t=await r.getAllPagesAsync(); await r.releaseAsync(); return t; }
  return ws.getSummaryDataAsync({maxRows:0, ignoreSelection:true});
}
const rd = n => serial(async()=>{ const w=W(n); if(!w) return null; try{ return await readTable(w); }catch(e){ ERR.push(n+' : '+(e&&e.message||e)); return null; } });
const v = (row,i) => { if(i<0) return null; const c=row[i]; const x=c.value; return (x==null||x==='%null%'||c.formattedValue==='Null')?null:x; };
const num = x => x==null||x==='' ? null : (isNaN(+x)?null:+x);
const toT = x => { if(x==null||x==='') return null; if(x instanceof Date) return x.getTime(); const t=Date.parse(String(x).replace(' ','T')); return isNaN(t)?null:t; };
const idx = (t,...keys) => { const n=t.columns.map(c=>low(c.fieldName)); for(const k of keys){ const i=n.findIndex(x=>x===k); if(i>=0) return i; } for(const k of keys){ const i=n.findIndex(x=>x.includes(k)); if(i>=0) return i; } return -1; };

async function load(){
  const tv=await rd('Perf_View'); if(!tv) throw new Error(ERR.join(' | ')||'Perf_View illisible');
  const I={wb:idx(tv,'workbook name'), it:idx(tv,'item name'), p:idx(tv,'project name'), n:idx(tv,'chargements 30 j'), med:idx(tv,'médiane 30 j'), p90:idx(tv,'p90 30 j'), avg:idx(tv,'moyenne 30 j'), max:idx(tv,'max 30 j'), err:idx(tv,'erreurs 30 j'), medp:idx(tv,'médiane 30-90 j'), np:idx(tv,'chargements 30-90 j'), last:idx(tv,'request time')};
  V=tv.data.map(r=>({wb:v(r,I.wb)||'—', it:v(r,I.it)||'—', p:v(r,I.p)||'', n:num(v(r,I.n))||0, med:num(v(r,I.med)), p90:num(v(r,I.p90)), avg:num(v(r,I.avg)), max:num(v(r,I.max)), err:num(v(r,I.err))||0, medp:num(v(r,I.medp)), np:num(v(r,I.np))||0, last:toT(v(r,I.last))})).filter(x=>x.n>0 || x.np>0);
  // unité : Admin Insights donne des secondes ; si les valeurs ressemblent à des millisecondes, on convertit
  const meds=V.map(x=>x.med).filter(x=>x!=null).sort((a,b)=>a-b); const m0=meds[Math.floor(meds.length/2)]||0; UNIT = m0>200 ? 1/1000 : 1;
  V.forEach(x=>['med','p90','avg','max','medp'].forEach(k=>{ if(x[k]!=null) x[k]*=UNIT; }));
  // complexité (instantané Metadata API)
  const tm=await rd('Perf_Meta');
  if(tm){ const J={wb:idx(tm,'wb'), t:idx(tm,'type'), name:idx(tm,'name'), info:idx(tm,'info')};
    tm.data.forEach(r=>{ const t=v(r,J.t), wb=v(r,J.wb), name=v(r,J.name)||'', a=String(v(r,J.info)||'').split('|').map(Number);
      if(t==='Q'){ const o={wb,name,nDS:a[0],nPub:a[1],nLive:a[2],nExt:a[3],nTab:a[4],nCols:a[5],nCalc:a[6],nLOD:a[7],nTC:a[8],nPar:a[9],maxLen:a[10],nSQL:a[11],rls:a[12],nDash:a[13],nSheets:a[14],size:a[15],ext:a[16],nHV:a[17]}; Q[wb]=o; (QN[low(name)]=QN[low(name)]||[]).push(o); }
      else if(t==='R'){ (R[wb]=R[wb]||{})[low(name)]={name,nSheets:a[0],nCalc:a[1],nLOD:a[2],nTC:a[3],nDS:a[4],nFields:a[5],nHV:a[6]}; } }); }
  const td=await rd('Perf_Day_All'); if(td){ const K={d:idx(td,'perf jour'), med:idx(td,'médiane'), p90:idx(td,'p90'), n:idx(td,'chargements')}; DAY=td.data.map(r=>({d:String(v(r,K.d)||''), med:(num(v(r,K.med))||0)*UNIT, p90:(num(v(r,K.p90))||0)*UNIT, n:num(v(r,K.n))||0})).filter(x=>x.d).sort((a,b)=>a.d.localeCompare(b.d)); }
  const th=await rd('Perf_Hour_All'); if(th){ const K={h:idx(th,'perf heure'), med:idx(th,'médiane'), p90:idx(th,'p90'), n:idx(th,'chargements')}; HOUR=th.data.map(r=>({h:num(v(r,K.h)), med:(num(v(r,K.med))||0)*UNIT, p90:(num(v(r,K.p90))||0)*UNIT, n:num(v(r,K.n))||0})).filter(x=>x.h!=null).sort((a,b)=>a.h-b.h); }
  // rattachement vue → complexité
  const nMax=[...V].map(x=>x.n).sort((a,b)=>b-a); const topN=nMax[Math.floor(nMax.length*0.1)]||1e9;
  V.forEach(x=>{ const qs=QN[low(x.wb)]||[]; x.q=qs[0]||null; x.r=x.q&&R[x.q.wb] ? R[x.q.wb][low(x.it)]||null : null; x.st=stOf(x.med); x.hot=x.n>=topN && x.n>=50; x.causes=causes(x); x.score=score(x); x.impact=(x.med||0)*x.n; });
}
async function loadDayW(){
  if(DAYW) return DAYW;
  const t=await rd('Perf_Day'); DAYW={};
  if(t){ const K={d:idx(t,'perf jour'), wb:idx(t,'workbook name'), med:idx(t,'médiane'), p90:idx(t,'p90'), n:idx(t,'chargements')};
    t.data.forEach(r=>{ const wb=v(r,K.wb); if(!wb) return; (DAYW[wb]=DAYW[wb]||[]).push({d:String(v(r,K.d)||''), med:(num(v(r,K.med))||0)*UNIT, p90:(num(v(r,K.p90))||0)*UNIT, n:num(v(r,K.n))||0}); });
    Object.values(DAYW).forEach(a=>a.sort((x,y)=>x.d.localeCompare(y.d))); }
  return DAYW;
}

/* ---------- causes probables ---------- */
// poids : 3 = cause majeure, 2 = cause probable, 1 = facteur aggravant
function causes(x){
  const q=x.q||{}, r=x.r, out=[]; const add=(w,k,t,d,a)=>out.push({w,k,t,d,a});
  const sheets = r ? r.nSheets : null;
  if(sheets!=null && sheets>=12) add(3,'sheets','Trop de feuilles sur la page', sheets+' feuilles sur ce tableau de bord : chacune lance au moins une requête au chargement.','Viser moins de 8 feuilles visibles ; déplacer le détail dans une autre page ou en infobulle.');
  else if(sheets!=null && sheets>=8) add(2,'sheets','Beaucoup de feuilles sur la page', sheets+' feuilles sur ce tableau de bord.','Regrouper les KPI dans une seule feuille, masquer ce qui n’est pas vu au premier écran.');
  if(q.nLive>0 && !q.nExt) add(x.med>7?3:2,'live','Connexion live', 'Toutes les sources sont en live : chaque ouverture interroge BigQuery'+(q.nTab?' ('+q.nTab+' table'+(q.nTab>1?'s':'')+')':'')+'.','Passer en extrait si la fraîcheur le permet, ou pré-agréger la table dans BigQuery (vue matérialisée, table de restitution).');
  if(q.ext>1e9) add(2,'ext','Extrait volumineux', 'Extraits utilisés : '+mb(q.ext)+'.','Filtrer et agréger l’extrait (niveau de détail utile), masquer les colonnes inutilisées.');
  if(r && r.nDS>=3) add(2,'ds','Plusieurs sources sur la page', r.nDS+' sources interrogées par cette page (mélanges ou requêtes parallèles).','Fusionner dans une seule source modélisée dans BigQuery ; éviter les mélanges de données.');
  else if(q.nDS>=4) add(1,'ds','Nombreuses sources dans le classeur', q.nDS+' sources dans le classeur.','Mutualiser les sources publiées.');
  if(q.rls) add(1,'rls','Sécurité par ligne (RLS)', 'La matrice RLS est jointe à chaque requête et rend le cache propre à chaque utilisateur.','Pré-filtrer la matrice (périmètre par utilisateur déjà agrégé) et l’indexer par la clé de jointure.');
  if(q.nSQL>0) add(2,'sql','SQL personnalisé', q.nSQL+' source'+(q.nSQL>1?'s':'')+' en SQL personnalisé : Tableau ne peut pas élaguer les colonnes ni optimiser les jointures.','Remplacer par une vue ou une table BigQuery.');
  const lod = r ? r.nLOD : q.nLOD, tc = r ? r.nTC : q.nTC, hv = r ? r.nHV : q.nHV, cu = r ? r.nCalc : q.nCalc;
  if(lod>=3) add(2,'lod','Calculs LOD', lod+' calculs FIXED / INCLUDE / EXCLUDE '+(r?'sur cette page':'dans le classeur')+' : sous-requêtes et jointures supplémentaires.','Pousser ces agrégats dans BigQuery (colonne pré-calculée).');
  if(tc>=3) add(2,'tc','Calculs de table', tc+' calculs de table (WINDOW_, RUNNING_, RANK, LOOKUP…) : calculés dans Tableau après la requête, sur toutes les marques.','Limiter les marques, ou calculer dans BigQuery.');
  if(hv>=3) add(1,'hv','Calculs texte ligne à ligne', hv+' calculs texte (CONTAINS, SPLIT, REGEXP, MID, DATEPARSE…) évalués sur chaque ligne.','Créer ces colonnes en amont dans BigQuery.');
  if(cu>=60 && r) add(1,'calc','Nombreux champs calculés utilisés', cu+' champs calculés utilisés par cette page.','Supprimer les calculs intermédiaires et ceux qui ne servent plus.');
  else if(q.nCalc>=250) add(1,'calc','Nombreux champs calculés', q.nCalc+' champs calculés dans le classeur.','Nettoyer les champs inutilisés (voir l’onglet Lineage).');
  if(q.nCols>=300 || (r && r.nFields>=60)) add(1,'cols','Beaucoup de colonnes', (r&&r.nFields>=60? r.nFields+' champs utilisés par la page · ':'')+fmt(q.nCols)+' colonnes dans les sources.','Masquer les colonnes inutilisées ; réduire la largeur de la table.');
  if(q.nPar>=15) add(1,'par','Nombreux paramètres', q.nPar+' paramètres : souvent signe de bascules de mesures (CASE sur paramètre) qui empêchent le cache.','Remplacer les bascules par des actions de paramètre ciblées ou des pages dédiées.');
  if(x.p90 && x.med && x.p90 > 3*x.med && x.p90>5) add(2,'var','Temps très variable', 'P90 '+sec(x.p90)+' contre une médiane de '+sec(x.med)+' : certains chargements sont beaucoup plus lents (cache froid, filtres larges, heures de pointe).','Vérifier les heures de pointe et les filtres par défaut ; planifier un « warm-up » du cache après actualisation.');
  if(x.hot && x.med>3) add(1,'hot','Fort trafic', fmt(x.n)+' chargements sur 30 jours : la page fait partie des 10 % les plus consultées.','Prioriser son optimisation : chaque seconde gagnée est multipliée par le trafic.');
  if(q.size>5e7 && !q.nExt) add(1,'wb','Classeur lourd', 'Classeur de '+mb(q.size)+'.','Retirer les images, feuilles et extraits embarqués inutiles.');
  return out.sort((a,b)=>b.w-a.w);
}
function score(x){ // 0-100 : complexité structurelle (indépendante du temps mesuré)
  const q=x.q||{}, r=x.r||{}; let s=0;
  s+=Math.min(25,(r.nSheets||q.nSheets/Math.max(1,q.nDash)||0)*2);
  s+=Math.min(15,((r.nLOD!=null?r.nLOD:q.nLOD)||0)*3);
  s+=Math.min(10,((r.nTC!=null?r.nTC:q.nTC)||0)*2);
  s+=Math.min(10,((r.nDS||q.nDS)||0)*3);
  s+=(q.nLive&&!q.nExt)?10:0; s+=q.nSQL?8:0; s+=q.rls?6:0;
  s+=Math.min(8,(q.nCalc||0)/40); s+=Math.min(8,(q.nCols||0)/60);
  return Math.round(Math.min(100,s));
}

/* ---------- rendu ---------- */
const pct=(a,b)=>b?Math.round(a*100/b):0;
function siteMed(){ const tot=V.reduce((a,x)=>a+x.n,0); if(!DAY.length) return {med:null,p90:null,tot}; const last=DAY.slice(-30); const w=last.reduce((a,d)=>a+d.n,0)||1; return {med:last.reduce((a,d)=>a+d.med*d.n,0)/w, p90:last.reduce((a,d)=>a+d.p90*d.n,0)/w, tot}; }
function bans(){
  const s=siteMed(); const c=k=>V.filter(x=>x.n>=10&&x.st&&x.st.k===k).length;
  const prev=DAY.slice(-90,-30); const wp=prev.reduce((a,d)=>a+d.n,0)||1; const medPrev=prev.length? prev.reduce((a,d)=>a+d.med*d.n,0)/wp : null;
  const d=medPrev&&s.med? Math.round((s.med-medPrev)*100/medPrev) : null;
  const errs=V.reduce((a,x)=>a+x.err,0);
  const b=[
    [sec(s.med)+(d!=null?'<em class="dl '+(d>0?'dn':d<0?'up':'')+'">'+(d>0?'+':'')+d+' %</em>':''),'Temps médian de chargement · 30 j',''],
    [sec(s.p90),'P90 · 1 chargement sur 10 est plus lent',''],
    [fmt(c('crit')),'Vues critiques (> 15 s)','crit','crit'],
    [fmt(c('slow')),'Vues lentes (7 à 15 s)','slow','slow'],
    [fmt(c('watch')),'Vues à surveiller (3 à 7 s)','watch','watch'],
    [fmt(s.tot),'Chargements · 30 j',''],
    [(s.tot?(errs*100/s.tot).toFixed(1).replace('.',','):'0')+' %','Chargements en erreur',errs?'crit':'']
  ];
  $('pfBans').innerHTML=b.map(x=>x[3]?'<button type="button" class="ban pb '+x[2]+'" data-f="'+x[3]+'" aria-pressed="'+(st.f===x[3])+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></button>':'<div class="ban pb '+x[2]+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join('');
  $('pfBans').querySelectorAll('[data-f]').forEach(e=>e.onclick=()=>{ st.f=st.f===e.dataset.f?'all':e.dataset.f; bans(); chips(); table(); });
}
function lineChart(el, rows, label){
  if(!rows.length){ el.innerHTML='<p class="hint">Pas de données sur la période.</p>'; return; }
  const W=1000,H=210,pl=40,pr=10,pt=14,pb=24, iw=W-pl-pr, ih=H-pt-pb; const max=Math.max(16,...rows.map(r=>r.p90))*1.08;
  const X=i=>pl+(rows.length<2?iw/2:i*iw/(rows.length-1)), Y=y=>pt+ih-Math.min(y,max)*ih/max;
  let s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" class="pchart" role="img" aria-label="'+esc(label)+'">';
  [[3,'#1F8A50'],[7,'#C98A00'],[15,'#E2001A']].forEach(([t,c])=>{ if(t<max) s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(t)+'" y2="'+Y(t)+'" stroke="'+c+'" stroke-dasharray="4 4" class="th"/><text x="'+(W-pr-2)+'" y="'+(Y(t)-3)+'" class="ax" text-anchor="end" fill="'+c+'">'+t+' s</text>'; });
  for(let i=0;i<=4;i++){ const y=max*i/4; s+='<text x="'+(pl-6)+'" y="'+(Y(y)+3.5)+'" class="ax" text-anchor="end">'+Math.round(y)+'</text>'; }
  const path=k=>rows.map((r,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(r[k]).toFixed(1)).join('');
  s+='<path d="'+path('p90')+'" class="lp90"/><path d="'+path('med')+'" class="lmed"/>';
  const step=Math.ceil(rows.length/10); rows.forEach((r,i)=>{ if(i%step===0) s+='<text x="'+X(i)+'" y="'+(H-6)+'" class="ax" text-anchor="middle">'+esc(r.d.slice(8,10)+'/'+r.d.slice(5,7))+'</text>'; s+='<rect x="'+(X(i)-iw/rows.length/2)+'" y="'+pt+'" width="'+(iw/rows.length)+'" height="'+ih+'" class="hit"><title>'+esc(dfr(r.d+'T00:00:00')+' · médiane '+sec(r.med)+' · P90 '+sec(r.p90)+' · '+fmt(r.n)+' chargements')+'</title></rect>'; });
  el.innerHTML=s+'</svg><div class="legend"><span><i style="background:var(--blue)"></i>Médiane</span><span><i style="background:#8DB8EA"></i>P90</span><span><i style="background:#1F8A50"></i>3 s</span><span><i style="background:#C98A00"></i>7 s</span><span><i style="background:#E2001A"></i>15 s</span></div>';
}
function hourChart(){
  const el=$('pfHour'); if(!HOUR.length){ el.innerHTML='<p class="hint">—</p>'; return; }
  const H=Array.from({length:24},(_,h)=>HOUR.find(x=>x.h===h)||{h,n:0,med:0,p90:0}); const mx=Math.max(1,...H.map(x=>x.n)), mm=Math.max(4,...H.map(x=>x.med));
  el.innerHTML='<div class="hours">'+H.map(x=>{ const s=stOf(x.med)||ST[0]; return '<div class="hc" title="'+esc(x.h+' h · '+fmt(x.n)+' chargements · médiane '+sec(x.med)+' · P90 '+sec(x.p90))+'"><span class="hv" style="color:'+s.c+'">'+(x.n?sec(x.med).replace(' s',''):'')+'</span><div class="hb" style="height:'+(x.n*100/mx)+'%;background:'+(x.n?s.c:'#E6EBF2')+'"></div><span class="hl">'+x.h+'</span></div>'; }).join('')+'</div><p class="hint">Hauteur = nombre de chargements (30 j, heure de Paris) · couleur et valeur = temps médian. Une médiane qui monte avec le trafic signale une saturation aux heures de pointe.</p>';
}
function filtered(){ const q=low(st.q); return V.filter(x=>x.n>0 && (st.f==='all' || (x.st&&x.st.k===st.f&&x.n>=10)) && (!q || low(x.wb).includes(q) || low(x.it).includes(q) || low(x.p).includes(q))); }
function table(){
  const list=filtered(); const S={impact:x=>x.impact, med:x=>x.med||0, p90:x=>x.p90||0, n:x=>x.n, score:x=>x.score}; list.sort((a,b)=>S[st.sort](b)-S[st.sort](a));
  const th=(k,l,n)=>'<th class="'+(n?'n ':'')+'sortable" data-s="'+k+'" aria-sort="'+(st.sort===k?'descending':'none')+'">'+l+(st.sort===k?' ▾':'')+'</th>';
  let h='<table class="gtab ptab"><thead><tr><th>Vue · classeur</th>'+th('med','Médiane',1)+th('p90','P90',1)+'<th class="n">Évol.</th>'+th('n','Chargements 30 j',1)+th('impact','Attente cumulée',1)+th('score','Complexité',1)+'<th>Causes probables</th></tr></thead><tbody>';
  h+=list.slice(0,250).map(x=>{ const s=x.st||ST[0]; const d=x.medp&&x.med&&x.np>=20&&x.n>=20? Math.round((x.med-x.medp)*100/x.medp):null;
    return '<tr data-i="'+V.indexOf(x)+'" class="'+(st.sel===x?'sel':'')+'"><td><div class="vn"><span class="sd" style="background:'+s.c+'" title="'+esc(s.l)+'"></span><span><b>'+esc(x.it)+'</b>'+(x.n<10?'<span class="k" title="Moins de 10 chargements sur 30 jours : statut peu fiable">FAIBLE VOLUME</span>':'')+'<small>'+esc(x.wb)+(x.p?' · '+esc(x.p):'')+'</small></span></div></td>'+
      '<td class="n"><span class="pt" style="--c:'+s.c+'">'+sec(x.med)+'</span></td><td class="n">'+sec(x.p90)+'</td><td class="n">'+(d==null?'—':'<span class="dl '+(d>10?'dn':d<-10?'up':'')+'">'+(d>0?'+':'')+d+' %</span>')+'</td><td class="n">'+fmt(x.n)+'</td><td class="n">'+(x.impact>=3600?(x.impact/3600).toFixed(1).replace('.',',')+' h':fmt(x.impact/60)+' min')+'</td>'+
      '<td class="n"><span class="cx"><i style="width:'+x.score+'%"></i></span>'+x.score+'</td><td>'+x.causes.slice(0,3).map(c=>'<span class="cz w'+c.w+'">'+esc(c.t)+'</span>').join('')+'</td></tr>'; }).join('');
  h+='</tbody></table>'+(list.length>250?'<p class="hint">250 premières vues · affinez avec la recherche.</p>':'')+(!list.length?'<p class="hint">Aucune vue pour ce filtre.</p>':'');
  $('pfTable').innerHTML=h; $('pfTableT').innerHTML='Vues · '+fmt(list.length)+' <small>· attente cumulée = médiane × chargements : ce que la lenteur coûte réellement aux utilisateurs</small>';
  $('pfTable').querySelectorAll('tr[data-i]').forEach(tr=>tr.onclick=()=>select(V[+tr.dataset.i]));
  $('pfTable').querySelectorAll('th[data-s]').forEach(t=>t.onclick=()=>{ st.sort=t.dataset.s; table(); });
}
async function select(x){
  st.sel = st.sel===x ? null : x; table(); panel();
  if(st.sel){ $('pfChartT').innerHTML='<span class="k">'+esc(x.wb)+'</span> Temps de chargement par jour <small>· classeur entier, 90 j</small>'; $('pfChart').innerHTML='<p class="hint loading">Chargement…</p>'; const d=await loadDayW(); if(st.sel===x) lineChart($('pfChart'), d[x.wb]||[], 'Temps de chargement de '+x.wb); }
  else siteChart();
}
function siteChart(){ $('pfChartT').innerHTML='Site france · temps de chargement par jour <small>· 90 j, pondéré par le nombre de chargements</small>'; lineChart($('pfChart'), DAY, 'Temps de chargement du site'); }
function panel(){
  const p=$('pfPanel'); const x=st.sel;
  if(!x){
    const s=siteMed(); const top=V.filter(v=>v.n>=10).sort((a,b)=>b.impact-a.impact).slice(0,8);
    const cc={}; V.filter(v=>v.n>=10&&v.st&&(v.st.k==='slow'||v.st.k==='crit')).forEach(v=>v.causes.forEach(c=>{ cc[c.t]=(cc[c.t]||0)+1; }));
    let h='<div><div class="eyebrow">Site france</div><h2>Performance des tableaux de bord</h2><p class="hint">Source : Admin Insights · Viz Load Times (temps de réponse serveur à l’ouverture d’une vue). Seuils sur la médiane : ≤ 3 s bon, 3–7 s à surveiller, 7–15 s lent, > 15 s critique.</p></div>';
    h+='<div class="sec"><div class="eyebrow">À traiter en priorité · attente cumulée</div><div class="list">'+top.map(v=>'<button type="button" class="urow" data-i="'+V.indexOf(v)+'"><span class="sd" style="background:'+(v.st||ST[0]).c+'"></span><span class="nm"><b>'+esc(v.it)+'</b><small>'+esc(v.wb)+'</small></span><span class="r"><b>'+sec(v.med)+'</b><br>'+fmt(v.n)+' ch.</span></button>').join('')+'</div></div>';
    const cl=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if(cl.length) h+='<div class="sec"><div class="eyebrow">Causes les plus fréquentes sur les vues lentes</div>'+cl.map(([t,n])=>'<div class="cr"><span>'+esc(t)+'</span><b>'+n+'</b></div>').join('')+'</div>';
    if(ERR.length) h+='<ul class="flags">'+ERR.map(e=>'<li><span>Lecture : '+esc(e)+'</span></li>').join('')+'</ul>';
    p.innerHTML=h; p.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>select(V[+b.dataset.i])); return;
  }
  const s=x.st||ST[0], q=x.q, r=x.r;
  let h='<div><button type="button" class="back" id="pfBack">← Toutes les vues</button><div class="eyebrow">'+esc(x.wb)+'</div><h2>'+esc(x.it)+'</h2><span class="pill" style="background:'+s.c+';color:#fff">'+esc(s.l)+' · '+esc(s.d)+'</span></div>';
  h+='<div class="pk"><div class="cell"><span>Médiane 30 j</span><b style="color:'+s.c+'">'+sec(x.med)+'</b></div><div class="cell"><span>P90</span><b>'+sec(x.p90)+'</b></div><div class="cell"><span>Maximum</span><b>'+sec(x.max)+'</b></div><div class="cell"><span>Chargements 30 j</span><b>'+fmt(x.n)+'</b></div></div>';
  h+='<p class="hint">Médiane 30 à 90 j : '+sec(x.medp)+' · '+fmt(x.err)+' chargement'+(x.err>1?'s':'')+' en erreur · dernier le '+dfr(x.last)+'.</p>';
  h+='<div class="sec"><div class="eyebrow">Causes probables de latence</div>'+(x.causes.length? x.causes.map(c=>'<div class="cause w'+c.w+'"><b>'+esc(c.t)+'</b><span>'+esc(c.d)+'</span><em>→ '+esc(c.a)+'</em></div>').join('') : '<ul class="flags"><li class="ok"><span>Aucun facteur de complexité marquant : si la vue est lente, regarder la requête BigQuery (volumétrie, partitionnement) et les filtres par défaut.</span></li></ul>')+'</div>';
  if(r) h+='<div class="sec"><div class="eyebrow">Cette page</div><div class="kv">'+[['Feuilles',r.nSheets],['Champs calculés utilisés',r.nCalc],['Calculs LOD',r.nLOD],['Calculs de table',r.nTC],['Calculs texte',r.nHV],['Sources interrogées',r.nDS],['Champs utilisés',r.nFields]].map(([l,v])=>'<div><span>'+l+'</span><b>'+fmt(v)+'</b></div>').join('')+'</div></div>';
  if(q) h+='<div class="sec"><div class="eyebrow">Classeur</div><div class="kv">'+[['Tableaux de bord',fmt(q.nDash)],['Feuilles',fmt(q.nSheets)],['Sources',fmt(q.nDS)+(q.nPub?' dont '+q.nPub+' publiée'+(q.nPub>1?'s':''):'')],['Connexion',q.nLive&&q.nExt?'Live + extrait':q.nExt?'Extrait':'Live'],['Tables amont',fmt(q.nTab)],['Colonnes',fmt(q.nCols)],['Champs calculés',fmt(q.nCalc)],['dont LOD',fmt(q.nLOD)],['dont calculs de table',fmt(q.nTC)],['Paramètres',fmt(q.nPar)],['Formule la plus longue',fmt(q.maxLen)+' car.'],['SQL personnalisé',q.nSQL?'Oui':'Non'],['Sécurité RLS',q.rls?'Oui':'Non'],['Taille extraits',mb(q.ext)],['Taille du classeur',mb(q.size)]].map(([l,v])=>'<div><span>'+l+'</span><b>'+v+'</b></div>').join('')+'</div><p class="hint">Complexité : instantané Metadata API (lineage). Taille des tables BigQuery non disponible ici.</p></div>';
  else h+='<p class="hint">Complexité inconnue pour ce classeur (absent de l’instantané lineage).</p>';
  p.innerHTML=h; $('pfBack').onclick=()=>select(x);
}
function mount(){
  ['licences.css?v=2','usage.css?v=2','perf.css?v=1'].forEach(href=>{ if(!document.querySelector('link[href^="'+href.split('?')[0]+'"]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l); } });
  const app=document.createElement('div'); app.className='app lic use perf'; app.id='perf'; app.hidden=true;
  app.innerHTML='<header class="head bans-wrap"><div class="bans" id="pfBans"></div></header>'+
    '<div class="tools"><label class="search" style="max-width:320px"><span style="position:absolute;left:-9999px">Rechercher</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="pfQ" type="search" placeholder="Vue, classeur, projet…" autocomplete="off"></label><div class="chips" id="pfF"></div></div>'+
    '<div class="main"><div class="canvas" id="pfMain" style="padding:16px 18px;display:block;overflow-x:hidden">'+
      '<div class="two"><section class="block" style="margin-top:0"><h3 id="pfChartT"></h3><div id="pfChart"></div></section><section class="block" style="margin-top:0"><h3>Par heure de la journée <small>· 30 j</small></h3><div id="pfHour"></div></section></div>'+
      '<section class="block"><h3 id="pfTableT"></h3><div id="pfTable"></div></section>'+
    '</div><aside class="panel" id="pfPanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
}
function chips(){ $('pfF').innerHTML=[['all','Toutes',null]].concat(ST.map(s=>[s.k,s.l,s.c])).map(([k,l,c])=>'<button type="button" class="chip" data-f="'+k+'" aria-pressed="'+(st.f===k)+'">'+(c?'<i style="background:'+c+'"></i>':'')+l+'</button>').join(''); $('pfF').querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ st.f=b.dataset.f; chips(); bans(); table(); }); }
window.PERF_START = async function(){
  mount(); await load(); bans(); chips(); siteChart(); hourChart(); table(); panel();
  $('pfQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); table(); });
};
})();
