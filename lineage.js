/* Page Lineage — chargée par index.html quand le tableau de bord contient la feuille « Lineage_Data ».
   Aucune donnée dans ce fichier : tout est lu dans Tableau au moment de l'affichage. */
(function(){
'use strict';
const DATA = 'Lineage_Data', LIST = 'Lineage_WB';
const COLS = [
  {k:'T', l:'Tables BigQuery',      c:'#0B1F3A', i:'T'},
  {k:'P', l:'Sources publiées',     c:'#003A78', i:'P'},
  {k:'E', l:'Sources du classeur',  c:'#004E9F', i:'S'},
  {k:'C', l:'Champs calculés',      c:'#6B4FBB', i:'ƒ'},
  {k:'S', l:'Feuilles',             c:'#1F8A50', i:'▦'},
  {k:'D', l:'Tableaux de bord',     c:'#C98A00', i:'◫'}
];
const CI = Object.fromEntries(COLS.map((c,i)=>[c.k,i]));
const CW = 250, GAP = 72, NH = 34, NG = 8, TOP = 46, PADL = 16;
const KW = /^(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT|IN|IIF|FIXED|INCLUDE|EXCLUDE|TRUE|FALSE|NULL)$/i;

const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => (n||0).toLocaleString('fr-FR');
const dfr = t => { const d=new Date(t); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR'); };
const low = s => String(s||'').trim().toLowerCase();

let WD=null, WL=null, WBS=[], cur=null, G=null;
const st = { sel:null, calc:'used', q:'' };

/* ---------- lecture Tableau ---------- */
async function readTable(ws){
  if(ws.getSummaryDataReaderAsync){ const r=await ws.getSummaryDataReaderAsync(undefined,{ignoreSelection:true}); const t=await r.getAllPagesAsync(); await r.releaseAsync(); return t; }
  return ws.getSummaryDataAsync({maxRows:0, ignoreSelection:true});
}
function colIdx(t){
  const names = t.columns.map(c=>low(c.fieldName).replace(/^(attr|min|max)\((.*)\)$/,'$2'));
  const f = k => names.findIndex(n=>n===k);
  return {wb:f('wb'), type:f('type'), id:f('id'), parent:f('parent'), name:f('name'), info:f('info'), formula:f('formula')};
}
const val = (row,i) => { if(i<0) return ''; const c=row[i]; const v=c.value; return (v==null || v==='%null%' || c.formattedValue==='Null') ? '' : String(v); };
async function readRows(ws){
  const t = await readTable(ws), I = colIdx(t);
  const nl = x => x.replace(/\u23CE/g,'\n');
  return t.data.map(r=>({wb:val(r,I.wb), type:val(r,I.type), id:val(r,I.id)||val(r,I.wb), parent:val(r,I.parent), name:val(r,I.name), info:val(r,I.info), formula:nl(val(r,I.formula))}));
}

/* ---------- graphe d'un classeur ---------- */
function buildGraph(rows){
  const N = {}, up = {}, down = {}, deps = {};
  const key = (t,id) => t+':'+id;
  const add = (t,id,name,extra) => { const k=key(t,id); if(!N[k]) N[k]={k,t,id,name:name||id,...extra}; else if(name && N[k].name===N[k].id) N[k].name=name; return N[k]; };
  const link = (a,b) => { if(!a||!b||a===b) return; (down[a]=down[a]||new Set()).add(b); (up[b]=up[b]||new Set()).add(a); };
  let W=null; const eIds=new Set(), pIds=new Set();
  rows.forEach(r=>{ if(r.type==='E') eIds.add(r.id); if(r.type==='P') pIds.add(r.id); });
  const owner = p => eIds.has(p) ? key('E',p) : pIds.has(p) ? key('P',p) : null;
  const pUp = {}; // E -> [P]
  const sheetsV = {};
  rows.forEach(r=>{
    switch(r.type){
      case 'W': { const [proj,own,upd,partial]=r.info.split('|'); W={id:r.id,name:r.name,proj,own,upd,partial:partial==='partial'}; break; }
      case 'D': add('D',r.id,r.name); break;
      case 'S': { const s=add('S',r.id,r.name,{dash:r.info?r.info.split(','):[]}); break; }
      case 'E': add('E',r.id,r.name,{mode:r.info}); break;
      case 'P': add('P',r.id,r.name,{proj:r.info}); link(key('P',r.id), key('E',r.parent)); (pUp[r.parent]=pUp[r.parent]||[]).push(r.id); break;
      case 'T': { const [ct,db]=r.info.split('|'); const parts=r.name.replace(/[\[\]`]/g,'').split('.'); add('T',r.id,parts.length>1?parts.slice(-2).join('.'):r.name,{ct,db,full:r.name}); link(key('T',r.id), owner(r.parent)); break; }
      case 'C': { const [dt,role]=r.info.split('|'); add('C',r.id,r.name,{formula:r.formula,dt,role,ds:r.parent,dsk:owner(r.parent)}); link(owner(r.parent), key('C',r.id)); break; }
    }
  });
  rows.forEach(r=>{
    if(r.type==='S') (r.info?r.info.split(','):[]).forEach(d=>{ if(N[key('D',d)]) link(key('S',r.id), key('D',d)); });
    if(r.type==='U'){ const c = N[key('C',r.id)] || add('C',r.id,r.name,{formula:'',ds:r.info,dsk:owner(r.info)}); link(c.k, key('S',r.parent)); }
    if(r.type==='V'){ (sheetsV[r.parent]=sheetsV[r.parent]||[]).push({name:r.name, ds:r.info}); }
  });
  // champs de sources publiées utilisés via le classeur (DatasourceField) → rattachés par nom
  const calcByDs = {};
  Object.values(N).filter(n=>n.t==='C').forEach(c=>{ (calcByDs[c.ds]=calcByDs[c.ds]||{})[low(c.name)]=c; });
  Object.entries(sheetsV).forEach(([sid,list])=>{
    const sk=key('S',sid); let viaCalc=new Set();
    list.forEach(f=>{
      const cands=[f.ds, ...(pUp[f.ds]||[])]; let hit=null;
      for(const d of cands){ const m=(calcByDs[d]||{})[low(f.name)]; if(m){ hit=m; break; } }
      if(hit){ link(hit.k, sk); viaCalc.add(f.ds); }
      else if(N[key('E',f.ds)]) link(key('E',f.ds), sk);
    });
    if(N[sk]) N[sk].fields = list.map(f=>f.name);
  });
  // dépendances entre champs calculés (références [Champ] dans la formule)
  Object.values(N).filter(n=>n.t==='C').forEach(c=>{
    const scope = [c.ds, ...(pUp[c.ds]||[])], pool = Object.assign({}, ...scope.map(d=>calcByDs[d]||{}));
    // une source du classeur voit aussi les calculs de ses sources publiées
    const refs = new Set(); (c.formula.match(/\[[^\]]+\]/g)||[]).forEach(m=>refs.add(low(m.slice(1,-1))));
    c.refs=[...refs]; c.deps=[];
    refs.forEach(r=>{ const d=pool[r]; if(d && d.k!==c.k){ c.deps.push(d.k); (deps[c.k]=deps[c.k]||new Set()).add(d.k); } });
  });
  // usage : direct (feuille) ou indirect (dépendance d'un champ utilisé)
  const used = new Set();
  Object.values(N).filter(n=>n.t==='C' && [...(down[n.k]||[])].some(k=>k.startsWith('S:'))).forEach(c=>used.add(c.k));
  let grow=true; while(grow){ grow=false; [...used].forEach(k=>(deps[k]||[]).forEach(d=>{ if(!used.has(d)){ used.add(d); grow=true; } })); }
  Object.values(N).forEach(n=>{ if(n.t==='C') n.used=used.has(n.k); });
  const rdeps={}; Object.entries(deps).forEach(([c,set])=>set.forEach(d=>(rdeps[d]=rdeps[d]||new Set()).add(c)));
  return {W, N, up, down, deps, rdeps};
}

/* closure amont / aval (inclut les dépendances entre calculs) */
function closure(k){
  const res=new Set([k]);
  const walk=(start,dir)=>{ const q=[start]; while(q.length){ const x=q.shift();
    const nx=[...(dir==='up'?(G.up[x]||[]):(G.down[x]||[]))];
    if(dir==='up') nx.push(...(G.deps[x]||[])); else nx.push(...(G.rdeps[x]||[]));
    nx.forEach(n=>{ if(!res.has(n)){ res.add(n); q.push(n); } }); } };
  walk(k,'up'); walk(k,'down'); return res;
}

/* ---------- rendu ---------- */
function visible(n){
  if(n.t==='C'){ if(st.calc==='used' && !n.used) return false; if(st.calc==='unused' && n.used) return false; }
  if(st.q){ const q=low(st.q); if(!low(n.name).includes(q) && !(n.formula && low(n.formula).includes(q))) return false; }
  return true;
}
function order(nodes){
  const pos = {};
  const byCol = COLS.map(c=>nodes.filter(n=>n.t===c.k));
  const bary = (n, dir) => { const nb=[...(dir==='down'?(G.down[n.k]||[]):(G.up[n.k]||[]))].filter(k=>pos[k]!=null); return nb.length ? nb.reduce((a,k)=>a+pos[k],0)/nb.length : 1e6; };
  const set = arr => arr.forEach((n,i)=>pos[n.k]=i);
  byCol[5].sort((a,b)=>a.name.localeCompare(b.name,'fr')); set(byCol[5]);
  for(let c=4;c>=0;c--){ byCol[c].sort((a,b)=>bary(a,'down')-bary(b,'down') || a.name.localeCompare(b.name,'fr')); set(byCol[c]); }
  return byCol;
}
function draw(){
  const host=$('lCanvas'); const stage=$('lStage');
  if(!G){ stage.innerHTML=''; stage.style.width=stage.style.height='0'; return; }
  const all = Object.values(G.N).filter(visible);
  const byCol0 = order(all);
  const live = COLS.map((c,i)=>i).filter(i=>byCol0[i].length);
  const byCol = live.map(i=>byCol0[i]), CC = live.map(i=>COLS[i]);
  const H = Math.max(...byCol.map(c=>c.length),1)*(NH+NG)+TOP+20, Wd = Math.max(CC.length,1)*(CW+GAP)-GAP+PADL*2;
  const hi = st.sel && G.N[st.sel] ? closure(st.sel) : null;
  let h = '<svg class="edges" width="'+Wd+'" height="'+H+'" id="lEdges"></svg>';
  CC.forEach((c,i)=>{ h+='<div class="colh" style="position:absolute;left:'+(PADL+i*(CW+GAP))+'px;width:'+CW+'px;top:0">'+esc(c.l)+' <b>'+byCol[i].length+'</b></div>'; });
  const P = {};
  byCol.forEach((col,i)=>col.forEach((n,j)=>{
    const x=PADL+i*(CW+GAP), y=TOP+j*(NH+NG); P[n.k]={x,y};
    const cls = ['ln', n.k===st.sel?'sel':'', hi?(hi.has(n.k)?'on':'dim'):'', (n.t==='C'&&!n.used)?'unused':''].join(' ');
    const tag = n.t==='E' ? (n.mode==='extract'?'EXTRACT':'LIVE') : n.t==='C' && !n.used ? 'NON UTILISÉ' : n.t==='T' && n.ct && !/bigquery/i.test(n.ct) ? n.ct.toUpperCase().slice(0,10) : '';
    h+='<button type="button" class="'+cls+'" data-k="'+esc(n.k)+'" style="left:'+x+'px;top:'+y+'px;width:'+CW+'px" title="'+esc(n.full||n.name)+'"><span class="ic" style="background:'+COLS[CI[n.t]].c+'">'+COLS[CI[n.t]].i+'</span><span class="nm">'+esc(n.name)+'</span>'+(tag?'<span class="k">'+esc(tag)+'</span>':'')+'</button>';
  }));
  stage.innerHTML=h; stage.style.width=Wd+'px'; stage.style.height=H+'px';
  let paths='';
  Object.entries(G.down).forEach(([a,bs])=>bs.forEach(b=>{
    const A=P[a], B=P[b]; if(!A||!B) return;
    const x1=A.x+CW, y1=A.y+NH/2, x2=B.x, y2=B.y+NH/2, mx=(x1+x2)/2;
    const on = hi && hi.has(a) && hi.has(b);
    paths+='<path class="'+(hi?(on?'on':'dim'):'')+'" d="M'+x1+' '+y1+'C'+mx+' '+y1+' '+mx+' '+y2+' '+x2+' '+y2+'"/>';
  }));
  $('lEdges').innerHTML=paths;
  stage.querySelectorAll('.ln').forEach(b=>b.onclick=()=>select(b.dataset.k));
}
function select(k){ st.sel = (st.sel===k ? null : k); draw(); panel(); }

/* ---------- formules ---------- */
function hl(src, n){
  const pool = {}; if(n){ (n.deps||[]).forEach(k=>{ const d=G.N[k]; if(d) pool[low(d.name)]=k; }); }
  let out='', i=0; const s=src||'';
  while(i<s.length){
    const ch=s[i], rest=s.slice(i);
    let m;
    if(rest.startsWith('//')){ const e=s.indexOf('\n',i); const t=e<0?s.slice(i):s.slice(i,e); out+='<span class="c">'+esc(t)+'</span>'; i+=t.length; continue; }
    if(ch==='"'||ch==="'"){ let j=i+1; while(j<s.length && s[j]!==ch) j++; const t=s.slice(i,j+1); out+='<span class="s">'+esc(t)+'</span>'; i+=t.length; continue; }
    if(ch==='['){ const j=s.indexOf(']',i); const t=j<0?s.slice(i):s.slice(i,j+1); const kk=pool[low(t.slice(1,-1))]; out+= kk ? '<button type="button" class="f" data-k="'+esc(kk)+'">'+esc(t)+'</button>' : '<span class="f">'+esc(t)+'</span>'; i+=t.length; continue; }
    if((m=rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))){ const w=m[0]; out+= KW.test(w) ? '<span class="kw">'+esc(w)+'</span>' : /^\s*\(/.test(s.slice(i+w.length)) ? '<span class="kw" style="color:#C9A7FF;font-weight:500">'+esc(w)+'</span>' : esc(w); i+=w.length; continue; }
    out+=esc(ch); i++;
  }
  return out;
}

/* ---------- panneau ---------- */
const listOf = (ks, emptyTxt) => ks.length ? '<div class="list">'+ks.map(k=>{ const n=G.N[k]; return '<button type="button" data-k="'+esc(k)+'"><span class="dot" style="background:'+COLS[CI[n.t]].c+'"></span><span class="nm">'+esc(n.name)+'</span></button>'; }).join('')+'</div>' : '<p class="hint">'+emptyTxt+'</p>';
const ofType = (set,t) => [...(set||[])].filter(k=>k.startsWith(t+':')).sort((a,b)=>G.N[a].name.localeCompare(G.N[b].name,'fr'));
function reach(k, dir, t){ const res=new Set(), q=[k]; while(q.length){ const x=q.shift(); const nx=[...(dir==='up'?(G.up[x]||[]):(G.down[x]||[]))]; if(dir==='up') nx.push(...(G.deps[x]||[])); else nx.push(...(G.rdeps[x]||[])); nx.forEach(n=>{ if(!res.has(n)){ res.add(n); q.push(n); } }); } return ofType(res,t); }

function panel(){
  const p=$('lPanel');
  if(!G){ p.innerHTML='<div><div class="eyebrow">Lineage</div><h2>Choisissez un classeur</h2></div><p class="hint">Le lineage remonte de chaque tableau de bord jusqu’aux tables BigQuery, en passant par les sources et les champs calculés avec leurs formules.</p>'; return; }
  const n = st.sel && G.N[st.sel];
  const all = Object.values(G.N), cnt = t => all.filter(x=>x.t===t).length;
  let h='';
  if(!n){
    const C=all.filter(x=>x.t==='C'), un=C.filter(c=>!c.used).length, ext=all.filter(x=>x.t==='E'&&x.mode==='extract').length, emb=all.filter(x=>x.t==='E').length, pub=cnt('P');
    h+='<div><div class="eyebrow">Classeur · '+esc(G.W.proj||'')+'</div><h2>'+esc(G.W.name)+'</h2></div>';
    h+='<div class="grid2"><div class="cell"><span>Tableaux de bord</span><b>'+cnt('D')+'</b></div><div class="cell"><span>Feuilles</span><b>'+cnt('S')+'</b></div><div class="cell"><span>Sources</span><b>'+emb+(pub?' <small style="font-size:12px;color:var(--muted)">dont '+pub+' publiée'+(pub>1?'s':'')+'</small>':'')+'</b></div><div class="cell"><span>Tables BigQuery</span><b>'+cnt('T')+'</b></div><div class="cell"><span>Champs calculés</span><b>'+C.length+'</b></div><div class="cell"><span>Non utilisés</span><b>'+un+'</b></div><div class="cell"><span>Propriétaire</span><b class="sm">'+esc((G.W.own||'—').split('@')[0])+'</b></div><div class="cell"><span>Modifié le</span><b class="sm">'+dfr(G.W.upd)+'</b></div></div>';
    const f=[];
    if(G.W.partial) f.push(['', 'Lineage partiel : ce classeur dépasse la limite de la Metadata API (20 000 nœuds).']);
    if(un) f.push(['', un+' champ'+(un>1?'s calculés ne sont':' calculé n’est')+' utilisé'+(un>1?'s':'')+' dans aucune feuille : candidats au nettoyage.']);
    if(emb && !pub) f.push(['info','Aucune source publiée : les connexions sont embarquées dans le classeur, donc non réutilisables et non certifiables.']);
    if(ext) f.push(['info', ext+' source'+(ext>1?'s':'')+' en extrait.']);
    if(!cnt('T')) f.push(['info','Aucune table amont remontée par la Metadata API pour ce classeur.']);
    if(!f.length) f.push(['ok','Aucun point d’attention sur ce classeur.']);
    h+='<div class="sec"><div class="eyebrow">Points de gouvernance</div><ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul></div>';
    h+='<p class="hint">Cliquez sur un élément du graphe pour suivre son chemin, de la table BigQuery au tableau de bord.</p>';
  } else {
    const col=COLS[CI[n.t]];
    h+='<div><div class="eyebrow">'+esc(col.l.replace(/s$/,'').replace('Champs calculé','Champ calculé').replace('Tables BigQuery','Table').replace('Sources publiées','Source publiée').replace('Sources du classeur','Source du classeur').replace('Tableaux de bord','Tableau de bord'))+'</div><h2>'+esc(n.name)+'</h2></div>';
    if(n.t==='C'){
      h+='<div class="meta">'+(n.dt?'<span class="pill blue">'+esc(n.dt)+'</span>':'')+(n.role?'<span class="pill">'+esc(n.role)+'</span>':'')+(n.used?'<span class="pill">Utilisé</span>':'<span class="pill red">Non utilisé</span>')+(n.dsk && n.dsk.startsWith('P:')?'<span class="pill">Source publiée</span>':'')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Formule</div>'+(n.formula?'<pre class="code">'+hl(n.formula,n)+'</pre>':'<p class="hint">Formule non remontée par la Metadata API.</p>')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Dépend de</div>'+listOf((n.deps||[]),'Uniquement des colonnes de la source.')+'</div>';
      const by = [...(G.rdeps[n.k]||[])];
      if(by.length) h+='<div class="sec"><div class="eyebrow">Réutilisé par</div>'+listOf(by,'')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Feuilles</div>'+listOf(reach(n.k,'down','S'),'Aucune feuille.')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Source · tables</div>'+listOf([...(n.dsk?[n.dsk]:[]), ...reach(n.k,'up','T')],'—')+'</div>';
    } else if(n.t==='T'){
      h+='<div class="meta">'+(n.ct?'<span class="pill blue">'+esc(n.ct)+'</span>':'')+(n.db?'<span class="pill">'+esc(n.db)+'</span>':'')+'</div>';
      if(n.full) h+='<pre class="code" style="max-height:none">'+esc(n.full.replace(/[\[\]`]/g,''))+'</pre>';
      h+='<div class="sec"><div class="eyebrow">Alimente</div>'+listOf([...ofType(G.down[n.k],'P'),...ofType(G.down[n.k],'E')],'—')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Tableaux de bord impactés</div>'+listOf(reach(n.k,'down','D'),'Aucun.')+'</div>';
      h+='<p class="hint">Analyse d’impact : modifier ou supprimer cette table touche '+reach(n.k,'down','S').length+' feuille(s) et '+reach(n.k,'down','C').length+' champ(s) calculé(s) de ce classeur.</p>';
    } else if(n.t==='P' || n.t==='E'){
      const calcs=ofType(G.down[n.k],'C');
      h+='<div class="meta">'+(n.t==='E'?'<span class="pill blue">'+(n.mode==='extract'?'Extrait':'Live')+'</span>':'<span class="pill blue">Publiée</span>'+(n.proj?'<span class="pill">'+esc(n.proj)+'</span>':''))+'</div>';
      h+='<div class="sec"><div class="eyebrow">Tables amont</div>'+listOf(reach(n.k,'up','T'),'Aucune table remontée.')+'</div>';
      if(n.t==='E') h+='<div class="sec"><div class="eyebrow">Source publiée</div>'+listOf(ofType(G.up[n.k],'P'),'Connexion embarquée.')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Champs calculés · '+calcs.length+'</div>'+listOf(calcs,'Aucun.')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Tableaux de bord</div>'+listOf(reach(n.k,'down','D'),'Aucun.')+'</div>';
    } else if(n.t==='S'){
      h+='<div class="sec"><div class="eyebrow">Tableaux de bord</div>'+listOf(ofType(G.down[n.k],'D'),'Feuille hors tableau de bord.')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Champs calculés utilisés</div>'+listOf(ofType(G.up[n.k],'C'),'Aucun.')+'</div>';
      if(n.fields && n.fields.length) h+='<div class="sec"><div class="eyebrow">Champs de source</div><div class="meta">'+[...new Set(n.fields)].slice(0,40).map(f=>'<span class="pill">'+esc(f)+'</span>').join('')+'</div></div>';
      h+='<div class="sec"><div class="eyebrow">Tables BigQuery</div>'+listOf(reach(n.k,'up','T'),'—')+'</div>';
    } else if(n.t==='D'){
      h+='<div class="sec"><div class="eyebrow">Feuilles</div>'+listOf(ofType(G.up[n.k],'S'),'Aucune.')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Champs calculés</div>'+listOf(reach(n.k,'up','C'),'Aucun.')+'</div>';
      h+='<div class="sec"><div class="eyebrow">Tables BigQuery</div>'+listOf(reach(n.k,'up','T'),'—')+'</div>';
    }
    h+='<button type="button" class="ghost" id="lBack" style="align-self:flex-start">← Vue du classeur</button>';
  }
  p.innerHTML=h;
  p.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ st.sel=b.dataset.k; draw(); panel(); scrollTo(b.dataset.k); });
  const bk=$('lBack'); if(bk) bk.onclick=()=>{ st.sel=null; draw(); panel(); };
}
function scrollTo(k){ const el=$('lStage').querySelector('[data-k="'+CSS.escape(k)+'"]'); if(el) el.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'}); }

/* ---------- en-tête & sélecteur ---------- */
function kpis(){
  const k=[['Classeurs analysés', fmt(WBS.length)]];
  if(G){ const all=Object.values(G.N), C=all.filter(x=>x.t==='C');
    k.push(['Tableaux de bord',fmt(all.filter(x=>x.t==='D').length)],['Sources',fmt(all.filter(x=>x.t==='E').length)],['Tables BigQuery',fmt(all.filter(x=>x.t==='T').length)],['Champs calculés',fmt(C.length)],['Non utilisés',fmt(C.filter(c=>!c.used).length),C.some(c=>!c.used)]); }
  $('lKpis').innerHTML=k.map(([l,v,a])=>'<div class="kpi'+(a?' alert':'')+'"><b>'+v+'</b><span>'+l+'</span></div>').join('');
}
function dropList(q){
  const d=$('lDrop'); const ql=low(q);
  const hits=WBS.filter(w=>!ql || low(w.name).includes(ql) || low(w.proj).includes(ql) || low(w.own).includes(ql));
  if(!hits.length){ d.innerHTML='<div class="none">Aucun classeur trouvé.</div>'; d.hidden=false; return; }
  const groups={}; hits.slice(0,300).forEach(w=>(groups[w.proj||'—']=groups[w.proj||'—']||[]).push(w));
  d.innerHTML=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fr')).map(g=>'<div class="grp">'+esc(g)+'</div>'+groups[g].sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(w=>'<button type="button" data-w="'+esc(w.id)+'"><span class="nm">'+esc(w.name)+'</span><span class="r">'+esc((w.own||'').split('@')[0])+'</span></button>').join('')).join('')+(hits.length>300?'<div class="none">'+(hits.length-300)+' autres résultats : affinez la recherche.</div>':'');
  d.hidden=false;
  d.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{ d.hidden=true; openWb(b.dataset.w); });
}
async function openWb(id){
  const w=WBS.find(x=>x.id===id); if(!w) return;
  $('lPick').value=w.name; $('lLoading').hidden=false; $('lWelcome').hidden=true;
  try{
    await WD.applyFilterAsync('wb',[id],tableau.FilterUpdateType.Replace);
    const rows=(await readRows(WD)).filter(r=>r.wb===id);
    cur=id; G=buildGraph(rows); if(!G.W) G.W={id, name:w.name, proj:w.proj, own:w.own, upd:w.upd};
    st.sel=null; $('lSub').textContent=w.proj+' · '+w.name;
    try{ localStorage.setItem('lin.wb',id); }catch(e){}
  }catch(e){ G=null; $('lWelcome').hidden=false; $('lWelcome').innerHTML='<div><h3>Lecture impossible</h3><p>Le lineage de ce classeur n’a pas pu être lu.</p></div>'; }
  $('lLoading').hidden=true; kpis(); draw(); panel(); $('lCanvas').scrollTo({left:0,top:0});
}

/* ---------- démarrage ---------- */
function mount(){
  const css=document.createElement('link'); css.rel='stylesheet'; css.href='lineage.css'; document.head.appendChild(css);
  const app=document.createElement('div'); app.className='app lin'; app.id='lin'; app.hidden=true;
  app.innerHTML=
   '<header class="head"><div class="brand"><div class="mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="9" y="15" width="6" height="5" rx="1.5"/><path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 13v2"/></svg></div><div><h1>Lineage · Tableau France</h1><p id="lSub">Du tableau de bord aux tables BigQuery</p></div></div><div class="kpis" id="lKpis"></div></header>'+
   '<div class="tools"><label class="picker"><span style="position:absolute;left:-9999px">Choisir un classeur</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="lPick" type="search" placeholder="Choisir un classeur (nom, projet, propriétaire)…" autocomplete="off"><div class="drop" id="lDrop" hidden></div></label>'+
   '<div class="chips" role="group" aria-label="Champs calculés" id="lCalc"></div><span class="sep" aria-hidden="true"></span>'+
   '<label class="search" style="max-width:260px"><span style="position:absolute;left:-9999px">Chercher dans le lineage</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="lQ" type="search" placeholder="Champ, formule, table…" autocomplete="off"></label></div>'+
   '<div class="main" style="padding-top:10px"><div class="canvas" id="lCanvas" aria-label="Graphe de lineage"><div class="stage" id="lStage"></div><div class="welcome" id="lWelcome"><div><h3>Choisissez un classeur</h3><p>Recherchez-le par son nom, son projet ou son propriétaire.</p></div></div><div class="loading" id="lLoading" hidden><div class="ring" style="width:36px;height:36px;border-radius:50%;border:3px solid var(--blue-100);border-top-color:var(--blue);animation:spin 1s linear infinite"></div></div></div><aside class="panel" id="lPanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
  const chips=[['used','Champs utilisés'],['all','Tous les champs'],['unused','Non utilisés']];
  $('lCalc').innerHTML=chips.map(([k,l])=>'<button type="button" class="chip" data-c="'+k+'" aria-pressed="'+(st.calc===k)+'">'+l+'</button>').join('');
  $('lCalc').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{ st.calc=b.dataset.c; $('lCalc').querySelectorAll('[data-c]').forEach(x=>x.setAttribute('aria-pressed',x===b)); draw(); });
  const pick=$('lPick');
  pick.addEventListener('focus',()=>{ pick.select(); dropList(''); });
  pick.addEventListener('input',e=>dropList(e.target.value));
  pick.addEventListener('keydown',e=>{ if(e.key==='Escape') $('lDrop').hidden=true; if(e.key==='Enter'){ const b=$('lDrop').querySelector('[data-w]'); if(b) b.click(); } });
  document.addEventListener('click',e=>{ if(!e.target.closest('.picker')) $('lDrop').hidden=true; });
  $('lQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); draw(); });
}
window.LIN_START = async function(){
  mount();
  const dash=tableau.extensions.dashboardContent.dashboard;
  WD=dash.worksheets.find(w=>w.name===DATA); WL=dash.worksheets.find(w=>w.name===LIST);
  const gate=$('gate');
  try{
    const rows = await readRows(WL||WD);
    const seen=new Set();
    WBS = rows.filter(r=>r.type==='W' && r.wb!=='__none__' && !seen.has(r.wb) && seen.add(r.wb)).map(r=>{ const [proj,own,upd]=r.info.split('|'); return {id:r.wb,name:r.name,proj:proj||'',own:own||'',upd:upd||''}; });
    kpis(); panel(); draw();
    let last=null; try{ last=localStorage.getItem('lin.wb'); }catch(e){}
    if(last && WBS.some(w=>w.id===last)) openWb(last);
  }catch(e){
    $('gateTitle').textContent='Données indisponibles'; $('gateText').textContent='Lecture des feuilles « '+LIST+' » / « '+DATA+' » impossible.'; gate.hidden=false; gate.classList.add('locked'); throw e;
  }
};
window.LIN_OPEN_BY_NAME = function(name, proj){
  const n=low(name), p=low(proj).replace(/^[^a-z0-9]+/,'');
  const hits=WBS.filter(w=>low(w.name)===n);
  const w=hits.find(x=>low(x.proj).replace(/^[^a-z0-9]+/,'')===p) || hits[0];
  if(w) openWb(w.id); else { $('lPick').value=name; dropList(name); }
};
})();
