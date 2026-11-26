/* Page Licences & groupes — chargée par index.html quand le tableau de bord contient la feuille « Lic_Users ».
   Aucune donnée dans ce fichier : tout est lu en direct dans Admin Insights (TS Users, Groups, Permissions). */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => (n||0).toLocaleString('fr-FR');
const pct = (a,b) => b ? Math.round(a*100/b) : 0;
const low = s => String(s||'').trim().toLowerCase();
const DAY = 864e5, NOW = Date.now();
const dfr = t => t ? new Date(t).toLocaleDateString('fr-FR') : '—';
const ago = t => t==null ? 'jamais' : (d=>d<1?'aujourd’hui':'il y a '+d+' j')(Math.floor((NOW-t)/DAY));
const ST = { a:{l:'Actif ≤ 30 j',c:'var(--s-act)'}, w:{l:'31–90 j',c:'var(--s-watch)'}, d:{l:'> 90 j',c:'var(--s-dorm)'}, n:{l:'Jamais connecté',c:'var(--s-never)'} };
const LIC = { Creator:{c:'#004E9F'}, Explorer:{c:'#2D7FD3'}, Viewer:{c:'#8DB8EA'}, Unlicensed:{c:'#B8C3D1'} };
const LORDER = ['Creator','Explorer','Viewer','Unlicensed'];

let U=[], byEmail={}, GR={}, PERM=[], CAP={}, st={ tab:'lic', q:'', lic:'all', status:'all', sel:null };

/* ---------- lecture ---------- */
async function readTable(ws){
  if(ws.getSummaryDataReaderAsync){ const r=await ws.getSummaryDataReaderAsync(undefined,{ignoreSelection:true}); const t=await r.getAllPagesAsync(); await r.releaseAsync(); return t; }
  return ws.getSummaryDataAsync({maxRows:0, ignoreSelection:true});
}
function cols(t){ const n=t.columns.map(c=>low(c.fieldName)); return key=>n.findIndex(x=>x.includes(key)); }
const v = (row,i) => { if(i<0) return null; const c=row[i]; const x=c.value; return (x==null||x==='%null%'||c.formattedValue==='Null')?null:x; };
const toT = x => { if(x==null||x==='') return null; if(x instanceof Date) return x.getTime(); const t=Date.parse(String(x).replace(' ','T')); return isNaN(t)?null:t; };
const num = x => x==null ? 0 : +x || 0;
function licOf(role, lt){ const r=low(role)+' '+low(lt); if(r.includes('unlicensed')) return 'Unlicensed'; if(r.includes('creator')) return 'Creator'; if(r.includes('explorer')) return 'Explorer'; if(r.includes('viewer')) return 'Viewer'; return 'Unlicensed'; }
function statusOf(t){ if(t==null) return 'n'; const d=(NOW-t)/DAY; return d<=30?'a':d<=90?'w':'d'; }

let SUMM={}, ROLES={};
async function load(){
  const dash=tableau.extensions.dashboardContent.dashboard, W=n=>dash.worksheets.find(w=>w.name===n);
  const rd = async n => { const w=W(n); if(!w) return null; try{ return await readTable(w); }catch(e){ console.error('[licences] '+n, e); window.__LIC_ERR=(window.__LIC_ERR||[]).concat(n+' : '+(e&&e.message||JSON.stringify(e))); return null; } };
  window.__LIC_ERR=[];
  // lecture séquentielle : plusieurs lecteurs de données simultanés se mélangent côté Tableau
  const ts=await rd('Lic_Summary'), tu=await rd('Lic_Users'), tgs=await rd('Lic_GroupStats'), tg=await rd('Lic_Groups'), tp=await rd('Lic_Perms'), ta=await rd('Lic_PermAgg');
  window.__LIC_ROWS={Summary:ts&&ts.data.length, Users:tu&&tu.data.length, GroupStats:tgs&&tgs.data.length, Groups:tg&&tg.data.length, Perms:tp&&tp.data.length, cols:ts?ts.columns.map(c=>c.fieldName).join('/'):''};
  if(!ts) throw new Error((window.__LIC_ERR.length?window.__LIC_ERR:['Lic_Summary illisible']).join(' | '));
  // 1. synthèse : licence × rôle × ancienneté de connexion (tous les utilisateurs du site)
  let c=cols(ts); const S={lt:c('license type'),role:c('site role'),b:c('connexion'),n:c('user email'),cc:c('allowed creators'),ce:c('allowed explorers'),cv:c('allowed viewers'),ct:c('total allowed')};
  SUMM={}; ROLES={}; CAP={};
  ts.data.forEach(r=>{ const role=v(r,S.role)||'', lic=licOf(role, v(r,S.lt)), b=v(r,S.b)||'n', n=num(v(r,S.n));
    const L=SUMM[lic]||(SUMM[lic]={a:0,w:0,d:0,n:0,total:0}); L[b]=(L[b]||0)+n; L.total+=n; ROLES[role]=(ROLES[role]||0)+n;
    if(S.cc>=0 && num(v(r,S.cc))) CAP={Creator:num(v(r,S.cc)),Explorer:num(v(r,S.ce)),Viewer:num(v(r,S.cv)),Total:num(v(r,S.ct))}; });
  // 2. détail : Creators, Explorers et administrateurs
  U=[]; byEmail={};
  if(tu){ c=cols(tu);
    const I={email:c('user email'),name:c('friendly name'),role:c('site role'),lt:c('license type'),login:c('last login'),created:c('creation date'),web:c('web authoring'),desk:c('desktop'),prep:c('prep'),wbp:c('workbook - last publish'),dsp:c('data source - last publish'),owb:c('(workbooks)'),ods:c('(data sources)')};
    tu.data.forEach(r=>{
      const email=v(r,I.email); if(!email || byEmail[low(email)]) return;
      const role=v(r,I.role)||'', lic=licOf(role, v(r,I.lt));
      const u={email, name:v(r,I.name)||email, role, lic, admin:/administrator/i.test(role), login:toT(v(r,I.login)), created:toT(v(r,I.created)),
        author:Math.max(...[I.web,I.desk,I.prep,I.wbp,I.dsp].map(i=>toT(v(r,i))||0))||null, web:toT(v(r,I.web)), publish:Math.max(toT(v(r,I.wbp))||0, toT(v(r,I.dsp))||0)||null,
        owb:num(v(r,I.owb)), ods:num(v(r,I.ods)), groups:[]};
      u.st=statusOf(u.login); U.push(u); byEmail[low(email)]=u; }); }
  U.forEach(u=>{
    const idle90 = t => t==null || (NOW-t)/DAY>90;
    u.rec=null;
    if(u.lic!=='Unlicensed' && (u.st==='d'||u.st==='n') && !u.admin) u.rec={k:'remove', l: u.st==='n'?'Jamais connecté : retirer la licence':'Aucune connexion depuis plus de 90 jours : retirer la licence'};
    else if(u.lic==='Creator' && idle90(u.author) && !u.admin) u.rec={k:'down', to:'Explorer', l:'Aucune création (Desktop, Prep, Web Edit, publication) depuis 90 jours : passer en Explorer'};
    else if(u.lic==='Explorer' && idle90(u.web) && idle90(u.publish) && !u.admin) u.rec={k:'down', to:'Viewer', l:'Aucune modification web ni publication depuis 90 jours : une licence Viewer suffit'};
  });
  // 3. groupes : effectifs de tous les groupes, appartenance détaillée pour les groupes de taille raisonnable
  GR={};
  if(tgs){ c=cols(tgs); const J={g:c('group name'),min:c('minimum site role'),los:c('license on sign'),n:c('user email')};
    tgs.data.forEach(r=>{ const g=v(r,J.g); if(!g) return; GR[g]={name:g, min:v(r,J.min), los:String(v(r,J.los))==='true', count:num(v(r,J.n)), members:new Set(), detailed:false, perms:{}}; }); }
  if(tg){ c=cols(tg); const J={g:c('group name'),e:c('user email')};
    tg.data.forEach(r=>{ const g=v(r,J.g), e=v(r,J.e); if(!g||!e) return; const G=GR[g]||(GR[g]={name:g,count:0,members:new Set(),perms:{}}); G.detailed=true; G.members.add(low(e)); const u=byEmail[low(e)]; if(u && !u.groups.includes(g)) u.groups.push(g); }); }
  Object.values(GR).forEach(G=>{ if(!G.count) G.count=G.members.size; });
  PERM=[];
  if(tp){ c=cols(tp); const K={g:c('grantee name'),it:c('item name'),il:c('item luid'),top:c('top parent'),cap:c('capability'),val:c('permission value')};
    tp.data.forEach(r=>{ const g=v(r,K.g); if(!g) return; const p={g, item:v(r,K.it), luid:v(r,K.il), top:v(r,K.top)||v(r,K.it), cap:v(r,K.cap), val:v(r,K.val)}; PERM.push(p);
      const G=GR[g]||(GR[g]={name:g, count:0, members:new Set(), perms:{}}); const P=G.perms[p.item]||(G.perms[p.item]={item:p.item, top:p.top, allow:new Set(), deny:new Set()}); (/deny/i.test(p.val||'')?P.deny:P.allow).add(p.cap); }); }
  // autorisations réelles : toutes les règles explicites d'un groupe, quel que soit le type d'élément
  Object.values(GR).forEach(G=>{ G.auth={total:0,deny:0,types:{},tops:{}}; });
  if(ta){ c=cols(ta); const A={g:c('grantee name'),t:c('item type'),top:c('top parent'),val:c('permission value'),n:c('item luid')};
    ta.data.forEach(r=>{ const g=v(r,A.g); if(!g) return; const n=num(v(r,A.n)); const G=GR[g]||(GR[g]={name:g,count:0,members:new Set(),perms:{},auth:{total:0,deny:0,types:{},tops:{}}}); if(!G.auth) G.auth={total:0,deny:0,types:{},tops:{}};
      const t=typeFr(v(r,A.t)), top=v(r,A.top)||'—'; G.auth.types[t]=(G.auth.types[t]||0)+n; G.auth.total+=n; G.auth.tops[top]=(G.auth.tops[top]||0)+n; if(/deny/i.test(v(r,A.val)||'')) G.auth.deny+=n; }); }
  AUTH_OK=!!ta;
}
let AUTH_OK=false;
function typeFr(t){ t=low(t); return t.includes('project')?'Projets':t.includes('workbook')?'Classeurs':t.includes('view')?'Vues':t.includes('datasource')||t.includes('data source')?'Sources':t.includes('flow')?'Flux':t.includes('metric')?'Métriques':t.includes('lens')?'Lens':t||'Autres'; }
const authTags = G => Object.entries((G.auth&&G.auth.types)||{}).sort((a,b)=>b[1]-a[1]).map(([t,n])=>'<span class="pill">'+esc(t)+' '+fmt(n)+'</span>').join('');

/* ---------- rendu commun ---------- */
const bar = (parts,total) => '<div class="bar">'+parts.filter(p=>p[0]>0).map(p=>'<i style="width:'+(p[0]*100/(total||1))+'%;background:'+p[1]+'" title="'+esc(p[2]||'')+'"></i>').join('')+'</div>';
const occ = l => (SUMM[l]&&SUMM[l].total)||0;
const sumSt = (l,k) => (SUMM[l]&&SUMM[l][k])||0;
const ALLU = () => Object.values(SUMM).reduce((a,x)=>a+x.total,0);
function kpis(){
  const licN=['Creator','Explorer','Viewer'].reduce((a,l)=>a+occ(l),0), idleN=['Creator','Explorer','Viewer'].reduce((a,l)=>a+sumSt(l,'d')+sumSt(l,'n'),0), recs=U.filter(u=>u.rec);
  const k=[[fmt(licN)+(CAP.Total?' / '+fmt(CAP.Total):''),'Licences occupées'],[fmt(occ('Creator'))+(CAP.Creator?' / '+fmt(CAP.Creator):''),'Creator'],[fmt(occ('Explorer'))+(CAP.Explorer?' / '+fmt(CAP.Explorer):''),'Explorer'],[fmt(occ('Viewer'))+(CAP.Viewer?' / '+fmt(CAP.Viewer):''),'Viewer'],[fmt(idleN),'Licences inactives > 90 j',true],[fmt(recs.length),'Ajustements Creator/Explorer',true],[fmt(occ('Unlicensed')),'Sans licence'],[fmt(Object.keys(GR).length),'Groupes']];
  $('licKpis').innerHTML=k.map(x=>{ const parts=String(x[0]).split(' / '); return '<div class="ban'+(x[2]?' alert':'')+'"><b>'+parts[0]+(parts[1]?'<small> / '+parts[1]+'</small>':'')+'</b><span>'+x[1]+'</span></div>'; }).join('');
}
function tools(){
  const tabs=[['lic','Licences'],['grp','Groupes'],['map','Mapping groupes × projets'],['usr','Utilisateurs']];
  $('licTabs').innerHTML=tabs.map(([k,l])=>'<button type="button" class="chip" data-t="'+k+'" aria-pressed="'+(st.tab===k)+'">'+l+'</button>').join('');
  $('licTabs').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.t; st.sel=null; tools(); main(); panel(); });
  const showF = st.tab==='usr';
  $('licFilt').hidden=!showF;
  if(showF){
    $('licFilt').innerHTML=[['all','Toutes licences']].concat(['Creator','Explorer'].map(l=>[l,l])).map(([k,l])=>'<button type="button" class="chip" data-l="'+k+'" aria-pressed="'+(st.lic===k)+'">'+l+'</button>').join('')+'<span class="sep"></span>'+
      [['all','Tous'],['a','Actifs'],['w','31–90 j'],['d','> 90 j'],['n','Jamais'],['rec','Ajustement proposé']].map(([k,l])=>'<button type="button" class="chip" data-s="'+k+'" aria-pressed="'+(st.status===k)+'">'+(ST[k]?'<i style="background:'+ST[k].c+'"></i>':'')+l+'</button>').join('');
    $('licFilt').querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{ st.lic=b.dataset.l; tools(); main(); });
    $('licFilt').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{ st.status=b.dataset.s; tools(); main(); });
  }
}
const uRow = u => '<button type="button" class="urow" data-u="'+esc(u.email)+'"><span class="dot" style="background:'+ST[u.st].c+'"></span><span class="nm"><b>'+esc(u.name)+'</b><small>'+esc(u.email)+'</small></span><span class="lt" style="--c:'+LIC[u.lic].c+'">'+esc(u.lic)+(u.admin?' · admin':'')+'</span><span class="r">'+ago(u.login)+'</span>'+(u.rec?'<span class="k red">'+(u.rec.k==='remove'?'RETIRER':'→ '+u.rec.to.toUpperCase())+'</span>':'')+'</button>';
const gStats = G => { const m=[...G.members].map(e=>byEmail[e]).filter(Boolean); const c=m.filter(u=>u.lic==='Creator').length, e=m.filter(u=>u.lic==='Explorer').length; return {m, c, e, rest:Math.max(0,G.count-c-e), projects:Object.keys(G.perms).length}; };

/* ---------- vues ---------- */
function vLicences(){
  let h='<div class="lgrid">';
  ['Creator','Explorer','Viewer'].forEach(l=>{
    const m={length:occ(l)}, cap=CAP[l]||0, rec=U.filter(u=>u.lic===l&&u.rec);
    const s=k=>sumSt(l,k);
    h+='<section class="lcard"><div class="lhead"><span class="lt" style="--c:'+LIC[l].c+'">'+l+'</span><b>'+fmt(m.length)+(cap?'<small> / '+fmt(cap)+' allouées</small>':'')+'</b></div>'+
      (cap?'<div class="lbl"><span>Taux d’occupation</span><span>'+pct(m.length,cap)+' %</span></div>'+bar([[m.length,LIC[l].c,'occupées'],[Math.max(0,cap-m.length),'var(--line)','libres']],Math.max(cap,m.length)):'')+
      '<div class="lbl" style="margin-top:12px"><span>Dernière connexion</span><span>'+pct(s('a'),m.length)+' % actifs</span></div>'+bar(['a','w','d','n'].map(k=>[s(k),ST[k].c,ST[k].l]),m.length)+
      '<div class="legend">'+['a','w','d','n'].map(k=>'<span><i style="background:'+ST[k].c+'"></i>'+ST[k].l+' · '+fmt(s(k))+'</span>').join('')+'</div>'+
      '<div class="lfoot"><span>'+(l==='Viewer'?fmt(s('d')+s('n'))+' Viewer inactifs ou jamais connectés':fmt(rec.length)+' ajustement'+(rec.length>1?'s':'')+' proposé'+(rec.length>1?'s':''))+'</span>'+(rec.length&&l!=='Viewer'?'<button type="button" class="ghost" data-go="'+l+'">Voir →</button>':'')+'</div></section>';
  });
  h+='</div>';
  // récupérables
  const rm=U.filter(u=>u.rec&&u.rec.k==='remove'), dn=U.filter(u=>u.rec&&u.rec.k==='down');
  const freed=l=>l==='Viewer'?sumSt('Viewer','d')+sumSt('Viewer','n'):rm.filter(u=>u.lic===l).length+dn.filter(u=>u.lic===l).length;
  h+='<section class="block"><h3>Licences récupérables</h3><p class="hint">Creator et Explorer : estimation par utilisateur, à partir de la dernière connexion et de l’activité de création (administrateurs exclus). Viewer : licences sans connexion depuis 90 jours ; elles sont souvent attribuées automatiquement à la connexion par un groupe (ex. MAG_ALL).</p><div class="grid3">'+
    ['Creator','Explorer','Viewer'].map(l=>'<div class="cell"><span>'+l+' libérables</span><b>'+fmt(freed(l))+'</b></div>').join('')+'</div>'+
    '<div class="two"><div><div class="eyebrow">Retirer la licence · '+fmt(rm.length)+'</div><div class="list">'+rm.sort((a,b)=>(a.login||0)-(b.login||0)).slice(0,40).map(uRow).join('')+'</div>'+(rm.length>40?'<p class="hint">… '+(rm.length-40)+' de plus dans l’onglet Utilisateurs.</p>':'')+'</div>'+
    '<div><div class="eyebrow">Rétrograder · '+fmt(dn.length)+'</div><div class="list">'+dn.sort((a,b)=>LORDER.indexOf(a.lic)-LORDER.indexOf(b.lic)).slice(0,40).map(uRow).join('')+'</div>'+(dn.length>40?'<p class="hint">… '+(dn.length-40)+' de plus dans l’onglet Utilisateurs.</p>':'')+'</div></div></section>';
  // rôles
  const roles=ROLES;
  const adm=U.filter(u=>u.admin);
  h+='<section class="block"><h3>Rôles sur le site</h3><div class="roles">'+Object.entries(roles).sort((a,b)=>b[1]-a[1]).map(([r,n])=>'<div class="role"><span>'+esc(r||'—')+'</span><b>'+fmt(n)+'</b>'+bar([[n,'var(--blue)']],ALLU())+'</div>').join('')+'</div>'+
    '<div class="eyebrow" style="margin-top:14px">Administrateurs du site · '+adm.length+'</div><div class="list">'+adm.map(uRow).join('')+'</div></section>';
  return h;
}
function vGroupes(){
  const q=low(st.q); const gs=Object.values(GR).filter(G=>!q||low(G.name).includes(q)).sort((a,b)=>b.count-a.count);
  let h='<table class="gtab"><thead><tr><th>Groupe</th><th class="n">Membres</th><th class="n">Creator</th><th class="n">Explorer</th><th class="n">Éléments autorisés</th><th>Détail des autorisations</th><th>Licence à la connexion</th></tr></thead><tbody>';
  gs.forEach(G=>{ const s=gStats(G), a=G.auth||{total:0}, flags=[]; if(!G.count) flags.push('vide'); if(AUTH_OK && !a.total && !/^(all users|tous les utilisateurs)$/i.test(G.name)) flags.push('sans autorisation'); if(a.deny) flags.push('refus explicites');
    h+='<tr data-g="'+esc(G.name)+'" class="'+(st.sel===G.name?'sel':'')+'"><td><b>'+esc(G.name)+'</b>'+flags.map(f=>'<span class="k red">'+f.toUpperCase()+'</span>').join('')+'</td><td class="n">'+fmt(G.count)+'</td><td class="n">'+(G.detailed?fmt(s.c):'<span class="hint">—</span>')+'</td><td class="n">'+(G.detailed?fmt(s.e):'<span class="hint">—</span>')+'</td><td class="n"><b>'+fmt(a.total)+'</b></td><td><div class="meta">'+authTags(G)+'</div></td><td>'+(G.los&&G.min?'<span class="pill blue">'+esc(G.min)+'</span>':'<span class="hint">—</span>')+'</td></tr>'; });
  return h+'</tbody></table><p class="hint" style="margin-top:8px">Éléments autorisés : nombre de projets, classeurs, vues et sources sur lesquels le groupe a au moins une règle explicite (source Permissions d’Admin Insights). Creator / Explorer : membres détaillés pour les groupes de moins de 3 000 personnes.</p>';
}
function vMapping(){
  const gs=Object.values(GR).filter(G=>G.auth&&G.auth.total);
  if(!gs.length) return '<p class="hint">Aucune autorisation de groupe remontée par la source Permissions.</p>';
  const tops={}; gs.forEach(G=>Object.entries(G.auth.tops).forEach(([t,n])=>{ tops[t]=(tops[t]||0)+n; }));
  const T=Object.keys(tops).sort((a,b)=>tops[b]-tops[a]);
  const q=low(st.q); const rows=gs.filter(G=>!q||low(G.name).includes(q)).sort((a,b)=>b.auth.total-a.auth.total);
  const max=Math.max(...rows.flatMap(G=>Object.values(G.auth.tops)),1);
  const writeOn=(G,t)=>Object.values(G.perms).some(p=>p.top===t && [...p.allow].some(c=>/write|publish|overwrite|edit|delete|setpermissions|projectleader/i.test(c)));
  const cell=(G,t)=>{ const n=G.auth.tops[t]||0; if(!n) return '<td></td>'; const a=0.15+0.85*Math.sqrt(n/max); const w=writeOn(G,t);
    return '<td class="hm" style="background:rgba(0,78,159,'+a.toFixed(2)+');color:'+(a>0.5?'#fff':'#003A78')+(w?';box-shadow:inset 0 0 0 2px #E2001A':'')+'" title="'+esc(G.name+' → '+t+' : '+n+' élément(s) avec une règle'+(w?' · droits d’écriture ou de publication':''))+'">'+fmt(n)+'</td>'; };
  return '<p class="hint" style="margin:0 0 10px">Nombre d’éléments (projets, classeurs, vues, sources) où chaque groupe a une règle explicite, par projet racine. Plus la case est foncée, plus le groupe est présent. <span class="hm sw" style="background:#fff;box-shadow:inset 0 0 0 2px #E2001A;color:#003A78">cadre rouge</span> : droits d’écriture ou de publication sur un projet.</p>'+
    '<div class="mwrap"><table class="matrix"><thead><tr><th></th>'+T.map(t=>'<th><span>'+esc(t)+'</span></th>').join('')+'<th><span>Total</span></th></tr></thead><tbody>'+
    rows.map(G=>'<tr data-g="'+esc(G.name)+'" class="'+(st.sel===G.name?'sel':'')+'"><th>'+esc(G.name)+' <small>'+fmt(G.count)+' membres</small></th>'+T.map(t=>cell(G,t)).join('')+'<td class="tot">'+fmt(G.auth.total)+'</td></tr>').join('')+'</tbody></table></div>';
}
function vUsers(){
  const q=low(st.q);
  const list=U.filter(u=>(st.lic==='all'||u.lic===st.lic)&&(st.status==='all'||(st.status==='rec'?!!u.rec:u.st===st.status))&&(!q||low(u.name).includes(q)||low(u.email).includes(q)||u.groups.some(g=>low(g).includes(q))))
    .sort((a,b)=>LORDER.indexOf(a.lic)-LORDER.indexOf(b.lic)||(b.login||0)-(a.login||0));
  return '<p class="hint" style="margin:0 0 8px">'+fmt(list.length)+' utilisateur'+(list.length>1?'s':'')+' · Creator, Explorer et administrateurs (les '+fmt(occ('Viewer'))+' Viewer et '+fmt(occ('Unlicensed'))+' comptes sans licence sont comptés dans l’onglet Licences)</p><div class="list">'+list.slice(0,400).map(uRow).join('')+'</div>'+(list.length>400?'<p class="hint">Affinez la recherche pour voir les '+(list.length-400)+' autres.</p>':'');
}
function main(){
  const m=$('licMain');
  m.innerHTML = st.tab==='lic'?vLicences(): st.tab==='grp'?vGroupes(): st.tab==='map'?vMapping(): vUsers();
  m.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{ st.sel='u:'+b.dataset.u; panel(); });
  m.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ st.sel=b.dataset.g; m.querySelectorAll('[data-g]').forEach(x=>x.classList.toggle('sel',x===b)); panel(); });
  m.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ st.tab='usr'; st.lic=b.dataset.go; st.status='rec'; tools(); main(); });
}

/* ---------- panneau ---------- */
function panel(){
  const p=$('licPanel'); let h='';
  if(st.sel && st.sel.startsWith('u:')){
    const u=byEmail[low(st.sel.slice(2))]; if(!u){ p.innerHTML=''; return; }
    h+='<div><div class="eyebrow">Utilisateur</div><h2>'+esc(u.name)+'</h2><p class="hint">'+esc(u.email)+'</p></div>';
    h+='<div class="meta"><span class="pill blue">'+esc(u.role)+'</span><span class="pill" style="color:'+ST[u.st].c+'">● '+ST[u.st].l+'</span></div>';
    h+='<div class="grid2"><div class="cell"><span>Dernière connexion</span><b class="sm">'+dfr(u.login)+'</b></div><div class="cell"><span>Compte créé</span><b class="sm">'+dfr(u.created)+'</b></div><div class="cell"><span>Dernière création</span><b class="sm">'+dfr(u.author)+'</b></div><div class="cell"><span>Dernière publication</span><b class="sm">'+dfr(u.publish)+'</b></div><div class="cell"><span>Classeurs possédés</span><b>'+fmt(u.owb)+'</b></div><div class="cell"><span>Sources possédées</span><b>'+fmt(u.ods)+'</b></div></div>';
    h+='<ul class="flags">'+(u.rec?'<li>'+esc(u.rec.l)+(u.owb||u.ods?' Attention : il possède '+fmt(u.owb)+' classeur(s) et '+fmt(u.ods)+' source(s), à réattribuer avant de retirer la licence.':'')+'</li>':'<li class="ok">Licence cohérente avec l’usage.</li>')+'</ul>';
    h+='<div class="sec"><div class="eyebrow">Groupes · '+u.groups.length+'</div>'+(u.groups.length?'<div class="list">'+u.groups.sort().map(g=>'<button type="button" data-gp="'+esc(g)+'"><span class="nm">'+esc(g)+'</span><span class="r">'+fmt((GR[g]&&GR[g].count)||0)+'</span></button>').join('')+'</div>':'<p class="hint">Aucun groupe.</p>')+'</div>';
  } else if(st.sel && GR[st.sel]){
    const G=GR[st.sel], s=gStats(G), perms=Object.values(G.perms).sort((a,b)=>a.top.localeCompare(b.top,'fr')||a.item.localeCompare(b.item,'fr'));
    h+='<div><div class="eyebrow">Groupe</div><h2>'+esc(G.name)+'</h2></div>';
    h+='<div class="grid2"><div class="cell"><span>Membres</span><b>'+fmt(G.count)+'</b></div><div class="cell"><span>dont Creator / Explorer</span><b>'+(G.detailed?fmt(s.c)+' / '+fmt(s.e):'—')+'</b></div><div class="cell"><span>Éléments autorisés</span><b>'+fmt((G.auth&&G.auth.total)||0)+'</b></div><div class="cell"><span>Licence à la connexion</span><b class="sm">'+(G.los&&G.min?esc(G.min):'non')+'</b></div></div>';
    if(G.detailed && G.count) h+='<div class="sec"><div class="eyebrow">Licences des membres</div>'+bar([[s.c,LIC.Creator.c,'Creator'],[s.e,LIC.Explorer.c,'Explorer'],[s.rest,LIC.Viewer.c,'Viewer ou sans licence']],G.count)+'<div class="legend"><span><i style="background:'+LIC.Creator.c+'"></i>Creator · '+s.c+'</span><span><i style="background:'+LIC.Explorer.c+'"></i>Explorer · '+s.e+'</span><span><i style="background:'+LIC.Viewer.c+'"></i>Viewer ou sans licence · '+fmt(s.rest)+'</span></div></div>';
    const f=[]; if(!G.count) f.push(['','Groupe vide : à supprimer s’il ne sert plus.']); if(!G.detailed && G.count) f.push(['info','Groupe de '+fmt(G.count)+' membres : liste détaillée non chargée (groupes de moins de 3 000 membres uniquement).']); 
    const idle=s.m.filter(u=>u.st==='d'||u.st==='n').length; if(idle) f.push(['info',idle+' Creator/Explorer sans connexion depuis plus de 90 jours.']);
    if(G.los&&G.min) f.push(['info','Attribue la licence « '+esc(G.min)+' » à la première connexion de ses membres.']);
    if(f.length) h+='<ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul>';
    if(G.auth && G.auth.total) h+='<div class="sec"><div class="eyebrow">Autorisations · '+fmt(G.auth.total)+' éléments</div><div class="meta">'+authTags(G)+'</div><div class="list">'+Object.entries(G.auth.tops).sort((a,b)=>b[1]-a[1]).map(([t,n])=>'<button type="button"><span class="nm">'+esc(t)+'</span><span class="r">'+fmt(n)+'</span></button>').join('')+'</div></div>';
    else if(AUTH_OK) h+='<ul class="flags"><li>Aucune règle d’autorisation explicite pour ce groupe : il ne donne accès à rien directement.</li></ul>';
    if(perms.length) h+='<div class="sec"><div class="eyebrow">Détail des règles sur les projets</div><div class="perm">'+perms.map(p=>'<div><b>'+esc(p.item)+'</b><small>'+esc(p.top===p.item?'projet racine':p.top)+'</small><div class="caps">'+[...p.allow].sort().map(c=>'<span class="pill">'+esc(c)+'</span>').join('')+[...p.deny].sort().map(c=>'<span class="pill red">✕ '+esc(c)+'</span>').join('')+'</div></div>').join('')+'</div></div>';
    if(s.m.length) h+='<div class="sec"><div class="eyebrow">Membres Creator / Explorer</div><div class="list">'+s.m.sort((a,b)=>(b.login||0)-(a.login||0)).slice(0,300).map(uRow).join('')+'</div></div>';
  } else {
    const licN=['Creator','Explorer','Viewer'].reduce((a,l)=>a+occ(l),0);
    h+='<div><div class="eyebrow">Site france</div><h2>Licences & groupes</h2></div>';
    h+='<div class="sec"><div class="eyebrow">Répartition des licences</div>'+bar(LORDER.map(l=>[occ(l),LIC[l].c,l]),ALLU())+'<div class="legend">'+LORDER.map(l=>'<span><i style="background:'+LIC[l].c+'"></i>'+l+' · '+fmt(occ(l))+'</span>').join('')+'</div></div>';
    const f=[]; const free=CAP.Total?CAP.Total-licN:null;
    if(free!=null) f.push([free<20?'':'info', fmt(free)+' licence'+(free>1?'s':'')+' encore disponible'+(free>1?'s':'')+' sur '+fmt(CAP.Total)+'.']);
    const idleN=['Creator','Explorer','Viewer'].reduce((a,l)=>a+sumSt(l,'d')+sumSt(l,'n'),0); if(idleN) f.push(['', fmt(idleN)+' licences sans connexion depuis plus de 90 jours : '+fmt(sumSt('Creator','d')+sumSt('Creator','n'))+' Creator, '+fmt(sumSt('Explorer','d')+sumSt('Explorer','n'))+' Explorer, '+fmt(sumSt('Viewer','d')+sumSt('Viewer','n'))+' Viewer.']);
    const emptyG=Object.values(GR).filter(G=>!G.count).length; if(emptyG) f.push(['info',emptyG+' groupe'+(emptyG>1?'s vides':' vide')+'.']);
    const adm=U.filter(u=>u.admin).length; if(adm>5) f.push(['info',adm+' administrateurs du site : à limiter au strict nécessaire.']);
    h+='<ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul>';
    h+='<p class="hint">Données en direct d’Admin Insights (TS Users, Groups, Permissions). Cliquez sur un utilisateur ou un groupe pour le détail.</p>';
    if((window.__LIC_ERR||[]).length) h+='<ul class="flags">'+window.__LIC_ERR.map(e=>'<li>Lecture : '+esc(e)+'</li>').join('')+'</ul>';
  }
  p.innerHTML=h;
  p.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{ st.sel='u:'+b.dataset.u; panel(); });
  p.querySelectorAll('[data-gp]').forEach(b=>b.onclick=()=>{ st.sel=b.dataset.gp; panel(); });
}

/* ---------- démarrage ---------- */
function mount(){
  const css=document.createElement('link'); css.rel='stylesheet'; css.href='licences.css?v=2'; document.head.appendChild(css);
  const app=document.createElement('div'); app.className='app lic'; app.id='lic'; app.hidden=true;
  app.innerHTML='<header class="head bans-wrap"><div class="bans" id="licKpis"></div></header>'+
    '<div class="tools"><div class="chips" id="licTabs" role="tablist"></div><span class="sep"></span><label class="search" style="max-width:280px"><span style="position:absolute;left:-9999px">Rechercher</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93A2B6" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="licQ" type="search" placeholder="Utilisateur, e-mail, groupe…" autocomplete="off"></label></div>'+
    '<div class="tools" id="licFilt" hidden></div>'+
    '<div class="main"><div class="canvas" id="licMain" style="padding:16px 18px"></div><aside class="panel" id="licPanel" aria-live="polite"></aside></div>';
  document.body.appendChild(app);
  $('licQ').addEventListener('input',e=>{ st.q=e.target.value.trim(); main(); });
}
window.LIC_START = async function(){
  mount();
  try{ await load(); }catch(e){ console.error('[licences] load', e); throw e; }
  try{ kpis(); tools(); main(); panel(); }catch(e){ console.error('[licences] render', e); $('licMain').innerHTML='<p class="hint">Erreur d’affichage : '+esc(e&&e.message||e)+'</p>'; }
  const ws=tableau.extensions.dashboardContent.dashboard.worksheets.find(w=>w.name==='Lic_Users');
  try{ ws.addEventListener(tableau.TableauEventType.SummaryDataChanged, async()=>{ await load(); kpis(); main(); panel(); }); }catch(e){}
};
})();
