/* Page Lineage — chargée par index.html quand le tableau de bord contient la feuille « Lineage_Data ».
   Aucune donnée dans ce fichier : tout est lu dans Tableau au moment de l'affichage. */
(function(){
'use strict';
const DATA = 'Lineage_Data', LIST = 'Lineage_WB';
const COLS = [
  {k:'D', l:'Tableaux de bord',     c:'#C98A00', i:'◫'},
  {k:'S', l:'Feuilles',             c:'#1F8A50', i:'▦'},
  {k:'C', l:'Champs calculés',      c:'#6B4FBB', i:'ƒ'},
  {k:'E', l:'Sources du classeur',  c:'#004E9F', i:'S'},
  {k:'P', l:'Sources publiées',     c:'#003A78', i:'P'},
  {k:'T', l:'Tables BigQuery',      c:'#0B1F3A', i:'T'}
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
const st = { sel:null, path:{}, calc:'used', q:'' };

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
  let W=null; const eIds=new Set(), pIds=new Set(), B=[];
  rows.forEach(r=>{ if(r.type==='E') eIds.add(r.id); if(r.type==='P') pIds.add(r.id); });
  const owner = p => eIds.has(p) ? key('E',p) : pIds.has(p) ? key('P',p) : null;
  const pUp = {}; // E -> [P]
  const sheetsV = {}; const zset = new Set(), zHidden = new Set(), ksheet = {}; let twbOk = false;
  rows.forEach(r=>{
    switch(r.type){
      case 'W': { const [proj,own,upd,partial]=r.info.split('|'); W={id:r.id,name:r.name,proj,own,upd,partial:partial==='partial'}; break; }
      case 'D': add('D',r.id,r.name); break;
      case 'S': { const s=add('S',r.id,r.name,{dash:r.info?r.info.split(','):[]}); break; }
      case 'E': add('E',r.id,r.name,{mode:r.info, dsf:new Set((r.formula||'').split('|').filter(Boolean))}); break;
      case 'P': add('P',r.id,r.name,{proj:r.info}); link(key('P',r.id), key('E',r.parent)); (pUp[r.parent]=pUp[r.parent]||[]).push(r.id); break;
      case 'T': { const [ct,db]=r.info.split('|'); const parts=r.name.replace(/[\[\]`]/g,'').split('.'); add('T',r.id,parts.length>1?parts.slice(-2).join('.'):r.name,{ct,db,full:r.name}); link(key('T',r.id), owner(r.parent)); break; }
      case 'Y': twbOk = true; break;
      case 'B': { const [sev,kind,sh]=r.info.split('|'); B.push({sev,kind,id:r.id,ds:r.parent,name:r.name,sheets:kind==='ref'&&sh?sh.split(','):[],code:kind!=='ref'?sh:'',refs:kind==='ref'?r.formula.split('\u23D0').filter(Boolean):[],msg:kind!=='ref'?r.formula:''}); break; }
      case 'Z': zset.add(low(r.parent)+'|'+low(r.name)); if(r.info==='h') zHidden.add(low(r.parent)+'|'+low(r.name)); break;
      case 'K': { const [d,t,a,h]=r.info.split('|'); ksheet[r.name]={inDash:d==='1',inTip:t==='1',inAct:a==='1',hidden:h==='1'}; break; }
      case 'C': { const [dt,role,ns,nr,nw,fl]=r.info.split('|'); const num=v=>v===''||v==null?null:+v; add('C',r.id,r.name,{formula:r.formula,dt,role,ds:r.parent,dsk:owner(r.parent),nSheets:num(ns),nRef:num(nr),nWb:num(nw),inDsf:fl==='1'}); link(owner(r.parent), key('C',r.id)); break; }
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
  // statut d'usage — un champ n'est « non utilisé » que si sa suppression n'impacte aucun tableau de bord :
  //  · aucune feuille ne l'utilise, directement ou via un autre champ (lineage Tableau : downstreamSheets) ;
  //  · il ne sert pas de filtre de source de données ;
  //  · aucun champ utilisé ne le référence dans sa formule ;
  //  · pour une source publiée : aucun autre classeur du site ne l'utilise.
  //  Information manquante ou lineage partiel ⇒ on le considère utilisé (prudence).
  const C = Object.values(N).filter(n=>n.t==='C');
  const dsfNames = new Set(); Object.values(N).filter(n=>n.t==='E').forEach(e=>e.dsf && e.dsf.forEach(x=>dsfNames.add(x)));
  const used = new Set(), why = {};
  const mark = (c,reason) => { (why[c.k]=why[c.k]||[]).push(reason); used.add(c.k); };
  C.forEach(c=>{
    const onSheet = [...(down[c.k]||[])].some(k=>k.startsWith('S:'));
    if(onSheet) mark(c,'sheet');
    if(c.nSheets>0) mark(c, c.dsk && c.dsk.startsWith('P:') && !onSheet ? 'elsewhere' : 'lineage');
    if(c.inDsf || dsfNames.has(low(c.name))) mark(c,'dsfilter');
    if(c.nSheets==null) mark(c,'unknown');
    if(W && W.partial) mark(c,'partial');
  });
  let grow=true; while(grow){ grow=false; [...used].forEach(k=>(deps[k]||[]).forEach(d=>{ if(!used.has(d)){ (why[d]=why[d]||[]).push('dep'); used.add(d); grow=true; } })); }
  // contrôle final dans le XML du classeur : le champ ne doit apparaître nulle part ailleurs que dans sa propre définition
  // (feuilles, autres champs même non utilisés, actions, visibilité dynamique des zones, filtres de source, hiérarchies…)
  const eByP = {}; Object.entries(pUp).forEach(([e,ps])=>ps.forEach(pl=>(eByP[pl]=eByP[pl]||[]).push(e)));
  const clean = c => { const owners = c.dsk && c.dsk.startsWith('P:') ? (eByP[c.ds]||[]) : [c.ds]; return owners.some(e=>{ const en=N[key('E',e)]; return en && zset.has(low(en.name)+'|'+low(c.name)); }); };
  C.forEach(c=>{ if(used.has(c.k)) return; if(!twbOk){ (why[c.k]=why[c.k]||[]).push('notwb'); used.add(c.k); } else if(!clean(c)){ (why[c.k]=why[c.k]||[]).push('twb'); used.add(c.k); } });
  C.forEach(n=>{ n.used=used.has(n.k); n.why=why[n.k]||[]; n.elsewhereOnly = n.why.length && n.why.every(x=>x==='elsewhere'); });
  // statut affiché / masqué d'un champ supprimable (attribut hidden de sa définition)
  C.forEach(c=>{ if(c.used) return; const owners = c.dsk && c.dsk.startsWith('P:') ? (eByP[c.ds]||[]) : [c.ds]; c.hidden = owners.some(e=>{ const en=N[key('E',e)]; return en && zHidden.has(low(en.name)+'|'+low(c.name)); }); });
  // feuilles inutilisées : ni dans un tableau de bord, ni en infobulle (viz in tooltip), ni cible/source d'une action
  Object.values(N).filter(n=>n.t==='S').forEach(sn=>{ const k=ksheet[sn.name];
    if(k){ sn.inDash=k.inDash; sn.inTip=k.inTip; sn.inAct=k.inAct; sn.hidden=k.hidden; sn.unused=!k.inDash && !k.inTip && !k.inAct; }
    else { sn.inDash=[...(down[sn.k]||[])].some(x=>x.startsWith('D:')); sn.unused=null; } });
  const orph=Object.values(N).filter(n=>n.t==='S' && ![...(down[n.k]||[])].some(k=>k.startsWith('D:')));
  if(orph.length){ N['D:__orphan']={k:'D:__orphan',t:'D',id:'__orphan',name:'Feuilles hors tableau de bord',virtual:true}; orph.forEach(sn=>link(sn.k,'D:__orphan')); }
  const rdeps={}; Object.entries(deps).forEach(([c,set])=>set.forEach(d=>(rdeps[d]=rdeps[d]||new Set()).add(c)));
  // erreurs détectées (contrôle Metadata API) : champ cassé → feuilles → tableaux de bord
  const hit=(k,src)=>{ const n=N[k]; if(!n) return; (n.hitBy=n.hitBy||new Set()).add(src); };
  B.forEach(b=>{
    if(b.kind==='ref'){ const c=N[key('C',b.id)]; if(!c) return; c.err=b; b.k=c.k;
      if(b.sev==='E'){ const sh=new Set(b.sheets.map(id=>key('S',id)).filter(k=>N[k])); [...(down[c.k]||[])].filter(k=>k.startsWith('S:')).forEach(k=>sh.add(k));
        b.sk=[...sh]; sh.forEach(k=>{ hit(k,c.k); [...(down[k]||[])].filter(d=>d.startsWith('D:')).forEach(d=>hit(d,c.k)); }); }
    } else { const src=N[key('P',b.ds)]; b.k=src?src.k:null; if(src){ src.err=b; if(b.sev==='E'){ const q=[src.k], seen=new Set(); while(q.length){ const x=q.shift(); [...(down[x]||[])].forEach(y=>{ if(!seen.has(y)){ seen.add(y); q.push(y); if(y.startsWith('S:')||y.startsWith('D:')) hit(y,src.k); } }); } } } }
  });
  B.sort((a,b)=>(a.sev===b.sev?0:a.sev==='E'?-1:1) || ((b.sk||[]).length-(a.sk||[]).length) || a.name.localeCompare(b.name,'fr'));
  return {W, N, up, down, deps, rdeps, B};
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
  if(st.calc==='err'){ if(n.t==='C') return !!n.err; if(n.t==='S'||n.t==='D') return !!n.hitBy; }
  if(n.t==='C'){ if(st.calc==='used' && !n.used) return false; if(st.calc==='unused' && n.used) return false; }
  if(n.t==='S'){ if(st.calc==='unused' && !n.unused) return false; }
  if(st.q){ const q=low(st.q); if(!low(n.name).includes(q) && !(n.formula && low(n.formula).includes(q))) return false; }
  return true;
}
/* ---------- navigation en colonnes : tableau de bord → feuilles → champs → sources → tables ----------
   Chaque colonne ne montre que ce qui alimente l'élément choisi dans une colonne précédente. */
function upOf(k, t){ return reach(k,'up',t); }
function columns(){
  const q=low(st.q), match=n=> !q || low(n.name).includes(q) || (n.formula && low(n.formula).includes(q));
  const cols=[]; let anc=null;
  COLS.forEach((c,i)=>{
    let items;
    if(anc) items=upOf(anc,c.k).map(k=>G.N[k]);
    else items=Object.values(G.N).filter(n=>n.t===c.k && ((c.k!=='C' && c.k!=='S' && !(st.calc==='err' && c.k==='D')) || visible(n)));
    items=items.filter(n=>n && (match(n) || st.path[i]===n.k));
    const parentS = anc && anc.startsWith('S:') ? anc : null;
    items.forEach(n=>{ n._direct = parentS && n.t==='C' ? (G.down[n.k]||new Set()).has(parentS) : null; });
    items.sort((a,b)=> (a.t==='C' && parentS ? (b._direct-a._direct) : 0) || (a.virtual?1:0)-(b.virtual?1:0) || a.name.localeCompare(b.name,'fr'));
    cols.push({c, i, items, anc});
    if(st.path[i] && items.some(n=>n.k===st.path[i])) anc=st.path[i];
  });
  return cols;
}
function draw(){
  const stage=$('lStage');
  if(!G){ stage.innerHTML=''; stage.style.width=stage.style.height='0'; return; }
  // nettoie un chemin devenu incohérent
  const cols0=columns(); cols0.forEach(col=>{ const k=st.path[col.i]; if(k && !col.items.some(n=>n.k===k)) delete st.path[col.i]; });
  const cols=columns().filter(col=>col.items.length || col.anc);
  const H=Math.max(...cols.map(c=>c.items.length),1)*(NH+NG)+TOP+20, Wd=Math.max(cols.length,1)*(CW+GAP)-GAP+PADL*2;
  let h='<svg class="edges" width="'+Wd+'" height="'+H+'" id="lEdges"></svg>';
  const P={};
  cols.forEach((col,ci)=>{
    const x=PADL+ci*(CW+GAP);
    h+='<div class="colh" style="position:absolute;left:'+x+'px;width:'+CW+'px;top:0">'+esc(col.c.l)+' <b>'+col.items.length+'</b></div>';
    if(!col.items.length) h+='<div class="hint" style="position:absolute;left:'+x+'px;top:'+TOP+'px;width:'+CW+'px">Aucun élément.</div>';
    col.items.forEach((n,j)=>{
      const y=TOP+j*(NH+NG); P[n.k]={x,y,ci};
      const onPath=st.path[col.i]===n.k;
      const cls=['ln', n.k===st.sel?'sel':'', onPath?'on':'', ((n.t==='C'&&!n.used)||(n.t==='S'&&n.unused))?'unused':'', n.err&&n.err.sev==='E'?'err':'', n.err&&n.err.sev!=='E'?'warn':'', n.hitBy?'hit':''].join(' ');
      const etag = n.err ? (n.err.kind==='ref' ? (n.err.sev==='E'?'ERREUR':'CASSÉ') : n.err.kind==='ext'?'EXTRAIT KO':'ALERTE') : '';
      const tag = etag ? etag : n.t==='E' ? (n.mode==='extract'?'EXTRACT':'LIVE') : n.t==='C' && !n.used ? (n.hidden?'MASQUÉ':'AFFICHÉ') : n.t==='S' && n.unused ? (n.hidden?'MASQUÉE':'AFFICHÉE') : n.t==='C' && n._direct===false ? 'INDIRECT' : n.t==='T' && n.ct && !/bigquery/i.test(n.ct) ? n.ct.toUpperCase().slice(0,10) : '';
      const cnt = n.t==='D' ? upOf(n.k,'S').length : n.t==='S' ? upOf(n.k,'C').length : 0;
      h+='<button type="button" class="'+cls+'" data-k="'+esc(n.k)+'" data-c="'+col.i+'" style="left:'+x+'px;top:'+y+'px;width:'+CW+'px" title="'+esc(n.full||n.name)+'"><span class="ic" style="background:'+COLS[CI[n.t]].c+'">'+COLS[CI[n.t]].i+'</span><span class="nm">'+esc(n.name)+'</span>'+(n.hitBy&&!n.err?'<span class="bug" title="Impacté par '+n.hitBy.size+' erreur'+(n.hitBy.size>1?'s':'')+'">⚠</span>':'')+(tag?'<span class="k'+(etag||((n.t==='C'&&!n.used)||(n.t==='S'&&n.unused))?' red':'')+'" title="'+(((n.t==='C'&&!n.used)||(n.t==='S'&&n.unused))?'Inutilisé · '+(n.hidden?'masqué':'affiché'):'')+'">'+esc(tag)+'</span>':'')+(cnt?'<span class="cnt">'+cnt+'</span>':'')+'<span class="chev" aria-hidden="true">›</span></button>';
    });
  });
  stage.innerHTML=h; stage.style.width=Wd+'px'; stage.style.height=H+'px';
  // liens : uniquement de l'élément choisi vers la colonne suivante
  let paths='';
  cols.forEach((col,ci)=>{ const k=st.path[col.i]; const A=k&&P[k]; const nx=cols[ci+1]; if(!A||!nx) return;
    nx.items.forEach(n=>{ const B=P[n.k]; const x1=A.x+CW, y1=A.y+NH/2, x2=B.x, y2=B.y+NH/2, mx=(x1+x2)/2; paths+='<path class="on" d="M'+x1+' '+y1+'C'+mx+' '+y1+' '+mx+' '+y2+' '+x2+' '+y2+'"/>'; }); });
  $('lEdges').innerHTML=paths;
  stage.querySelectorAll('.ln').forEach(b=>b.onclick=()=>select(b.dataset.k,+b.dataset.c));
}
function deepest(){ const ks=Object.keys(st.path).map(Number).sort((a,b)=>a-b); return ks.length? st.path[ks[ks.length-1]] : null; }
function focusBar(){ const f=$('lFocus'); if(!f) return; const ks=Object.keys(st.path).map(Number).sort((a,b)=>a-b); if(!ks.length||!G){ f.hidden=true; return; } f.hidden=false;
  f.innerHTML='<span class="fl">Filtré sur</span>'+ks.map(i=>{ const n=G.N[st.path[i]]; return '<span class="ic" style="background:'+COLS[CI[n.t]].c+'">'+COLS[CI[n.t]].i+'</span><b>'+esc(n.name)+'</b>'; }).join('<span class="fl">›</span>')+'<span class="x" aria-hidden="true">✕</span>'; f.title='Afficher tout le classeur'; }
function select(k, ci){
  if(ci==null) ci=CI[G.N[k].t];
  if(st.path[ci]===k){ Object.keys(st.path).forEach(i=>{ if(+i>=ci) delete st.path[i]; }); }
  else { Object.keys(st.path).forEach(i=>{ if(+i>=ci) delete st.path[i]; }); st.path[ci]=k;
    // élément choisi depuis le panneau, hors des colonnes affichées : on repart de lui
    if(!columns()[ci].items.some(n=>n.k===k)){ st.path={}; st.path[ci]=k; } }
  st.sel=deepest(); draw(); panel(); focusBar();
  // la colonne choisie se cale à gauche : la colonne suivante (filtrée) est visible sans défiler
  const el=$('lStage').querySelector('[data-k="'+CSS.escape(k)+'"]'); const cv=$('lCanvas');
  const x = el ? parseFloat(el.style.left) : 0; const fits = x+2*CW+GAP <= cv.clientWidth;
  cv.scrollTo({top:0, left: (!st.path[ci] || fits) ? 0 : Math.max(0, x-PADL), behavior:'smooth'});
}
/* ---------- formules ---------- */
function hl(src, n){
  const pool = {}; if(n){ (n.deps||[]).forEach(k=>{ const d=G.N[k]; if(d) pool[low(d.name)]=k; }); }
  let out='', i=0; const s=src||'';
  while(i<s.length){
    const ch=s[i], rest=s.slice(i);
    let m;
    if(rest.startsWith('//')){ const e=s.indexOf('\n',i); const t=e<0?s.slice(i):s.slice(i,e); out+='<span class="c">'+esc(t)+'</span>'; i+=t.length; continue; }
    if(ch==='"'||ch==="'"){ let j=i+1; while(j<s.length && s[j]!==ch) j++; const t=s.slice(i,j+1); out+='<span class="s">'+esc(t)+'</span>'; i+=t.length; continue; }
    if(ch==='['){ const j=s.indexOf(']',i); let t=j<0?s.slice(i):s.slice(i,j+1);
      const bad=n&&n.err&&n.err.refs&&n.err.refs.find(r=>s.startsWith('['+r+']',i)); if(bad){ t='['+bad+']'; out+='<span class="bad" title="Référence introuvable">'+esc(t)+'</span>'; i+=t.length; continue; }
      const kk=pool[low(t.slice(1,-1))]; out+= kk ? '<button type="button" class="f" data-k="'+esc(kk)+'">'+esc(t)+'</button>' : '<span class="f">'+esc(t)+'</span>'; i+=t.length; continue; }
    if((m=rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))){ const w=m[0]; out+= KW.test(w) ? '<span class="kw">'+esc(w)+'</span>' : /^\s*\(/.test(s.slice(i+w.length)) ? '<span class="kw" style="color:#C9A7FF;font-weight:500">'+esc(w)+'</span>' : esc(w); i+=w.length; continue; }
    out+=esc(ch); i++;
  }
  return out;
}

/* ---------- erreurs ---------- */
const KIND={ref:'Référence introuvable', ext:'Actualisation d’extrait en échec', dqw:'Avertissement qualité des données'};
function errLine(b){
  const sk=b.sk||[]; const dk=new Set(); sk.forEach(k=>[...(G.down[k]||[])].filter(d=>d.startsWith('D:')).forEach(d=>dk.add(d)));
  if(b.kind==='ref') return b.sev==='E'
    ? '<b>'+esc(b.name)+'</b> : référence'+(b.refs.length>1?'s':'')+' introuvable'+(b.refs.length>1?'s':'')+' '+b.refs.slice(0,3).map(r=>'<code>['+esc(r)+']</code>').join(', ')+'. Impacte '+sk.length+' feuille'+(sk.length>1?'s':'')+(dk.size?' et '+dk.size+' tableau'+(dk.size>1?'x':'')+' de bord':'')+'.'
    : '<b>'+esc(b.name)+'</b> : champ cassé ('+b.refs.slice(0,2).map(r=>'<code>['+esc(r)+']</code>').join(', ')+') mais utilisé nulle part. Aucun impact visible, à supprimer.';
  if(b.kind==='ext') return '<b>'+esc(b.name)+'</b> : actualisation de l’extrait en échec. '+esc(b.msg)+'. Les tableaux de bord affichent des données figées.';
  return '<b>'+esc(b.name)+'</b> : '+esc(b.msg||'avertissement qualité actif sur la source.');
}
function errSection(n){
  const b=n.err; if(!b) return '';
  let h='<div class="sec"><div class="eyebrow" style="color:#9A0016">'+(b.sev==='E'?'Erreur':'Anomalie')+' · '+esc(KIND[b.kind]||b.kind)+'</div><ul class="flags">';
  if(b.kind==='ref'){
    h+='<li>La formule fait référence à '+b.refs.map(r=>'<code>['+esc(r)+']</code>').join(', ')+', '+(b.refs.length>1?'qui n’existent':'qui n’existe')+' pas dans la source « '+esc((G.N[n.dsk]||{}).name||'')+' » ni dans les paramètres du classeur.</li>';
    h+='<li class="info"><b>Cause probable</b> : champ renommé ou supprimé en amont (colonne BigQuery renommée, champ retiré de la source publiée, ou copie de champ « (copie)_… » supprimée).</li>';
    h+=b.sev==='E' ? '<li class="info"><b>Effet</b> : les feuilles qui utilisent ce champ, directement ou via un autre calcul, affichent une erreur ou des valeurs vides.</li><li class="ok"><b>Correction</b> : remplacer la référence dans la formule par le nouveau nom du champ, ou restaurer le champ dans la source.</li>'
                   : '<li class="ok">Aucune feuille ne l’utilise : supprimer le champ suffit.</li>';
  } else if(b.kind==='ext'){
    h+='<li>'+esc(b.msg)+'</li><li class="info"><b>Effet</b> : les données de tous les classeurs connectés à cette source restent figées à la dernière actualisation réussie.</li><li class="ok"><b>Correction</b> : vérifier l’erreur dans l’historique des tâches (identifiants, table renommée, quota BigQuery), puis relancer l’actualisation.</li>';
  } else h+='<li>'+esc(b.msg)+'</li>';
  return h+'</ul></div>';
}
function hitSection(n){
  if(!n.hitBy||n.err) return '';
  return '<div class="sec"><div class="eyebrow" style="color:#9A0016">Impacté par une erreur</div>'+listOf([...n.hitBy],'')+'</div>';
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
    h+='<div class="grid2"><div class="cell"><span>Tableaux de bord</span><b>'+all.filter(x=>x.t==='D'&&!x.virtual).length+'</b></div><div class="cell"><span>Feuilles</span><b>'+cnt('S')+'</b></div><div class="cell"><span>Sources</span><b>'+emb+(pub?' <small style="font-size:12px;color:var(--muted)">dont '+pub+' publiée'+(pub>1?'s':'')+'</small>':'')+'</b></div><div class="cell"><span>Tables BigQuery</span><b>'+cnt('T')+'</b></div><div class="cell"><span>Champs calculés</span><b>'+C.length+'</b></div><div class="cell"><span>Non utilisés</span><b>'+un+'</b></div><div class="cell"><span>Propriétaire</span><b class="sm">'+esc((G.W.own||'—').split('@')[0])+'</b></div><div class="cell"><span>Modifié le</span><b class="sm">'+dfr(G.W.upd)+'</b></div></div>';
    const BE=G.B.filter(b=>b.sev==='E'), BW=G.B.filter(b=>b.sev!=='E');
    if(G.B.length){ h+='<div class="sec"><div class="eyebrow" style="color:#9A0016">Erreurs détectées · '+BE.length+(BW.length?' <span style="color:var(--muted);font-weight:500">+ '+BW.length+' champ'+(BW.length>1?'s cassés inutilisés':' cassé inutilisé')+'</span>':'')+'</div><div class="errs">'+
      G.B.slice(0,40).map((b,i)=>'<button type="button" class="eb '+(b.sev==='E'?'e':'w')+'" data-b="'+i+'">'+errLine(b)+'</button>').join('')+'</div>'+(G.B.length>40?'<p class="hint">40 premières affichées · filtre « En erreur » pour tout voir.</p>':'')+'<p class="hint">Contrôle Metadata API du '+dfr(G.W.chk||'')+'.</p></div>'; }
    else h+='<ul class="flags"><li class="ok">Aucune erreur détectée sur ce classeur (formules, extraits, alertes qualité).</li></ul>';
    const f=[];
    if(G.W.partial) f.push(['', 'Lineage partiel : ce classeur dépasse la limite de la Metadata API (20 000 nœuds).']);
    if(un) f.push(['', un+' champ'+(un>1?'s calculés sont supprimables':' calculé est supprimable')+' sans aucun changement : référencé'+(un>1?'s':'')+' nulle part dans le classeur (feuilles, champs, actions, visibilité dynamique, filtres).']);
    if(C.some(c=>c.why.includes('notwb'))) f.push(['info','Le XML de ce classeur n’a pas pu être analysé : aucun champ n’est proposé à la suppression.']);
    const unH=C.filter(c=>!c.used&&c.hidden).length; if(un) f.push(['info','Champs supprimables : '+(un-unH)+' affiché'+((un-unH)>1?'s':'')+' et '+unH+' masqué'+(unH>1?'s':'')+' dans le volet Données.']);
    const SU=all.filter(x=>x.t==='S'&&x.unused), suH=SU.filter(x=>x.hidden).length; if(SU.length) f.push(['', SU.length+' feuille'+(SU.length>1?'s inutilisées':' inutilisée')+' (ni tableau de bord, ni infobulle, ni action) : '+(SU.length-suH)+' affichée'+((SU.length-suH)>1?'s':'')+', '+suH+' masquée'+(suH>1?'s':'')+'.']);
    const ew=C.filter(c=>c.elsewhereOnly).length; if(ew) f.push(['info', ew+' champ'+(ew>1?'s':'')+' de source publiée non utilisé'+(ew>1?'s':'')+' ici mais utilisé'+(ew>1?'s':'')+' par d’autres classeurs : à conserver.']);
    if(emb && !pub) f.push(['info','Aucune source publiée : les connexions sont embarquées dans le classeur, donc non réutilisables et non certifiables.']);
    if(ext) f.push(['info', ext+' source'+(ext>1?'s':'')+' en extrait.']);
    if(!cnt('T')) f.push(['info','Aucune table amont remontée par la Metadata API pour ce classeur.']);
    if(!f.length) f.push(['ok','Aucun point d’attention sur ce classeur.']);
    h+='<div class="sec"><div class="eyebrow">Points de gouvernance</div><ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul></div>';
    h+='<p class="hint">Cliquez sur un élément du graphe pour suivre son chemin, de la table BigQuery au tableau de bord.</p>';
  } else {
    const col=COLS[CI[n.t]];
    h+='<div><div class="eyebrow">'+esc(col.l.replace(/s$/,'').replace('Champs calculé','Champ calculé').replace('Tables BigQuery','Table').replace('Sources publiées','Source publiée').replace('Sources du classeur','Source du classeur').replace('Tableaux de bord','Tableau de bord'))+'</div><h2>'+esc(n.name)+'</h2></div>';
    h+=errSection(n)+hitSection(n);
    if(n.t==='C'){
      h+='<div class="meta">'+(n.dt?'<span class="pill blue">'+esc(n.dt)+'</span>':'')+(n.role?'<span class="pill">'+esc(n.role)+'</span>':'')+(n.used?(n.elsewhereOnly?'<span class="pill">Utilisé dans d’autres classeurs</span>':'<span class="pill">Utilisé</span>'):'<span class="pill red">Non utilisé · supprimable</span><span class="pill">'+(n.hidden?'Masqué dans le volet Données':'Affiché dans le volet Données')+'</span>')+(n.dsk && n.dsk.startsWith('P:')?'<span class="pill">Source publiée</span>':'')+'</div>';
      { const W2={sheet:'utilisé directement dans une feuille de ce classeur', lineage:'utilisé par '+(n.nSheets||0)+' feuille(s), directement ou via un autre champ (lineage Tableau)', elsewhere:'source publiée : utilisé par '+(n.nSheets||0)+' feuille(s) dans '+(n.nWb||0)+' classeur(s) du site', dsfilter:'sert de filtre de source de données', dep:'référencé dans la formule d’un champ utilisé', twb:'référencé ailleurs dans le classeur : formule d’un autre champ, action, visibilité dynamique d’une zone, filtre, ensemble, groupe ou hiérarchie', notwb:'XML du classeur non analysable : considéré utilisé par prudence', unknown:'statut non remonté par la Metadata API : considéré utilisé par prudence', partial:'lineage partiel de ce classeur : considéré utilisé par prudence'};
        const refBy=[...(G.rdeps[n.k]||[])];
        let st='';
        if(n.used) st='<ul class="flags">'+[...new Set(n.why)].map(x=>'<li class="info">'+esc(W2[x]||x)+'</li>').join('')+'</ul>';
        else st='<ul class="flags"><li class="ok">Supprimable sans aucun changement sur le tableau de bord : le champ n’apparaît nulle part dans le classeur hors de sa propre définition (ni feuille, ni autre champ, ni action, ni visibilité dynamique, ni filtre, ensemble, groupe ou hiérarchie)'+(n.dsk&&n.dsk.startsWith('P:')?', et aucun autre classeur du site ne l’utilise':'')+'.</li></ul>';
        h+='<div class="sec"><div class="eyebrow">Statut d’usage</div>'+st+'</div>'; }
      h+='<div class="sec"><div class="eyebrow">Formule</div>'+(n.formula?'<pre class="code">'+hl(n.formula,n)+'</pre>':'<p class="hint">Formule non remontée par la Metadata API.</p>')+'</div>';
      { const unres=(n.formula.match(/\[Calculation_\d+\]/gi)||[]).length; h+='<div class="sec"><div class="eyebrow">Dépend de</div>'+listOf((n.deps||[]), unres?'':'Uniquement des colonnes de la source.')+(unres?'<p class="hint">'+unres+' référence'+(unres>1?'s':'')+' à un champ interne (Calculation_…) que la Metadata API ne nomme pas.</p>':'')+'</div>'; }
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
      { const pills=[]; if(n.unused===true) pills.push('<span class="pill red">Inutilisée</span>'); else if(n.unused===false) pills.push('<span class="pill">Utilisée</span>'); if(n.hidden!=null) pills.push('<span class="pill blue">'+(n.hidden?'Masquée':'Affichée')+'</span>'); h+='<div class="meta">'+pills.join('')+'</div>';
        const L=[]; if(n.inDash) L.push(['info','placée dans au moins un tableau de bord']); if(n.inTip) L.push(['info','affichée en infobulle d’une autre feuille (viz in tooltip)']); if(n.inAct) L.push(['info','utilisée dans une action']);
        if(n.unused) L.push(n.hidden?['ok','Inutilisée et masquée : ni tableau de bord, ni infobulle, ni action. Supprimable sans changement pour les utilisateurs.']:['', 'Inutilisée mais affichée : elle n’est dans aucun tableau de bord, mais reste publiée comme vue consultable. Masquez-la ou supprimez-la si personne ne l’ouvre directement.']);
        if(n.unused==null) L.push(['info','XML du classeur non analysé : statut affiché/masqué inconnu.']);
        h+='<div class="sec"><div class="eyebrow">Statut d’usage</div><ul class="flags">'+L.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul></div>'; }
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
  p.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>select(b.dataset.k));
  p.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>{ const e=G.B[+b.dataset.b]; if(e&&e.k){ if(e.sev!=='E'&&st.calc==='used'){ st.calc='all'; syncChips(); } select(e.k); } });
  const bk=$('lBack'); if(bk) bk.onclick=()=>{ st.path={}; st.sel=null; draw(); panel(); focusBar(); };
}
function scrollTo(k){ const el=$('lStage').querySelector('[data-k="'+CSS.escape(k)+'"]'); if(el) el.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'}); }

/* ---------- en-tête & sélecteur ---------- */
function kpis(){
  const k=[['Classeurs analysés', fmt(WBS.length)]];
  if(G){ const all=Object.values(G.N), C=all.filter(x=>x.t==='C');
    k.push(['Tableaux de bord',fmt(all.filter(x=>x.t==='D'&&!x.virtual).length)],['Sources',fmt(all.filter(x=>x.t==='E').length)],['Tables BigQuery',fmt(all.filter(x=>x.t==='T').length)],['Champs calculés',fmt(C.length)],['Champs inutilisés',fmt(C.filter(c=>!c.used).length),C.some(c=>!c.used)],['Feuilles inutilisées',fmt(all.filter(x=>x.t==='S'&&x.unused).length),all.some(x=>x.t==='S'&&x.unused)]);
    const ne=G.B.filter(b=>b.sev==='E').length; k.splice(1,0,['Erreurs',fmt(ne),ne>0]); }
  else { const e=WBS.filter(w=>w.nE>0); k.push(['Classeurs en erreur',fmt(e.length),e.length>0],['Erreurs',fmt(e.reduce((a,w)=>a+w.nE,0)),e.length>0]); }
  $('lKpis').innerHTML=k.map(([l,v,a])=>'<div class="kpi'+(a?' alert':'')+'"><b>'+v+'</b><span>'+l+'</span></div>').join('');
}
function dropList(q){
  const d=$('lDrop'); const ql=low(q);
  const hits=WBS.filter(w=>!ql || low(w.name).includes(ql) || low(w.proj).includes(ql) || low(w.own).includes(ql));
  if(!hits.length){ d.innerHTML='<div class="none">Aucun classeur trouvé.</div>'; d.hidden=false; return; }
  const groups={}; hits.slice(0,300).forEach(w=>(groups[w.proj||'—']=groups[w.proj||'—']||[]).push(w));
  d.innerHTML=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fr')).map(g=>'<div class="grp">'+esc(g)+'</div>'+groups[g].sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(w=>'<button type="button" data-w="'+esc(w.id)+'"><span class="nm">'+esc(w.name)+'</span>'+(w.nE?'<span class="eb-n" title="'+w.nE+' erreur(s)">⚠ '+w.nE+'</span>':'')+'<span class="r">'+esc((w.own||'').split('@')[0])+'</span></button>').join('')).join('')+(hits.length>300?'<div class="none">'+(hits.length-300)+' autres résultats : affinez la recherche.</div>':'');
  d.hidden=false;
  d.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{ d.hidden=true; openWb(b.dataset.w); });
}
async function openWb(id){
  const w=WBS.find(x=>x.id===id); if(!w) return;
  $('lPick').value=w.name; $('lLoading').hidden=false; $('lWelcome').hidden=true;
  try{
    await WD.applyFilterAsync('wb',[id],tableau.FilterUpdateType.Replace);
    const rows=(await readRows(WD)).filter(r=>r.wb===id);
    cur=id; G=buildGraph(rows); if(!G.W) G.W={id, name:w.name, proj:w.proj, own:w.own, upd:w.upd}; G.W.chk=w.chk;
    st.sel=null; st.path={}; focusBar(); $('lSub').textContent=w.proj+' · '+w.name;
    try{ localStorage.setItem('lin.wb',id); }catch(e){}
  }catch(e){ G=null; $('lWelcome').hidden=false; $('lWelcome').innerHTML='<div><h3>Lecture impossible</h3><p>Le lineage de ce classeur n’a pas pu être lu.</p></div>'; }
  $('lLoading').hidden=true; syncChips(); kpis(); draw(); panel(); $('lCanvas').scrollTo({left:0,top:0});
}

/* ---------- démarrage ---------- */
function mount(){
  const css=document.createElement('link'); css.rel='stylesheet'; css.href='lineage.css?v=12'; document.head.appendChild(css);
  const app=document.createElement('div'); app.className='app lin'; app.id='lin'; app.hidden=true;
  app.innerHTML=
   '<header class="head"><div class="brand"><div class="mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="9" y="15" width="6" height="5" rx="1.5"/><path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 13v2"/></svg></div><div><h1>Lineage · Tableau France</h1><p id="lSub">Du tableau de bord aux tables BigQuery</p></div></div><div class="kpis" id="lKpis"></div></header>'+
   '<div class="tools"><label class="picker"><span style="position:absolute;left:-9999px">Choisir un classeur</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="lPick" type="search" placeholder="Choisir un classeur (nom, projet, propriétaire)…" autocomplete="off"><div class="drop" id="lDrop" hidden></div></label>'+
   '<button type="button" class="chip chip-err" id="lAlerts" title="Revenir à la liste des erreurs du site">⚠ Alertes du site</button>'+
   '<button type="button" class="focus" id="lFocus" hidden></button>'+
   '<div class="chips" role="group" aria-label="Champs calculés" id="lCalc"></div><span class="sep" aria-hidden="true"></span>'+
   '<label class="search" style="max-width:260px"><span style="position:absolute;left:-9999px">Chercher dans le lineage</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="lQ" type="search" placeholder="Champ, formule, table…" autocomplete="off"></label></div>'+
   '<div class="main" style="padding-top:10px"><div class="canvas" id="lCanvas" aria-label="Graphe de lineage"><div class="stage" id="lStage"></div><div class="welcome" id="lWelcome"><div><h3>Choisissez un classeur</h3><p>Recherchez-le par son nom, son projet ou son propriétaire.</p></div></div><div class="loading" id="lLoading" hidden><div class="ring" style="width:36px;height:36px;border-radius:50%;border:3px solid var(--blue-100);border-top-color:var(--blue);animation:spin 1s linear infinite"></div></div></div><aside class="panel" id="lPanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
  syncChips();
  const pick=$('lPick');
  pick.addEventListener('focus',()=>{ pick.select(); dropList(''); });
  pick.addEventListener('input',e=>dropList(e.target.value));
  pick.addEventListener('keydown',e=>{ if(e.key==='Escape') $('lDrop').hidden=true; if(e.key==='Enter'){ const b=$('lDrop').querySelector('[data-w]'); if(b) b.click(); } });
  document.addEventListener('click',e=>{ if(!e.target.closest('.picker')) $('lDrop').hidden=true; });
  $('lQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); draw(); });
  $('lAlerts').onclick=()=>{ G=null; cur=null; st.path={}; st.sel=null; try{ localStorage.removeItem('lin.wb'); }catch(e){} $('lPick').value=''; $('lWelcome').hidden=false; $('lSub').textContent='Du tableau de bord aux tables BigQuery'; siteAlerts(); kpis(); draw(); panel(); focusBar(); syncChips(); };
  $('lFocus').onclick=()=>{ st.path={}; st.sel=null; draw(); panel(); focusBar(); $('lCanvas').scrollTo({left:0,top:0}); };
}
function syncChips(){
  const ne=G?G.B.length:0;
  const chips=[['used','Utilisés'],['all','Tout'],['unused','Inutilisés (champs et feuilles)'],['err','En erreur'+(G?' · '+ne:'')]];
  $('lCalc').innerHTML=chips.map(([k,l])=>'<button type="button" class="chip'+(k==='err'?' chip-err':'')+'" data-c="'+k+'" aria-pressed="'+(st.calc===k)+'">'+l+'</button>').join('');
  $('lCalc').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{ st.calc=b.dataset.c; syncChips(); st.path={}; st.sel=null; draw(); panel(); focusBar(); });
}
/* écran d'accueil : alertes du site */
let ALLB=[];
function siteAlerts(){
  const wl=$('lWelcome'); if(G) return;
  const E=WBS.filter(w=>w.nE>0).sort((a,b)=>b.nE-a.nE||a.name.localeCompare(b.name,'fr'));
  const byK={}; ALLB.forEach(b=>{ if(b.sev==='E') byK[b.kind]=(byK[b.kind]||0)+1; });
  let h='<div class="alerts"><div class="ah"><h3>Alertes du site</h3><p class="hint">Contrôle automatique via la Metadata API'+(WBS[0]&&WBS[0].chk?' du '+dfr(WBS[0].chk):'')+' : formules qui référencent un champ disparu, extraits en échec, avertissements qualité. Choisissez un classeur ci-dessus pour son lineage complet.</p></div>';
  h+='<div class="acards"><div class="ac"><b>'+E.length+'</b><span>classeurs avec une erreur visible</span></div><div class="ac"><b>'+(byK.ref||0)+'</b><span>champs en erreur utilisés dans des feuilles</span></div><div class="ac"><b>'+(byK.ext||0)+'</b><span>liens classeur → extrait en échec</span></div><div class="ac muted"><b>'+ALLB.filter(b=>b.sev!=='E').length+'</b><span>champs cassés inutilisés (sans impact)</span></div></div>';
  if(E.length) h+='<table class="atab"><thead><tr><th>Classeur</th><th>Projet</th><th class="n">Erreurs</th><th>Cause</th></tr></thead><tbody>'+E.map(w=>{ const ks=[...new Set(ALLB.filter(b=>b.wb===w.id&&b.sev==='E').map(b=>b.kind))]; return '<tr data-w="'+esc(w.id)+'"><td><b>'+esc(w.name)+'</b><small>'+esc((w.own||'').split('@')[0])+'</small></td><td>'+esc(w.proj)+'</td><td class="n"><span class="eb-n">⚠ '+w.nE+'</span></td><td>'+ks.map(k=>'<span class="pill red">'+esc(KIND[k]||k)+'</span>').join(' ')+'</td></tr>'; }).join('')+'</tbody></table>';
  else h+='<ul class="flags"><li class="ok">Aucune erreur visible détectée sur le site.</li></ul>';
  h+='<p class="hint">Cliquez sur un classeur pour voir le champ en cause, sa formule et les feuilles impactées.</p></div>';
  wl.innerHTML=h; wl.classList.add('wa');
  wl.querySelectorAll('[data-w]').forEach(tr=>tr.onclick=()=>openWb(tr.dataset.w));
}
window.LIN_START = async function(){
  mount();
  const dash=tableau.extensions.dashboardContent.dashboard;
  WD=dash.worksheets.find(w=>w.name===DATA); WL=dash.worksheets.find(w=>w.name===LIST);
  const gate=$('gate');
  try{
    const rows = await readRows(WL||WD);
    const seen=new Set();
    WBS = rows.filter(r=>r.type==='W' && r.wb!=='__none__' && !seen.has(r.wb) && seen.add(r.wb)).map(r=>{ const [proj,own,upd,,nE,nW,chk]=r.info.split('|'); return {id:r.wb,name:r.name,proj:proj||'',own:own||'',upd:upd||'',nE:+nE||0,nW:+nW||0,chk:chk||''}; });
    ALLB = rows.filter(r=>r.type==='B').map(r=>{ const [sev,kind]=r.info.split('|'); return {wb:r.wb,name:r.name,sev,kind}; });
    kpis(); panel(); draw(); siteAlerts();
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
