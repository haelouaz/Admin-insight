/* Page Rationalisation — constat par BU (arborescence des projets telle quelle) et candidats régaliens.
   Aucune donnée dans ce fichier : classeurs et projets lus via l'arborescence (Site Content),
   visiteurs uniques via la feuille Rat_WU (TS Events, « Access View », 90 jours). */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n||0).toLocaleString('fr-FR');
const low = s => String(s||'').trim().toLowerCase();
const clean = s => String(s||'').replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu,'').replace(/\s+/g,' ').trim();
const dfr = t => t ? new Date(t).toLocaleDateString('fr-FR') : '—';
const DAY = 864e5, NOW = Date.now();
const pct = (a,b) => b ? Math.round(a*100/b) : 0;

/* règles (affichées dans la page) */
const R = { regMin:30, regRet:0.5, confMax:4, cible:[2,4] };
const CAT = {
  reg: {l:'Candidat régalien', c:'#003A78', d:'≥ '+R.regMin+' visiteurs uniques sur 90 j et au moins la moitié revient chaque mois (visiteurs 30 j / 90 j ≥ 50 %).'},
  met: {l:'Usage métier', c:'#5E9BDD', d:'5 visiteurs uniques ou plus sur 90 j, sans atteindre le niveau régalien.'},
  conf:{l:'Usage confidentiel', c:'#C9A227', d:'1 à '+R.confMax+' visiteurs uniques sur 90 j : usage individuel ou d’équipe.'},
  dor: {l:'Dormant', c:'#E2001A', d:'Aucune ouverture depuis 90 jours.'}
};
const CK = ['reg','met','conf','dor'];
const st = { bu:null, sub:null, q:'', cat:null, fold:false };
let WB=[], BU={}, ALLU=new Set(), FAM={}, ERR=[];

async function readTable(ws){
  if(ws.getSummaryDataReaderAsync){ const r=await ws.getSummaryDataReaderAsync(undefined,{ignoreSelection:true}); const t=await r.getAllPagesAsync(); await r.releaseAsync(); return t; }
  return ws.getSummaryDataAsync({maxRows:0, ignoreSelection:true});
}
const val = (row,i) => { if(i<0) return null; const c=row[i]; const x=c.value; return (x==null||x==='%null%'||c.formattedValue==='Null')?null:x; };

/* périmètre : BU = arborescence telle quelle */
/* BU validées : Marchandise, Marketing & Customer, Supply, Finance, Magasin ; sous-BU = niveau suivant de l'arborescence.
   À part : Migration MSTR, Migration RF, New Carrefour ; hors BU : Pricing, B2B, Archive, modèles, Admin Insights, espaces perso. */
const BUS = ['Magasin','Marchandise','Marketing & Customer','Supply','Finance'];
function buOf(path){
  const top=clean(path[0]||''), l2=clean(path[1]||''), l3=clean(path[2]||'');
  const sub = x => x || '(racine)';
  if(/si[eè]ge/i.test(top)){
    if(/marchandise/i.test(l2)) return {bu:'Marchandise', sub:sub(l3)};
    if(/e-?commerce|marketing|client/i.test(l2)) return {bu:'Marketing & Customer', sub:sub(l3)};
    if(/supply/i.test(l2)) return {bu:'Supply', sub:sub(l3)};
    if(/finance/i.test(l2)) return {bu:'Finance', sub:sub(l3)};
    if(/^magasin/i.test(l2)) return {bu:'Magasin', sub:'Siège › '+sub(l3)};
    return null;
  }
  if(/^magasin/i.test(top)) return /new carrefour/i.test(l2) ? null : {bu:'Magasin', sub:sub(l2)};
  if(/^entrep/i.test(top)) return {bu:'Supply', sub:'Entrepôt › '+sub(l2)};
  return null;
}
const ENVRX = [[/(^|[\s_\-\[(›])(archive|archives|old|obsolete|à archiver)([\s_\-\])]|$)/i,'arch'],[/(^|[\s_\-\[(›])(dev|sandbox|test|tests|poc)([\s_\-\])]|$)/i,'dev'],[/(^|[\s_\-\[(›])(qual|qualif|recette|pre-?prod|uat)([\s_\-\])]|$)/i,'qual']];
const envOf = s => { for(const [rx,e] of ENVRX) if(rx.test(s)) return e; return null; };
const famKey = s => low(clean(s)).replace(/\[[^\]]*\]|\([^)]*\)/g,' ').replace(/\b(dev|qual|prod|preprod|pre-prod|recette|test|copie|copy|old|new|v ?\d+(\.\d+)?|\d{2,4}[_\-]\d{2}([_\-]\d{2,4})?)\b/g,' ').replace(/[^a-z0-9àâäéèêëïîôöùûüç]+/g,' ').trim();

async function load(){
  const A=window.ARBO; if(!A||!A.byId) throw new Error('arborescence non chargée');
  // visiteurs uniques par classeur (nom + projet)
  const ws=tableau.extensions.dashboardContent.dashboard.worksheets.find(w=>w.name==='Rat_WU');
  const U={}; // clé nom|projet -> {u90:Set,u30:Set,v90}
  if(ws){ try{ const t=await readTable(ws); const n=t.columns.map(c=>low(c.fieldName)); const f=(...k)=>n.findIndex(x=>k.some(y=>x===y||x.includes(y)));
      const I={wb:f('workbook name'), p:f('project name'), a:f('actor user name'), v90:n.findIndex(x=>x.includes('90')), v30:n.findIndex(x=>x.includes('30'))};
      t.data.forEach(r=>{ const k=low(val(r,I.wb))+'|'+low(val(r,I.p)); const a=low(val(r,I.a)); if(!a) return; const o=U[k]||(U[k]={u90:new Set(),u30:new Set(),v90:0}); const v9=+val(r,I.v90)||0, v3=+val(r,I.v30)||0; if(v9>0) o.u90.add(a); if(v3>0) o.u30.add(a); o.v90+=v9; });
    }catch(e){ ERR.push('Rat_WU : '+(e&&e.message||e)); } }
  else ERR.push('Feuille Rat_WU absente : visiteurs uniques indisponibles.');
  const {byId}=A; const pathOf=id=>{ const a=[]; let c=byId[id]&&byId[id].parent; while(c&&c!==A.ROOT){ a.unshift(byId[c]); c=byId[c].parent; } return a; };
  WB=[]; BU={}; ALLU=new Set();
  Object.values(byId).filter(n=>n.type==='w').forEach(n=>{
    const ps=pathOf(n.id); const names=ps.map(p=>p.name); const bo=buOf(names); if(!bo) return; const bu=bo.bu, sub=bo.sub;
    const env = envOf(n.name) || names.map(envOf).find(Boolean) || 'prod';
    const proj=names[names.length-1]||''; const u=U[low(n.name)+'|'+low(proj)]||{u90:new Set(),u30:new Set(),v90:0};
    const w={id:n.id, name:n.name, bu, sub, env, proj, path:names.map(clean).join(' › '), owner:n.owner||'', last:n.last, upd:n.upd, views:n.sheets||0, v30:n.v30||0, v12:n.v12||0, v90:u.v90, u90:u.u90, u30:u.u30, link:n.link};
    w.nu90=u.u90.size; w.nu30=u.u30.size; w.ret = w.nu90 ? w.nu30/w.nu90 : 0;
    w.cat = env!=='prod' ? null : !w.nu90 ? 'dor' : w.nu90<=R.confMax ? 'conf' : (w.nu90>=R.regMin && w.ret>=R.regRet) ? 'reg' : 'met';
    WB.push(w);
  });
  // familles de doublons (même nom normalisé, même BU, plusieurs classeurs en production)
  FAM={}; WB.filter(w=>w.env==='prod').forEach(w=>{ const k=w.bu+'|'+famKey(w.name); if(famKey(w.name).length<3) return; (FAM[k]=FAM[k]||[]).push(w); });
  Object.keys(FAM).forEach(k=>{ if(FAM[k].length<2) delete FAM[k]; });
  // agrégats par BU
  const mk = name => ({name, prod:[], nonprod:[], users:new Set(), users30:new Set(), v30:0, v12:0, owners:new Set(), subs:{}});
  BUS.forEach(n=>BU[n]=mk(n));
  WB.forEach(w=>{ const b=BU[w.bu]||(BU[w.bu]=mk(w.bu)); const sb=b.subs[w.sub]||(b.subs[w.sub]=mk(w.sub));
    [b,sb].forEach(o=>{ if(w.env==='prod'){ o.prod.push(w); w.u90.forEach(x=>o.users.add(x)); w.u30.forEach(x=>o.users30.add(x)); o.v30+=w.v30; o.v12+=w.v12; if(w.owner) o.owners.add(w.owner); } else o.nonprod.push(w); });
    if(w.env==='prod') w.u90.forEach(x=>ALLU.add(x)); });
  Object.values(BU).forEach(b=>Object.values(b.subs).forEach(sb=>{ sb.cnt={reg:0,met:0,conf:0,dor:0}; sb.prod.forEach(w=>sb.cnt[w.cat]++); sb.reg=sb.prod.filter(w=>w.cat==='reg'); sb.stale=sb.nonprod.filter(w=>!w.upd||NOW-w.upd>90*DAY); }));
  Object.values(BU).forEach(b=>{
    b.cnt={reg:0,met:0,conf:0,dor:0}; b.prod.forEach(w=>b.cnt[w.cat]++);
    b.reg=b.prod.filter(w=>w.cat==='reg').sort((a,c)=>c.nu90-a.nu90);
    const top=b.reg.slice(0,R.cible[1]); const cov=new Set(); top.forEach(w=>w.u90.forEach(x=>cov.add(x))); b.cov=pct(cov.size,b.users.size);
    b.fam=Object.entries(FAM).filter(([k])=>k.startsWith(b.name+'|')).map(([,v])=>v);
    b.stale=b.nonprod.filter(w=>!w.upd||NOW-w.upd>90*DAY);
    b.gap = b.reg.length>R.cible[1] ? 'over' : b.reg.length<R.cible[0] ? 'under' : 'ok';
    b.chantiers=chantiers(b);
  });
}
function chantiers(b){
  const c=[];
  if(b.cnt.dor) c.push({k:'dor', t:'Archiver '+b.cnt.dor+' classeur'+(b.cnt.dor>1?'s':'')+' dormant'+(b.cnt.dor>1?'s':''), d:'Aucune ouverture depuis 90 jours : déplacer vers Archive, puis supprimer après 6 mois.'});
  if(b.stale.length) c.push({k:'dev', t:'Nettoyer '+b.stale.length+' copie'+(b.stale.length>1?'s':'')+' DEV / QUAL', d:'Copies de travail non modifiées depuis 90 jours.'});
  if(b.fam.length) c.push({k:'fam', t:'Fusionner '+b.fam.length+' famille'+(b.fam.length>1?'s':'')+' de classeurs proches', d:'Plusieurs classeurs en production portent le même nom à une version ou un suffixe près.'});
  if(b.cnt.conf) c.push({k:'conf', t:'Revoir '+b.cnt.conf+' classeur'+(b.cnt.conf>1?'s':'')+' à usage confidentiel', d:'1 à '+R.confMax+' visiteurs : intégrer le besoin dans un régalien, ou basculer en espace personnel.'});
  if(!b.reg) return c;
  if(b.gap==='over') c.push({k:'gap', t:'Consolider '+b.reg.length+' candidats en '+R.cible[0]+' à '+R.cible[1]+' régaliens', d:'Trop de classeurs à large audience : regrouper par public et par usage (pilotage, opérationnel, analyse).'});
  else if(b.gap==='under') c.push({k:'gap', t:b.reg.length?'Compléter le socle régalien (1 seul candidat)':'Construire ou désigner le régalien de la direction', d:'Aucun classeur ne réunit encore une large audience régulière : partir des classeurs « Usage métier » les plus vus.'});
  return c;
}

/* ---------- rendu ---------- */
function bans(){
  const prod=WB.filter(w=>w.env==='prod'), np=WB.length-prod.length; const c=k=>prod.filter(w=>w.cat===k).length;
  const fam=Object.keys(FAM).length;
  const b=[[fmt(prod.length),'Classeurs en production','',null],[fmt(Object.keys(BU).length),'BU / directions','',null],[fmt(ALLU.size),'Visiteurs uniques · 90 j','',null],
    [fmt(c('reg')),'Candidats régaliens','reg','reg'],[fmt(c('met')),'Usage métier','met','met'],[fmt(c('conf')),'Usage confidentiel','conf','conf'],[fmt(c('dor')),'Dormants à archiver','dor','dor'],[fmt(np),'Copies DEV / QUAL / archives','',null],[fmt(fam),'Familles de doublons','',null]];
  $('raBans').innerHTML=b.map(x=>x[3]?'<button type="button" class="ban rb '+x[2]+'" data-c="'+x[3]+'" aria-pressed="'+(st.cat===x[3])+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></button>':'<div class="ban rb"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join('');
  $('raBans').querySelectorAll('[data-c]').forEach(e=>e.onclick=()=>{ st.cat=st.cat===e.dataset.c?null:e.dataset.c; bans(); main(); panel(); });
}
const sbar = (cnt,tot) => '<div class="bar" style="height:10px">'+CK.map(k=>cnt[k]?'<i style="width:'+(cnt[k]*100/tot)+'%;background:'+CAT[k].c+'" title="'+esc(CAT[k].l)+' · '+cnt[k]+'"></i>':'').join('')+'</div>';
function main(){
  const q=low(st.q); const bus=Object.values(BU).filter(b=>!q||low(b.name).includes(q)||Object.keys(b.subs).some(k=>low(k).includes(q))||b.prod.some(w=>low(w.name).includes(q))).sort((a,b)=>b.users.size-a.users.size);
  let h='<section class="block" style="margin-top:0"><h3>Constat par BU et sous-BU <small>· production uniquement (hors DEV, QUAL, archives) · Migration MSTR et New Carrefour à part</small> <button type="button" class="chip" id="raFold" style="height:24px;margin-left:8px">'+(st.fold?'Déplier les sous-BU':'Replier les sous-BU')+'</button></h3><div class="legend">'+CK.map(k=>'<span><i style="background:'+CAT[k].c+'"></i>'+CAT[k].l+'</span>').join('')+'</div>';
  h+='<table class="gtab rtab"><thead><tr><th>BU / sous-BU</th><th class="n">Classeurs prod</th><th class="n">DEV / QUAL</th><th class="n">Visiteurs uniques 90 j</th><th class="n">Ouvertures 30 j</th><th class="n">Ouvertures 12 mois</th><th style="width:20%">Répartition des usages</th><th class="n">Candidats régaliens</th><th class="n">Couverture</th><th>Écart à la cible</th></tr></thead><tbody>';
  h+=bus.map(b=>{ const tot=b.prod.length||1; const gap=b.gap==='ok'?'<span class="gp ok">Dans la cible</span>':b.gap==='over'?'<span class="gp over">'+b.reg.length+' → '+R.cible[0]+'-'+R.cible[1]+' à consolider</span>':'<span class="gp under">'+(b.reg.length?'1 seul':'Aucun')+' : à construire</span>';
    const nn=st.cat? b.prod.filter(w=>w.cat===st.cat).length : null;
    const subs=Object.values(b.subs).filter(sb=>sb.prod.length||sb.nonprod.length).sort((x,y)=>y.users.size-x.users.size||y.prod.length-x.prod.length);
    const subRows = st.fold ? '' : subs.map(sb=>{ const t2=sb.prod.length||1; return '<tr class="sub'+(st.bu===b.name&&st.sub===sb.name?' sel':'')+'" data-b="'+esc(b.name)+'" data-s="'+esc(sb.name)+'"><td><span class="ind">'+esc(sb.name)+'</span></td><td class="n">'+fmt(sb.prod.length)+'</td><td class="n">'+fmt(sb.nonprod.length)+'</td><td class="n">'+fmt(sb.users.size)+'</td><td class="n">'+fmt(sb.v30)+'</td><td class="n">'+fmt(sb.v12)+'</td><td>'+(sb.prod.length?sbar(sb.cnt,t2):'')+'</td><td class="n">'+(sb.reg.length||'')+'</td><td></td><td></td></tr>'; }).join('');
    return '<tr data-b="'+esc(b.name)+'" class="bu'+(st.bu===b.name&&!st.sub?' sel':'')+'"><td><b>'+esc(b.name)+'</b>'+(nn!=null?'<small>'+nn+' « '+esc(CAT[st.cat].l.toLowerCase())+' »</small>':'')+'</td><td class="n"><b>'+fmt(b.prod.length)+'</b></td><td class="n">'+fmt(b.nonprod.length)+'</td><td class="n">'+fmt(b.users.size)+'</td><td class="n">'+fmt(b.v30)+'</td><td class="n">'+fmt(b.v12)+'</td><td>'+sbar(b.cnt,tot)+'</td><td class="n"><b>'+b.reg.length+'</b></td><td class="n" title="Part des visiteurs de la BU couverts par ses '+R.cible[1]+' premiers candidats">'+(b.reg.length?b.cov+' %':'—')+'</td><td>'+gap+'</td></tr>'+subRows; }).join('');
  h+='</tbody></table><p class="hint">Visiteurs uniques : distincts sur l’ensemble des classeurs de la BU (un utilisateur qui ouvre 5 classeurs compte une fois). Couverture : part de ces visiteurs déjà servis par les '+R.cible[1]+' premiers candidats régaliens.</p></section>';
  h+='<section class="block"><h3>Règles de classement</h3><div class="rules">'+CK.map(k=>'<div><span class="sw" style="background:'+CAT[k].c+'"></span><b>'+CAT[k].l+'</b><span>'+esc(CAT[k].d)+'</span></div>').join('')+'<div><span class="sw" style="background:#93A2B6"></span><b>Cible</b><span>'+R.cible[0]+' à '+R.cible[1]+' tableaux de bord régaliens par direction.</span></div></div><p class="hint">Un candidat régalien est une proposition fondée sur l’usage : la décision finale revient à la direction (périmètre, sponsor, données certifiées).</p></section>';
  $('raMain').innerHTML=h;
  $('raMain').querySelectorAll('tr[data-b]').forEach(tr=>tr.onclick=()=>{ const b=tr.dataset.b, sb=tr.dataset.s||null; if(st.bu===b&&st.sub===sb){ st.bu=null; st.sub=null; } else { st.bu=b; st.sub=sb; } main(); panel(); });
  $('raFold').onclick=e=>{ e.stopPropagation(); st.fold=!st.fold; main(); };
}
function wbRow(w){ const c=w.cat?CAT[w.cat]:null; return '<div class="urow wr"><span class="dot" style="background:'+(c?c.c:'#B8C3D1')+'"></span><span class="nm"><b>'+esc(w.name)+'</b><small>'+esc(w.proj)+' · '+esc((w.owner||'').split('@')[0])+(w.views?' · '+w.views+' vue'+(w.views>1?'s':''):'')+'</small></span><span class="r"><b>'+fmt(w.nu90)+'</b> visiteurs<br>'+fmt(w.v30)+' ouv. 30 j'+(w.nu90?' · '+Math.round(w.ret*100)+' % reviennent':'')+'</span></div>'; }
function panel(){
  const p=$('raPanel');
  if(!st.bu){
    const bus=Object.values(BU); const ok=bus.filter(b=>b.gap==='ok').length, over=bus.filter(b=>b.gap==='over').length, under=bus.filter(b=>b.gap==='under').length;
    const prod=WB.filter(w=>w.env==='prod'); const dor=prod.filter(w=>w.cat==='dor').length, conf=prod.filter(w=>w.cat==='conf').length;
    let h='<div><div class="eyebrow">Site france</div><h2>Rationalisation</h2><p class="hint">Vision cible : '+R.cible[0]+' à '+R.cible[1]+' tableaux de bord régaliens par direction.</p></div>';
    h+='<ul class="flags"><li><span>'+fmt(prod.length)+' classeurs en production pour '+bus.length+' BU, soit '+(prod.length/Math.max(1,bus.length)).toFixed(0)+' en moyenne par BU.</span></li>'+
      '<li><span>'+pct(dor+conf,prod.length)+' % des classeurs en production sont dormants ou confidentiels ('+dor+' + '+conf+') : premier levier de réduction, sans impact pour les utilisateurs.</span></li>'+
      '<li class="info"><span>'+ok+' BU dans la cible, '+over+' avec trop de candidats régaliens (à consolider), '+under+' sans socle régalien (à construire).</span></li></ul>';
    h+='<p class="hint">Cliquez sur une BU pour voir ses classeurs, ses candidats régaliens et ses chantiers.</p>';
    if(ERR.length) h+='<ul class="flags">'+ERR.map(e=>'<li><span>'+esc(e)+'</span></li>').join('')+'</ul>';
    p.innerHTML=h; return;
  }
  const B0=BU[st.bu]; const b = st.sub ? Object.assign({}, B0.subs[st.sub], {chantiers:chantiers(Object.assign({}, B0.subs[st.sub], {fam:[], gap:'ok'})), fam:[]}) : B0; const tot=b.prod.length||1;
  let h='<div><button type="button" class="back" id="raBack">← '+(st.sub?esc(B0.name):'Toutes les BU')+'</button><div class="eyebrow">'+(st.sub?'Sous-BU · '+esc(B0.name):'BU')+'</div><h2>'+esc(b.name)+'</h2></div>';
  h+='<div class="pk"><div class="cell"><span>Classeurs prod</span><b>'+fmt(b.prod.length)+'</b></div><div class="cell"><span>Visiteurs uniques 90 j</span><b>'+fmt(b.users.size)+'</b></div><div class="cell"><span>Candidats régaliens</span><b>'+b.reg.length+'</b></div><div class="cell"><span>Propriétaires</span><b>'+b.owners.size+'</b></div></div>';
  h+=sbar(b.cnt,tot)+'<div class="legend">'+CK.map(k=>'<span><i style="background:'+CAT[k].c+'"></i>'+CAT[k].l+' · '+b.cnt[k]+'</span>').join('')+'</div>';
  h+='<div class="sec"><div class="eyebrow">Chantiers</div>'+(b.chantiers.length?b.chantiers.map(c=>'<div class="ch"><b>'+esc(c.t)+'</b><span>'+esc(c.d)+'</span></div>').join(''):'<ul class="flags"><li class="ok"><span>BU déjà dans la cible.</span></li></ul>')+'</div>';
  const show=k=>{ const l=b.prod.filter(w=>w.cat===k).sort((x,y)=>y.nu90-x.nu90||y.v12-x.v12); if(!l.length) return ''; return '<div class="sec"><div class="eyebrow">'+esc(CAT[k].l)+' · '+l.length+'</div><div class="list">'+l.slice(0,k==='dor'?40:60).map(wbRow).join('')+'</div>'+(l.length>60?'<p class="hint">'+(l.length-60)+' autres.</p>':'')+'</div>'; };
  h+=(st.cat?show(st.cat):CK.map(show).join(''));
  if(b.fam.length) h+='<div class="sec"><div class="eyebrow">Familles de classeurs proches</div>'+b.fam.map(f=>'<div class="fam">'+f.map(w=>'<span>'+esc(w.name)+' <small>'+fmt(w.nu90)+' vis.</small></span>').join('')+'</div>').join('')+'</div>';
  if(b.nonprod.length) h+='<div class="sec"><div class="eyebrow">Hors production · '+b.nonprod.length+'</div><p class="hint">'+b.stale.length+' non modifiés depuis 90 jours. '+esc([...new Set(b.nonprod.map(w=>w.env.toUpperCase()))].join(', '))+'.</p></div>';
  if(!st.sub){ const subs=Object.values(B0.subs).filter(sb=>sb.prod.length).sort((x,y)=>y.users.size-x.users.size); if(subs.length) h+='<div class="sec"><div class="eyebrow">Sous-BU · '+subs.length+'</div><div class="list">'+subs.map(sb=>'<button type="button" class="urow" data-sub="'+esc(sb.name)+'"><span class="nm"><b>'+esc(sb.name)+'</b><small>'+sb.prod.length+' classeur'+(sb.prod.length>1?'s':'')+' · '+sb.reg.length+' candidat'+(sb.reg.length>1?'s':'')+'</small></span><span class="r"><b>'+fmt(sb.users.size)+'</b> visiteurs</span></button>').join('')+'</div></div>'; }
  p.innerHTML=h; $('raBack').onclick=()=>{ if(st.sub){ st.sub=null; } else st.bu=null; main(); panel(); };
  p.querySelectorAll('[data-sub]').forEach(x=>x.onclick=()=>{ st.sub=x.dataset.sub; main(); panel(); });
}
function exportCsv(){
  const rows=[['BU','Sous-BU','Classeur','Projet','Environnement','Catégorie','Visiteurs uniques 90 j','Visiteurs uniques 30 j','Ouvertures 30 j','Ouvertures 12 mois','Vues','Propriétaire','Dernière ouverture','Dernière modification','Chemin']];
  WB.slice().sort((a,b)=>a.bu.localeCompare(b.bu)||b.nu90-a.nu90).forEach(w=>rows.push([w.bu,w.sub,w.name,w.proj,w.env.toUpperCase(),w.cat?CAT[w.cat].l:'Hors production',w.nu90,w.nu30,w.v30,w.v12,w.views,w.owner,dfr(w.last),dfr(w.upd),w.path]));
  const csv='﻿'+rows.map(r=>r.map(x=>'"'+String(x==null?'':x).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='rationalisation_tableau_france_'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(a); a.click(); a.remove();
}
function mount(){
  ['licences.css?v=2','usage.css?v=2','rat.css?v=2'].forEach(href=>{ if(!document.querySelector('link[href^="'+href.split('?')[0]+'"]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l); } });
  const app=document.createElement('div'); app.className='app lic use rat'; app.id='rat'; app.hidden=true;
  app.innerHTML='<header class="head bans-wrap"><div class="bans" id="raBans"></div></header>'+
    '<div class="tools"><label class="search" style="max-width:320px"><span style="position:absolute;left:-9999px">Rechercher</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="raQ" type="search" placeholder="BU ou classeur…" autocomplete="off"></label><button type="button" class="chip" id="raCsv" style="margin-left:auto">Exporter le détail (CSV)</button></div>'+
    '<div class="main"><div class="canvas" id="raMain" style="padding:16px 18px;display:block;overflow-x:hidden"></div><aside class="panel" id="raPanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
}
/* synthèse transmise uniquement à Tableau Cloud, sur demande (préparation de la note de constat) */
function summary(){
  return {at:new Date().toISOString(), regles:R, bu:Object.values(BU).sort((a,b)=>b.users.size-a.users.size).map(b=>({bu:b.name, prod:b.prod.length, nonprod:b.nonprod.length, stale:b.stale.length, users90:b.users.size, users30:b.users30.size, v30:b.v30, v12:b.v12, owners:b.owners.size, cnt:b.cnt, cov:b.cov, gap:b.gap,
    reg:b.reg.map(w=>({n:w.name,p:w.proj,u90:w.nu90,u30:w.nu30,v30:w.v30,v12:w.v12})), met:b.prod.filter(w=>w.cat==='met').sort((x,y)=>y.nu90-x.nu90).slice(0,8).map(w=>({n:w.name,u90:w.nu90,v30:w.v30})),
    fam:b.fam.map(f=>f.map(w=>w.name)), chantiers:b.chantiers.map(c=>c.t),
    subs:Object.values(b.subs).sort((x,y)=>y.users.size-x.users.size).map(sb=>({sub:sb.name, prod:sb.prod.length, nonprod:sb.nonprod.length, stale:sb.stale.length, users90:sb.users.size, v30:sb.v30, v12:sb.v12, cnt:sb.cnt, reg:sb.reg.map(w=>w.name)}))})), site:{prod:WB.filter(w=>w.env==='prod').length, nonprod:WB.filter(w=>w.env!=='prod').length, users90:ALLU.size}};
}
window.addEventListener('message', e=>{ if(e.origin==='https://dub01.online.tableau.com' && e.data && e.data.ratSummary==='get' && WB.length) e.source.postMessage({ratSummary:summary()}, e.origin); });
window.RAT_START = async function(){
  mount(); await load(); bans(); main(); panel();
  $('raQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); main(); });
  $('raCsv').onclick=exportCsv;
};
})();
