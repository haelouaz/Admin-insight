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

async function load(){
  const dash=tableau.extensions.dashboardContent.dashboard, W=n=>dash.worksheets.find(w=>w.name===n);
  const rd = async n => { const w=W(n); if(!w) return null; try{ return await readTable(w); }catch(e){ console.error('[licences] '+n, e); window.__LIC_ERR=(window.__LIC_ERR||[]).concat(n+' : '+(e&&e.message||e)); return null; } };
  const [tu,tg,tp] = await Promise.all([rd('Lic_Users'), rd('Lic_Groups'), rd('Lic_Perms')]);
  if(!tu) throw new Error((window.__LIC_ERR||['Lic_Users illisible']).join(' | '));
  let c=cols(tu);
  const I={email:c('user email'),name:c('friendly name'),role:c('site role'),lt:c('license type'),luid:c('user luid'),login:c('last login'),created:c('creation date'),web:c('web authoring'),desk:c('desktop'),prep:c('prep'),wbp:c('workbook - last publish'),dsp:c('data source - last publish'),view:c('view - last access'),owb:c('(workbooks)'),ods:c('(data sources)'),pwb:c('publish events'),acc:c('access events'),cc:c('allowed creators'),ce:c('allowed explorers'),cv:c('allowed viewers'),ct:c('total allowed')};
  if(I.owb<0) I.owb=c('workbooks'); if(I.ods<0) I.ods=c('data sources)');
  U=[]; byEmail={};
  tu.data.forEach(r=>{
    const email=v(r,I.email); if(!email || byEmail[low(email)]) return;
    const role=v(r,I.role)||'', lic=licOf(role, v(r,I.lt));
    const u={email, name:v(r,I.name)||email, role, lic, admin:/administrator/i.test(role), login:toT(v(r,I.login)), created:toT(v(r,I.created)),
      author:Math.max(...[I.web,I.desk,I.prep,I.wbp,I.dsp].map(i=>toT(v(r,i))||0))||null, web:toT(v(r,I.web)), publish:Math.max(toT(v(r,I.wbp))||0, toT(v(r,I.dsp))||0)||null,
      owb:num(v(r,I.owb)), ods:num(v(r,I.ods)), groups:[]};
    u.st=statusOf(u.login); U.push(u); byEmail[low(email)]=u;
    if(I.cc>=0 && !CAP.Creator){ CAP={Creator:num(v(r,I.cc)),Explorer:num(v(r,I.ce)),Viewer:num(v(r,I.cv)),Total:num(v(r,I.ct))}; }
  });
  // recommandations de licence
  U.forEach(u=>{
    const idle90 = t => t==null || (NOW-t)/DAY>90;
    u.rec=null;
    if(u.lic!=='Unlicensed' && (u.st==='d'||u.st==='n') && !u.admin) u.rec={k:'remove', l: u.st==='n'?'Jamais connecté : retirer la licence':'Aucune connexion depuis plus de 90 jours : retirer la licence'};
    else if(u.lic==='Creator' && idle90(u.author) && !u.admin) u.rec={k:'down', to:'Explorer', l:'Aucune création (Desktop, Prep, Web Edit, publication) depuis 90 jours : passer en Explorer'};
    else if(u.lic==='Explorer' && idle90(u.web) && idle90(u.publish) && !u.admin) u.rec={k:'down', to:'Viewer', l:'Aucune modification web ni publication depuis 90 jours : une licence Viewer suffit'};
  });
  // groupes
  GR={};
  if(tg){ c=cols(tg); const J={g:c('group name'),luid:c('group luid'),e:c('user email'),min:c('minimum site role'),los:c('license on sign')};
    tg.data.forEach(r=>{ const g=v(r,J.g); if(!g) return; const G=GR[g]||(GR[g]={name:g, luid:v(r,J.luid), min:v(r,J.min), los:String(v(r,J.los))==='true', members:new Set(), perms:{} }); const e=v(r,J.e); if(e){ G.members.add(low(e)); const u=byEmail[low(e)]; if(u && !u.groups.includes(g)) u.groups.push(g); } }); }
  PERM=[];
  if(tp){ c=cols(tp); const K={g:c('grantee name'),it:c('item name'),il:c('item luid'),top:c('top parent'),cap:c('capability'),val:c('permission value')};
    tp.data.forEach(r=>{ const g=v(r,K.g); if(!g) return; const p={g, item:v(r,K.it), luid:v(r,K.il), top:v(r,K.top)||v(r,K.it), cap:v(r,K.cap), val:v(r,K.val)}; PERM.push(p);
      const G=GR[g]||(GR[g]={name:g, members:new Set(), perms:{}, noMembership:true}); const P=G.perms[p.item]||(G.perms[p.item]={item:p.item, top:p.top, allow:new Set(), deny:new Set()}); (/deny/i.test(p.val||'')?P.deny:P.allow).add(p.cap); }); }
}

/* ---------- rendu commun ---------- */
const bar = (parts,total) => '<div class="bar">'+parts.filter(p=>p[0]>0).map(p=>'<i style="width:'+(p[0]*100/(total||1))+'%;background:'+p[1]+'" title="'+esc(p[2]||'')+'"></i>').join('')+'</div>';
const occ = l => U.filter(u=>u.lic===l).length;
function kpis(){
  const lic=U.filter(u=>u.lic!=='Unlicensed'), idle=lic.filter(u=>u.st==='d'||u.st==='n'), recs=U.filter(u=>u.rec), noGrp=U.filter(u=>!u.groups.filter(g=>!/^all users$/i.test(g)).length);
  const k=[[fmt(lic.length)+(CAP.Total?' / '+fmt(CAP.Total):''),'Licences occupées'],[fmt(occ('Creator'))+(CAP.Creator?' / '+fmt(CAP.Creator):''),'Creator'],[fmt(occ('Explorer'))+(CAP.Explorer?' / '+fmt(CAP.Explorer):''),'Explorer'],[fmt(occ('Viewer'))+(CAP.Viewer?' / '+fmt(CAP.Viewer):''),'Viewer'],[fmt(idle.length),'Licences inactives > 90 j',true],[fmt(recs.length),'Ajustements proposés',true],[fmt(Object.keys(GR).length),'Groupes'],[fmt(noGrp.length),'Sans groupe métier']];
  $('licKpis').innerHTML=k.map(x=>'<div class="kpi'+(x[2]?' alert':'')+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join('');
}
function tools(){
  const tabs=[['lic','Licences'],['grp','Groupes'],['map','Mapping groupes × projets'],['usr','Utilisateurs']];
  $('licTabs').innerHTML=tabs.map(([k,l])=>'<button type="button" class="chip" data-t="'+k+'" aria-pressed="'+(st.tab===k)+'">'+l+'</button>').join('');
  $('licTabs').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.t; st.sel=null; tools(); main(); panel(); });
  const showF = st.tab==='usr';
  $('licFilt').hidden=!showF;
  if(showF){
    $('licFilt').innerHTML=[['all','Toutes licences']].concat(LORDER.map(l=>[l,l])).map(([k,l])=>'<button type="button" class="chip" data-l="'+k+'" aria-pressed="'+(st.lic===k)+'">'+l+'</button>').join('')+'<span class="sep"></span>'+
      [['all','Tous'],['a','Actifs'],['w','31–90 j'],['d','> 90 j'],['n','Jamais'],['rec','Ajustement proposé']].map(([k,l])=>'<button type="button" class="chip" data-s="'+k+'" aria-pressed="'+(st.status===k)+'">'+(ST[k]?'<i style="background:'+ST[k].c+'"></i>':'')+l+'</button>').join('');
    $('licFilt').querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{ st.lic=b.dataset.l; tools(); main(); });
    $('licFilt').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{ st.status=b.dataset.s; tools(); main(); });
  }
}
const uRow = u => '<button type="button" class="urow" data-u="'+esc(u.email)+'"><span class="dot" style="background:'+ST[u.st].c+'"></span><span class="nm"><b>'+esc(u.name)+'</b><small>'+esc(u.email)+'</small></span><span class="lt" style="--c:'+LIC[u.lic].c+'">'+esc(u.lic)+(u.admin?' · admin':'')+'</span><span class="r">'+ago(u.login)+'</span>'+(u.rec?'<span class="k red">'+(u.rec.k==='remove'?'RETIRER':'→ '+u.rec.to.toUpperCase())+'</span>':'')+'</button>';
const gStats = G => { const m=[...G.members].map(e=>byEmail[e]).filter(Boolean); const act=m.filter(u=>u.st==='a').length; return {m, act, lic:LORDER.map(l=>[m.filter(u=>u.lic===l).length, LIC[l].c, l]), projects:Object.keys(G.perms).length}; };

/* ---------- vues ---------- */
function vLicences(){
  let h='<div class="lgrid">';
  ['Creator','Explorer','Viewer'].forEach(l=>{
    const m=U.filter(u=>u.lic===l), cap=CAP[l]||0, rec=m.filter(u=>u.rec);
    const s=k=>m.filter(u=>u.st===k).length;
    h+='<section class="lcard"><div class="lhead"><span class="lt" style="--c:'+LIC[l].c+'">'+l+'</span><b>'+fmt(m.length)+(cap?'<small> / '+fmt(cap)+' allouées</small>':'')+'</b></div>'+
      (cap?'<div class="lbl"><span>Taux d’occupation</span><span>'+pct(m.length,cap)+' %</span></div>'+bar([[m.length,LIC[l].c,'occupées'],[Math.max(0,cap-m.length),'var(--line)','libres']],Math.max(cap,m.length)):'')+
      '<div class="lbl" style="margin-top:12px"><span>Dernière connexion</span><span>'+pct(s('a'),m.length)+' % actifs</span></div>'+bar(['a','w','d','n'].map(k=>[s(k),ST[k].c,ST[k].l]),m.length)+
      '<div class="legend">'+['a','w','d','n'].map(k=>'<span><i style="background:'+ST[k].c+'"></i>'+ST[k].l+' · '+fmt(s(k))+'</span>').join('')+'</div>'+
      '<div class="lfoot"><span>'+fmt(rec.length)+' ajustement'+(rec.length>1?'s':'')+' proposé'+(rec.length>1?'s':'')+'</span>'+(rec.length?'<button type="button" class="ghost" data-go="'+l+'">Voir →</button>':'')+'</div></section>';
  });
  h+='</div>';
  // récupérables
  const rm=U.filter(u=>u.rec&&u.rec.k==='remove'), dn=U.filter(u=>u.rec&&u.rec.k==='down');
  const freed=l=>rm.filter(u=>u.lic===l).length+dn.filter(u=>u.lic===l).length;
  h+='<section class="block"><h3>Licences récupérables</h3><p class="hint">Estimation à partir de la dernière connexion et de l’activité de création. Les administrateurs du site sont exclus.</p><div class="grid3">'+
    ['Creator','Explorer','Viewer'].map(l=>'<div class="cell"><span>'+l+' libérables</span><b>'+fmt(freed(l))+'</b></div>').join('')+'</div>'+
    '<div class="two"><div><div class="eyebrow">Retirer la licence · '+fmt(rm.length)+'</div><div class="list">'+rm.sort((a,b)=>(a.login||0)-(b.login||0)).slice(0,40).map(uRow).join('')+'</div>'+(rm.length>40?'<p class="hint">… '+(rm.length-40)+' de plus dans l’onglet Utilisateurs.</p>':'')+'</div>'+
    '<div><div class="eyebrow">Rétrograder · '+fmt(dn.length)+'</div><div class="list">'+dn.sort((a,b)=>LORDER.indexOf(a.lic)-LORDER.indexOf(b.lic)).slice(0,40).map(uRow).join('')+'</div>'+(dn.length>40?'<p class="hint">… '+(dn.length-40)+' de plus dans l’onglet Utilisateurs.</p>':'')+'</div></div></section>';
  // rôles
  const roles={}; U.forEach(u=>roles[u.role]=(roles[u.role]||0)+1);
  const adm=U.filter(u=>u.admin);
  h+='<section class="block"><h3>Rôles sur le site</h3><div class="roles">'+Object.entries(roles).sort((a,b)=>b[1]-a[1]).map(([r,n])=>'<div class="role"><span>'+esc(r||'—')+'</span><b>'+fmt(n)+'</b>'+bar([[n,'var(--blue)']],U.length)+'</div>').join('')+'</div>'+
    '<div class="eyebrow" style="margin-top:14px">Administrateurs du site · '+adm.length+'</div><div class="list">'+adm.map(uRow).join('')+'</div></section>';
  return h;
}
function vGroupes(){
  const q=low(st.q); const gs=Object.values(GR).filter(G=>!q||low(G.name).includes(q)).map(G=>({G,s:gStats(G)})).sort((a,b)=>b.s.m.length-a.s.m.length);
  let h='<table class="gtab"><thead><tr><th>Groupe</th><th class="n">Membres</th><th>Licences</th><th class="n">Actifs 30 j</th><th class="n">Projets</th><th>Licence à la connexion</th></tr></thead><tbody>';
  gs.forEach(({G,s})=>{ const flags=[]; if(!s.m.length) flags.push('vide'); if(!s.projects) flags.push('sans droit'); if(s.m.length && pct(s.act,s.m.length)<20) flags.push('peu actif');
    h+='<tr data-g="'+esc(G.name)+'" class="'+(st.sel===G.name?'sel':'')+'"><td><b>'+esc(G.name)+'</b>'+flags.map(f=>'<span class="k red">'+f.toUpperCase()+'</span>').join('')+'</td><td class="n">'+fmt(s.m.length)+'</td><td style="width:160px">'+bar(s.lic,s.m.length)+'</td><td class="n">'+(s.m.length?pct(s.act,s.m.length)+' %':'—')+'</td><td class="n">'+fmt(s.projects)+'</td><td>'+(G.los&&G.min?'<span class="pill blue">'+esc(G.min)+'</span>':'<span class="hint">—</span>')+'</td></tr>'; });
  return h+'</tbody></table>'+(gs.length?'':'<p class="hint">Aucun groupe.</p>');
}
function vMapping(){
  const gs=Object.values(GR).filter(G=>Object.keys(G.perms).length);
  if(!gs.length) return '<p class="hint">Aucun droit de groupe sur les projets n’a été remonté par la source Permissions.</p>';
  const tops={}; gs.forEach(G=>Object.values(G.perms).forEach(p=>{ tops[p.top]=(tops[p.top]||0)+1; }));
  const T=Object.keys(tops).sort((a,b)=>tops[b]-tops[a]);
  const q=low(st.q); const rows=gs.filter(G=>!q||low(G.name).includes(q)).sort((a,b)=>Object.keys(b.perms).length-Object.keys(a.perms).length);
  const cell=(G,t)=>{ const ps=Object.values(G.perms).filter(p=>p.top===t); if(!ps.length) return '<td></td>'; const w=ps.some(p=>[...p.allow].some(c=>/write|publish|overwrite|edit|delete|setpermissions|projectleader|write/i.test(c))); const d=ps.some(p=>p.deny.size);
    return '<td class="hm '+(w?'w':'r')+(d?' d':'')+'" title="'+esc(G.name+' → '+t+' : '+ps.length+' projet(s)'+(w?' · écriture':' · lecture')+(d?' · refus explicites':''))+'">'+ps.length+'</td>'; };
  return '<p class="hint" style="margin:0 0 10px">Droits des groupes par projet racine (nombre de projets où le groupe a au moins une règle). <span class="hm r sw">lecture</span> <span class="hm w sw">écriture / publication</span> <span class="hm r d sw">refus explicite</span></p>'+
    '<div class="mwrap"><table class="matrix"><thead><tr><th></th>'+T.map(t=>'<th><span>'+esc(t)+'</span></th>').join('')+'</tr></thead><tbody>'+
    rows.map(G=>'<tr data-g="'+esc(G.name)+'" class="'+(st.sel===G.name?'sel':'')+'"><th>'+esc(G.name)+' <small>'+fmt(G.members.size)+'</small></th>'+T.map(t=>cell(G,t)).join('')+'</tr>').join('')+'</tbody></table></div>';
}
function vUsers(){
  const q=low(st.q);
  const list=U.filter(u=>(st.lic==='all'||u.lic===st.lic)&&(st.status==='all'||(st.status==='rec'?!!u.rec:u.st===st.status))&&(!q||low(u.name).includes(q)||low(u.email).includes(q)||u.groups.some(g=>low(g).includes(q))))
    .sort((a,b)=>LORDER.indexOf(a.lic)-LORDER.indexOf(b.lic)||(b.login||0)-(a.login||0));
  return '<p class="hint" style="margin:0 0 8px">'+fmt(list.length)+' utilisateur'+(list.length>1?'s':'')+'</p><div class="list">'+list.slice(0,400).map(uRow).join('')+'</div>'+(list.length>400?'<p class="hint">Affinez la recherche pour voir les '+(list.length-400)+' autres.</p>':'');
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
    h+='<div class="sec"><div class="eyebrow">Groupes · '+u.groups.length+'</div>'+(u.groups.length?'<div class="list">'+u.groups.sort().map(g=>'<button type="button" data-gp="'+esc(g)+'"><span class="nm">'+esc(g)+'</span><span class="r">'+fmt((GR[g]&&GR[g].members.size)||0)+'</span></button>').join('')+'</div>':'<p class="hint">Aucun groupe.</p>')+'</div>';
  } else if(st.sel && GR[st.sel]){
    const G=GR[st.sel], s=gStats(G), perms=Object.values(G.perms).sort((a,b)=>a.top.localeCompare(b.top,'fr')||a.item.localeCompare(b.item,'fr'));
    h+='<div><div class="eyebrow">Groupe</div><h2>'+esc(G.name)+'</h2></div>';
    h+='<div class="grid2"><div class="cell"><span>Membres</span><b>'+fmt(s.m.length)+'</b></div><div class="cell"><span>Actifs 30 j</span><b>'+(s.m.length?pct(s.act,s.m.length)+' %':'—')+'</b></div><div class="cell"><span>Projets avec droits</span><b>'+fmt(s.projects)+'</b></div><div class="cell"><span>Licence à la connexion</span><b class="sm">'+(G.los&&G.min?esc(G.min):'non')+'</b></div></div>';
    h+='<div class="sec"><div class="eyebrow">Licences des membres</div>'+bar(s.lic,s.m.length)+'<div class="legend">'+s.lic.filter(x=>x[0]).map(x=>'<span><i style="background:'+x[1]+'"></i>'+x[2]+' · '+x[0]+'</span>').join('')+'</div></div>';
    const f=[]; if(!s.m.length) f.push(['','Groupe vide : à supprimer s’il ne sert plus.']); if(!s.projects && !/^all users$/i.test(G.name)) f.push(['','Aucun droit sur un projet : groupe orphelin ou utilisé seulement pour des abonnements ou des filtres de sécurité.']);
    const idle=s.m.filter(u=>u.st==='d'||u.st==='n').length; if(idle) f.push(['info',idle+' membre'+(idle>1?'s':'')+' sans connexion depuis plus de 90 jours.']);
    if(G.los&&G.min) f.push(['info','Attribue la licence « '+esc(G.min)+' » à la première connexion de ses membres.']);
    if(f.length) h+='<ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul>';
    if(perms.length) h+='<div class="sec"><div class="eyebrow">Droits sur les projets</div><div class="perm">'+perms.map(p=>'<div><b>'+esc(p.item)+'</b><small>'+esc(p.top===p.item?'projet racine':p.top)+'</small><div class="caps">'+[...p.allow].sort().map(c=>'<span class="pill">'+esc(c)+'</span>').join('')+[...p.deny].sort().map(c=>'<span class="pill red">✕ '+esc(c)+'</span>').join('')+'</div></div>').join('')+'</div></div>';
    h+='<div class="sec"><div class="eyebrow">Membres</div><div class="list">'+s.m.sort((a,b)=>(b.login||0)-(a.login||0)).slice(0,300).map(uRow).join('')+'</div></div>';
  } else {
    const lic=U.filter(u=>u.lic!=='Unlicensed');
    h+='<div><div class="eyebrow">Site france</div><h2>Licences & groupes</h2></div>';
    h+='<div class="sec"><div class="eyebrow">Répartition des licences</div>'+bar(LORDER.map(l=>[occ(l),LIC[l].c,l]),U.length)+'<div class="legend">'+LORDER.map(l=>'<span><i style="background:'+LIC[l].c+'"></i>'+l+' · '+fmt(occ(l))+'</span>').join('')+'</div></div>';
    const f=[]; const free=CAP.Total?CAP.Total-lic.length:null;
    if(free!=null) f.push([free<20?'':'info', fmt(free)+' licence'+(free>1?'s':'')+' encore disponible'+(free>1?'s':'')+' sur '+fmt(CAP.Total)+'.']);
    const idle=lic.filter(u=>u.st==='d'||u.st==='n'); if(idle.length) f.push(['', fmt(idle.length)+' licences sans connexion depuis plus de 90 jours, dont '+fmt(idle.filter(u=>u.lic==='Creator').length)+' Creator.']);
    const emptyG=Object.values(GR).filter(G=>!G.members.size).length; if(emptyG) f.push(['info',emptyG+' groupe'+(emptyG>1?'s vides':' vide')+'.']);
    const adm=U.filter(u=>u.admin).length; if(adm>5) f.push(['info',adm+' administrateurs du site : à limiter au strict nécessaire.']);
    h+='<ul class="flags">'+f.map(([c,t])=>'<li class="'+c+'">'+t+'</li>').join('')+'</ul>';
    h+='<p class="hint">Données en direct d’Admin Insights (TS Users, Groups, Permissions). Cliquez sur un utilisateur ou un groupe pour le détail.</p>';
  }
  p.innerHTML=h;
  p.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{ st.sel='u:'+b.dataset.u; panel(); });
  p.querySelectorAll('[data-gp]').forEach(b=>b.onclick=()=>{ st.sel=b.dataset.gp; panel(); });
}

/* ---------- démarrage ---------- */
function mount(){
  const css=document.createElement('link'); css.rel='stylesheet'; css.href='licences.css?v=1'; document.head.appendChild(css);
  const app=document.createElement('div'); app.className='app lic'; app.id='lic'; app.hidden=true;
  app.innerHTML='<header class="head"><div class="kpis" id="licKpis"></div></header>'+
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
