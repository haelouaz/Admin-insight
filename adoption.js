/* Page Adoption — chargée par index.html quand le tableau de bord contient la feuille « Adopt_Users ».
   Aucune donnée dans ce fichier : tout est lu en direct dans Admin Insights (TS Events, TS Users, Groups). */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n||0).toLocaleString('fr-FR');
const pct = (a,b) => b ? Math.round(a*100/b) : 0;
const low = s => String(s||'').trim().toLowerCase();
const DAY = 864e5, NOW = Date.now();
const dfr = t => t ? new Date(t).toLocaleDateString('fr-FR') : '—';

const SEG = [
  {k:'amb', l:'Ambassadeurs',        c:'#003A78', d:'12 jours actifs ou plus sur les 30 derniers jours.', a:'Les identifier comme relais métier : retours, tests de nouveaux tableaux de bord, communauté.'},
  {k:'reg', l:'Réguliers',           c:'#2D7FD3', d:'4 à 11 jours actifs sur 30 jours.', a:'Usage installé : vérifier que les tableaux de bord qu’ils ouvrent sont bien maintenus.'},
  {k:'occ', l:'Occasionnels',        c:'#8DB8EA', d:'1 à 3 jours actifs sur 30 jours.', a:'Abonnements (envoi par e-mail) ou alertes plutôt que visite spontanée.'},
  {k:'dec', l:'En décrochage',       c:'#E8A33D', d:'Actifs il y a 31 à 90 jours, plus rien depuis 30 jours.', a:'À relancer maintenant : contenu disparu, accès cassé, besoin non couvert ?'},
  {k:'dor', l:'Sans consultation > 90 j', c:'#E2001A', d:'Licence occupée, aucune vue consultée depuis 90 jours (ou jamais).', a:'Licence à récupérer, ou attribution automatique par groupe à revoir (ex. MAG_ALL → Viewer).'}
];
const SI = Object.fromEntries(SEG.map(s=>[s.k,s]));
let A=[], byU={}, TREND=[], PROJ=[], POP={}, SUMM={}, LIC=0, CREA={tot:0,act:0}, st={sel:null, q:''};

async function readTable(ws){
  if(ws.getSummaryDataReaderAsync){ const r=await ws.getSummaryDataReaderAsync(undefined,{ignoreSelection:true}); const t=await r.getAllPagesAsync(); await r.releaseAsync(); return t; }
  return ws.getSummaryDataAsync({maxRows:0, ignoreSelection:true});
}
const cols = t => { const n=t.columns.map(c=>low(c.fieldName)); return key=>n.findIndex(x=>x.includes(key)); };
const v = (row,i) => { if(i<0) return null; const c=row[i]; const x=c.value; return (x==null||x==='%null%'||c.formattedValue==='Null')?null:x; };
const toT = x => { if(x==null||x==='') return null; if(x instanceof Date) return x.getTime(); const t=Date.parse(String(x).replace(' ','T')); return isNaN(t)?null:t; };
const num = x => x==null ? 0 : +x || 0;
const licOf = (r) => { r=low(r); return r.includes('unlicensed')?'Sans licence':r.includes('creator')?'Creator':r.includes('explorer')?'Explorer':r.includes('viewer')?'Viewer':'Autre'; };
const POPS = [[/^siege/i,'Siège'],[/^mag/i,'Magasins'],[/^entrepot/i,'Entrepôts']];
const popOf = g => { for(const [re,l] of POPS) if(re.test(g)) return l; return g.replace(/_ALL$/i,'').replace(/_/g,' '); };

async function load(){
  const dash=tableau.extensions.dashboardContent.dashboard, W=n=>dash.worksheets.find(w=>w.name===n);
  const err=[]; const rd=async n=>{ const w=W(n); if(!w) return null; try{ return await readTable(w); }catch(e){ err.push(n+' : '+(e&&e.message||e)); return null; } };
  const tu=await rd('Adopt_Users'), tt=await rd('Adopt_Trend'), tp=await rd('Adopt_Projects'), tpop=await rd('Lic_Pop'), ts=await rd('Lic_Summary'), tc=await rd('Lic_Users');
  window.__ADO_ERR=err;
  if(!tu) throw new Error(err.join(' | ')||'Adopt_Users illisible');
  let c=cols(tu); const I={u:c('actor user name'),lr:c('license role'),sr:c('site role'),last:c('event date'),d30:c('jour actif 30'),d90:c('jour actif 90'),v30:c('vues 30'),v90:c('vues 90'),i90:c('vue distincte 90')};
  A=[]; byU={};
  tu.data.forEach(r=>{ const u=v(r,I.u); if(!u) return; const k=low(u); const x=byU[k]||(byU[k]={u, lic:licOf(v(r,I.lr)), last:null, d30:0, d90:0, v30:0, v90:0, i90:0});
    const last=toT(v(r,I.last)); if(last && (!x.last||last>x.last)) x.last=last; x.d30=Math.max(x.d30,num(v(r,I.d30))); x.d90=Math.max(x.d90,num(v(r,I.d90))); x.v30+=num(v(r,I.v30)); x.v90+=num(v(r,I.v90)); x.i90=Math.max(x.i90,num(v(r,I.i90))); });
  A=Object.values(byU);
  A.forEach(x=>{ const age=x.last?(NOW-x.last)/DAY:1e9; x.seg = x.d30>=12?'amb': x.d30>=4?'reg': x.d30>=1?'occ': age<=90?'dec':'dor'; });
  // licences occupées (toutes) depuis la synthèse TS Users
  SUMM={}; LIC=0;
  if(ts){ c=cols(ts); const S={lt:c('license type'),role:c('site role'),n:c('user email')}; ts.data.forEach(r=>{ const l=licOf((v(r,S.role)||'')+' '+(v(r,S.lt)||'')); const n=num(v(r,S.n)); SUMM[l]=(SUMM[l]||0)+n; }); LIC=['Creator','Explorer','Viewer'].reduce((a,l)=>a+(SUMM[l]||0),0); }
  // créateurs actifs (Desktop, Prep, Web Edit ou publication < 90 j)
  CREA={tot:0,act:0};
  if(tc){ c=cols(tc); const J={lt:c('license type'),role:c('site role'),web:c('web authoring'),desk:c('desktop'),prep:c('prep'),wbp:c('workbook - last publish'),dsp:c('data source - last publish')};
    tc.data.forEach(r=>{ if(licOf((v(r,J.role)||'')+' '+(v(r,J.lt)||''))!=='Creator') return; CREA.tot++; const t=Math.max(...[J.web,J.desk,J.prep,J.wbp,J.dsp].map(i=>toT(v(r,i))||0)); if(t && (NOW-t)/DAY<=90) CREA.act++; }); }
  // tendance mensuelle
  TREND=[];
  if(tt){ c=cols(tt); const T={m:c('mois'),lr:c('license role'),u:c('actor user name'),n:c('number of')}; const by={};
    tt.data.forEach(r=>{ const m=v(r,T.m); if(!m) return; const o=by[m]||(by[m]={m,users:{},tot:0,ev:0}); const l=licOf(v(r,T.lr)); const n=num(v(r,T.u)); o.users[l]=(o.users[l]||0)+n; o.tot+=n; o.ev+=num(v(r,T.n)); });
    TREND=Object.values(by).sort((a,b)=>a.m.localeCompare(b.m)).slice(-13); }
  // projets
  PROJ=[];
  if(tp){ c=cols(tp); const P={p:c('project name'),a30:c('utilisateur actif'),v30:c('vues 30'),i30:c('vue distincte 30'),u12:c('actor user name')};
    PROJ=tp.data.map(r=>({p:v(r,P.p)||'—', a30:num(v(r,P.a30)), v30:num(v(r,P.v30)), i30:num(v(r,P.i30)), u12:num(v(r,P.u12))})).filter(x=>x.u12); }
  // populations (groupes *_ALL)
  POP={};
  if(tpop){ c=cols(tpop); const G={g:c('group name'),e:c('user email')};
    tpop.data.forEach(r=>{ const g=v(r,G.g), e=v(r,G.e); if(!g||!e) return; const p=popOf(g); const P=POP[p]||(POP[p]={p, members:new Set()}); P.members.add(low(e)); const x=byU[low(e)]; if(x && !x.pop) x.pop=p; }); }
}

/* ---------- rendu ---------- */
const bar=(parts,total,h)=>'<div class="bar" style="height:'+(h||10)+'px">'+parts.filter(p=>p[0]>0).map(p=>'<i style="width:'+(p[0]*100/(total||1))+'%;background:'+p[1]+'" title="'+esc(p[2]||'')+' · '+fmt(p[0])+'"></i>').join('')+'</div>';
function counts(list){ const o={amb:0,reg:0,occ:0,dec:0,dor:0}; list.forEach(x=>o[x.seg]++); return o; }
function bans(){
  const act30=A.filter(x=>x.d30>0), act90=A.filter(x=>x.d90>0), cs=counts(A.filter(x=>x.lic!=='Sans licence'));
  const inv=Math.max(0,LIC-(cs.amb+cs.reg+cs.occ+cs.dec));
  const avgD=act30.length? act30.reduce((a,x)=>a+x.d30,0)/act30.length : 0;
  const v30=A.reduce((a,x)=>a+x.v30,0);
  const b=[[fmt(act30.length),'Utilisateurs actifs 30 j'],[pct(act30.length,LIC)+' %','Taux d’adoption (actifs 30 j / licences)'],[fmt(act90.length),'Utilisateurs actifs 90 j'],[fmt(v30),'Consultations 30 j'],[avgD.toFixed(1).replace('.',','),'Jours actifs / utilisateur actif'],[fmt(cs.amb),'Ambassadeurs'],[fmt(inv),'Licences sans consultation > 90 j',true],[fmt(CREA.act)+(CREA.tot?' <small>/ '+fmt(CREA.tot)+'</small>':''),'Creators qui créent (90 j)']];
  $('adoBans').innerHTML=b.map(x=>'<div class="ban'+(x[2]?' alert':'')+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join('');
  return {inv};
}
function main(inv){
  const lic=A.filter(x=>x.lic!=='Sans licence'); const cs=counts(lic); const seen=cs.dor; cs.dor=inv; const tot=LIC||1;
  let h='<section class="block"><h3>Segmentation des utilisateurs licenciés</h3><p class="hint">Base : les '+fmt(LIC)+' licences occupées aujourd’hui. Activité = vues consultées (« Access View », TS Events). Parmi les licences sans consultation depuis 90 jours, '+fmt(seen)+' utilisateurs avaient consulté entre 3 et 12 mois.</p>'+
    bar(SEG.map(s=>[cs[s.k]||0,s.c,s.l]),tot,16)+'<div class="segs">'+SEG.map(s=>'<button type="button" class="seg" data-s="'+s.k+'" aria-pressed="'+(st.sel===s.k)+'"><span class="sw" style="background:'+s.c+'"></span><b>'+fmt(cs[s.k]||0)+'<small> · '+pct(cs[s.k]||0,tot)+' %</small></b><span class="sl">'+s.l+'</span><span class="sd">'+s.d+'</span></button>').join('')+'</div></section>';
  // tendance
  if(TREND.length){ const max=Math.max(...TREND.map(t=>t.tot),1); const L=['Creator','Explorer','Viewer','Sans licence','Autre'], CL={Creator:'#003A78',Explorer:'#2D7FD3',Viewer:'#8DB8EA','Sans licence':'#B8C3D1',Autre:'#D5DCE6'};
    h+='<section class="block"><h3>Utilisateurs actifs par mois</h3><p class="hint">Nombre d’utilisateurs distincts ayant consulté au moins une vue dans le mois, par licence.</p><div class="trend">'+TREND.map(t=>'<div class="tc" title="'+esc(t.m+' : '+fmt(t.tot)+' utilisateurs · '+fmt(t.ev)+' consultations')+'"><span class="tv">'+fmt(t.tot)+'</span><div class="tb" style="height:'+(t.tot*100/max)+'%">'+L.filter(l=>t.users[l]).map(l=>'<i style="flex:'+t.users[l]+';background:'+CL[l]+'"></i>').join('')+'</div><span class="tm">'+esc(t.m.slice(5)+'/'+t.m.slice(2,4))+'</span></div>').join('')+'</div><div class="legend">'+L.slice(0,4).map(l=>'<span><i style="background:'+CL[l]+'"></i>'+l+'</span>').join('')+'</div></section>'; }
  // populations
  const pops=Object.values(POP).sort((a,b)=>b.members.size-a.members.size);
  if(pops.length){ h+='<section class="block"><h3>Adoption par population</h3><p class="hint">Populations définies par les groupes « *_ALL ». Taux = utilisateurs actifs sur 30 jours / membres du groupe.</p><table class="gtab"><thead><tr><th>Population</th><th class="n">Membres</th><th class="n">Actifs 30 j</th><th class="n">Taux</th><th style="width:40%">Segments</th></tr></thead><tbody>'+
    pops.map(P=>{ const xs=[...P.members].map(e=>byU[e]).filter(Boolean); const c=counts(xs); const a30=xs.filter(x=>x.d30>0).length; return '<tr><td><b>'+esc(P.p)+'</b></td><td class="n">'+fmt(P.members.size)+'</td><td class="n">'+fmt(a30)+'</td><td class="n"><b>'+pct(a30,P.members.size)+' %</b></td><td>'+bar(SEG.slice(0,5).map(s=>[c[s.k],s.c,s.l]).concat([[P.members.size-xs.length,'#E6EBF2','Aucune consultation sur 12 mois']]),P.members.size,10)+'</td></tr>'; }).join('')+'</tbody></table></section>'; }
  // concentration
  const vs=A.map(x=>x.v90).filter(n=>n>0).sort((a,b)=>b-a), totV=vs.reduce((a,n)=>a+n,0), top=Math.max(1,Math.round(vs.length*0.1)), topV=vs.slice(0,top).reduce((a,n)=>a+n,0);
  const one=A.filter(x=>x.d90>0 && x.i90<=1).length, act90=A.filter(x=>x.d90>0).length;
  h+='<section class="block"><h3>Profondeur de l’usage (90 jours)</h3><div class="grid3"><div class="cell"><span>Part des consultations faites par les 10 % d’utilisateurs les plus actifs</span><b>'+pct(topV,totV)+' %</b></div><div class="cell"><span>Utilisateurs actifs qui n’ouvrent qu’une seule vue</span><b>'+pct(one,act90)+' %</b></div><div class="cell"><span>Vues distinctes ouvertes par utilisateur actif (médiane)</span><b>'+median(A.filter(x=>x.d90>0).map(x=>x.i90))+'</b></div></div><p class="hint">Une forte concentration ou beaucoup d’utilisateurs « une seule vue » signale un usage étroit : Tableau sert de point d’accès à un rapport, pas d’outil d’analyse.</p></section>';
  // projets
  if(PROJ.length){ const q=low(st.q); const ps=PROJ.filter(p=>!q||low(p.p).includes(q)).sort((a,b)=>b.a30-a.a30);
    h+='<section class="block"><h3>Usage par projet</h3><table class="gtab"><thead><tr><th>Projet</th><th class="n">Actifs 30 j</th><th class="n">Consultations 30 j</th><th class="n">Vues ouvertes 30 j</th><th class="n">Utilisateurs 12 mois</th><th class="n">Rétention</th></tr></thead><tbody>'+
      ps.slice(0,60).map(p=>'<tr><td><b>'+esc(p.p)+'</b></td><td class="n">'+fmt(p.a30)+'</td><td class="n">'+fmt(p.v30)+'</td><td class="n">'+fmt(p.i30)+'</td><td class="n">'+fmt(p.u12)+'</td><td class="n">'+pct(p.a30,p.u12)+' %</td></tr>').join('')+'</tbody></table><p class="hint">Rétention = actifs sur 30 jours / utilisateurs sur 12 mois. Une rétention faible révèle un projet consulté au lancement puis abandonné.</p></section>'; }
  $('adoMain').innerHTML=h;
  $('adoMain').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{ st.sel = st.sel===b.dataset.s?null:b.dataset.s; main(inv); panel(); });
}
function median(a){ if(!a.length) return '—'; a=a.slice().sort((x,y)=>x-y); return fmt(a[Math.floor(a.length/2)]); }
function panel(){
  const p=$('adoPanel'); let h='';
  if(st.sel && SI[st.sel]){
    const s=SI[st.sel];
    h+='<div><div class="eyebrow">Segment</div><h2>'+esc(s.l)+'</h2><p class="hint">'+esc(s.d)+'</p></div><ul class="flags"><li class="info">'+esc(s.a)+'</li></ul>';
    if(s.k==='dor') h+='<p class="hint">Liste ci-dessous : utilisateurs qui avaient consulté entre 3 et 12 mois. Ceux qui n’ont jamais rien consulté n’apparaissent pas dans TS Events (voir Licences & groupes).</p>';
    { const q=low(st.q); const list=A.filter(x=>x.seg===s.k && x.lic!=='Sans licence' && (!q||low(x.u).includes(q))).sort((a,b)=>(b.d30-a.d30)||((b.last||0)-(a.last||0)));
      h+='<div class="sec"><div class="eyebrow">'+fmt(list.length)+' utilisateurs</div><div class="list">'+list.slice(0,300).map(x=>'<div class="urow"><span class="dot" style="background:'+s.c+'"></span><span class="nm"><b>'+esc(x.u)+'</b><small>'+esc(x.lic)+(x.pop?' · '+esc(x.pop):'')+'</small></span><span class="r">'+(x.d30?x.d30+' j / 30':'vu le '+dfr(x.last))+'</span></div>').join('')+'</div>'+(list.length>300?'<p class="hint">300 premiers affichés · affinez avec la recherche.</p>':'')+'</div>'; }
  } else {
    h+='<div><div class="eyebrow">Site france</div><h2>Adoption de Tableau</h2></div>';
    const f=[]; const act30=A.filter(x=>x.d30>0).length;
    f.push(['info','Un utilisateur actif = au moins une vue consultée. Les segments se basent sur le nombre de jours distincts de consultation.']);
    if(LIC && pct(act30,LIC)<50) f.push(['','Moins d’un titulaire de licence sur deux a consulté Tableau ces 30 derniers jours.']);
    if(CREA.tot && CREA.act<CREA.tot) f.push(['',(CREA.tot-CREA.act)+' Creator n’ont rien créé ni publié depuis 90 jours.']);
    h+='<ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul><p class="hint">Cliquez sur un segment pour voir ses utilisateurs.</p>';
    if((window.__ADO_ERR||[]).length) h+='<ul class="flags">'+window.__ADO_ERR.map(e=>'<li>Lecture : '+esc(e)+'</li>').join('')+'</ul>';
  }
  p.innerHTML=h;
}
function mount(){
  ['licences.css?v=2','adoption.css?v=1'].forEach(href=>{ if(!document.querySelector('link[href^="'+href.split('?')[0]+'"]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; document.head.appendChild(l); } });
  const app=document.createElement('div'); app.className='app lic ado'; app.id='ado'; app.hidden=true;
  app.innerHTML='<header class="head bans-wrap"><div class="bans" id="adoBans"></div></header>'+
    '<div class="tools"><label class="search" style="max-width:300px"><span style="position:absolute;left:-9999px">Rechercher</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="adoQ" type="search" placeholder="Projet ou utilisateur…" autocomplete="off"></label><span class="hint" style="margin-left:auto">Fenêtres glissantes : 30 et 90 jours · historique 12 mois</span></div>'+
    '<div class="main"><div class="canvas" id="adoMain" style="padding:16px 18px;display:block"></div><aside class="panel" id="adoPanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
}
window.ADO_START = async function(){
  mount(); await load(); const {inv}=bans(); main(inv); panel();
  $('adoQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); main(inv); panel(); });
};
})();
