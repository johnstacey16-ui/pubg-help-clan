'use strict';
// On-demand comparison of verified clan members' *saved* mastery responses.
// No PUBG refresh, synthetic denominator or combination of game-mode sources.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)root.ClanWeaponBoard=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const $=id=>document.getElementById(id);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
 const metrics=['kills','headshots','knocks','damage','defeats','longestKill'];
 const sources=['official','competitive','total'];
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const fmt=(v,dp=0)=>finite(v)===null?'—':v.toLocaleString('en-GB',{maximumFractionDigits:dp});
 const metricValue=(record,key)=>record?.sources?.[$('clan-weapon-source').value]?.metrics?.[key]?.value??null;
 function csvSafe(v){
  const input=String(v??'').replace(/[\r\n]/g,' ');
  const protectedCell=/^[\s]*[=+\-@]/.test(input)?"'"+input:input;
  return '"'+protectedCell.replace(/"/g,'""')+'"';
 }
 function csvRows(rows,source){
  const heads=['Weapon','Source','Players with field','Kills','Kills players',
   'Headshots','Headshots players','Knocks','Knocks players','Damage',
   'Damage players','Defeats','Defeats players','Longest kill (max m)','Longest kill players'];
  const out=[heads.map(csvSafe).join(',')];
  for(const item of rows){
   const data=item.sources?.[source];
   if(!data)continue;
   const columns=[item.name,source,data.players];
   for(const key of metrics)
    columns.push(data.metrics?.[key]?.value??'',data.metrics?.[key]?.observed??0);
   out.push(columns.map(csvSafe).join(','));
  }
  return out.join('\r\n')+'\r\n';
 }
 function sortWeapons(items,source,metric,search){
  const text=String(search??'').toLowerCase().trim();
  return (Array.isArray(items)?items:[]).filter(item=>
   typeof item?.name==='string'&&item.name.toLowerCase().includes(text))
   .slice().sort((a,b)=>{
    const figure=item=>metric==='players'?
      finite(item.sources?.[source]?.players)??-1:
      finite(item.sources?.[source]?.metrics?.[metric]?.value)??-1;
    return figure(b)-figure(a)||
      (b.sources?.[source]?.players??0)-(a.sources?.[source]?.players??0)||
      a.name.localeCompare(b.name);
   });
 }
 function datum(source,key){
  const value=source?.metrics?.[key];
  const n=finite(value?.value);
  return n===null?'—':fmt(n,key==='damage'||key==='longestKill'?1:0);
 }
 let current=null,chosen=null,ready=false,request=0;
 function render(){
  if(!current)return;
  const source=$('clan-weapon-source').value,
   sort=$('clan-weapon-sort').value,
   rows=sortWeapons(current.weapons,source,sort,$('clan-weapon-search').value);
  if(!rows.some(item=>item.name===chosen))chosen=rows[0]?.name||null;
  $('clan-weapon-coverage').textContent=
   'Verified roster names: '+fmt(current.verifiedMembers)+
   ' · Resolved Xbox/PS accounts: '+fmt(current.resolvedConsoleAccounts)+
   ' · Saved mastery responses: '+fmt(current.cachedMasteryPlayers)+
   ' · With weapon records: '+fmt(current.contributingPlayers)+
   ' · Displayed weapons: '+rows.length+' of '+current.weapons.length+
   '. Saved responses range from '+(current.oldestSavedAt||'unknown')+
   ' to '+(current.newestSavedAt||'unknown')+
   '. Samples differ by player. No live PUBG requests.';
  const kpis=[
   ['Available weapons',rows.length],
   ['Players with mastery',current.contributingPlayers],
   ['Source',''+(source==='total'?'Legacy frozen':source==='official'?'Official post-18.2':'Competitive post-18.2')]
  ];
  $('clan-weapon-summary').innerHTML=kpis.map(([label,n])=>
   '<div class="clan-weapon-kpi"><small>'+escape(label)+'</small><strong>'+
   escape(typeof n==='number'?fmt(n):n)+'</strong></div>').join('');
  $('clan-weapon-rows').innerHTML=rows.slice(0,120).map(item=>{
   const r=item.sources?.[source],metrics=r?.metrics||{};
   return '<tr'+(item.name===chosen?' class="clan-weapon-selected"':'')+'>'+
    '<td><button type="button" class="clan-weapon-choose" data-clan-weapon="'+escape(item.name)+'">'+escape(item.name)+'</button></td>'+
    '<td>'+fmt(r?.players)+'</td>'+
    metricsForTable(metrics)+
    '</tr>';
  }).join('')||'<tr><td colspan="8" class="empty">No weapons match this search.</td></tr>';
  const active=rows.find(item=>item.name===chosen);
  if(!active){$('clan-weapon-leaders').innerHTML='<p class="small muted">Select a weapon to see its verified clan leaders.</p>';return;}
  const d=active.sources?.[source],leaders=d?.leaders||[];
  $('clan-weapon-leaders').innerHTML='<h3>'+escape(active.name)+
   ' · '+escape(source==='total'?'Legacy':source==='official'?'Official':'Competitive')+
   '</h3><p class="small muted">'+fmt(d?.players)+
   ' saved players have at least one numeric field for this weapon. '+
   'Leaders below are ordered by *observed* kills, with missing kill counts excluded.</p>'+
   (leaders.length?
    '<div class="scroll-table"><table><thead><tr><th>PLAYER</th><th>CONSOLE</th><th>KILLS</th>'+
    '<th>HEADSHOTS</th><th>KNOCKS</th><th>DAMAGE</th><th>DEFEATS</th>'+
    '<th>LONGEST KILL</th></tr></thead><tbody>'+
    leaders.map((p,i)=>'<tr><td><strong>'+fmt(i+1)+'. '+escape(p.name)+'</strong></td>'+
     '<td>'+escape(p.platform==='xbox'?'Xbox':'PlayStation')+'</td>'+
     '<td>'+fmt(p.kills)+'</td><td>'+fmt(p.headshots)+'</td>'+
     '<td>'+fmt(p.knocks)+'</td><td>'+fmt(p.damage,1)+'</td>'+
     '<td>'+fmt(p.defeats)+'</td><td>'+fmt(p.longestKill,1)+'</td></tr>'
    ).join('')+'</tbody></table></div>':
    '<p class="match-empty">No saved players returned an observed kill count for this weapon and category.</p>');
 }
 function metricsForTable(m){
  return ['kills','headshots','knocks','damage','defeats','longestKill']
   .map(key=>'<td title="'+fmt(m[key]?.observed)+' players returned '+key+'">'+
    datum({metrics:m},key)+'<small class="clan-weapon-count">n='+fmt(m[key]?.observed)+'</small></td>')
   .join('');
 }
 async function load(){
  const call=++request,button=$('clan-weapon-load');
  button.disabled=true;
  $('clan-weapon-status').textContent='Reading verified clan weapon cache…';
  try{
   const response=await fetch('/api/public-insights?route=clan-weapons',{
    cache:'no-store',headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('Saved weapon response unavailable');
   const result=await response.json();
   if(call!==request)return;
   if(result.kind!=='clan-weapons'||!Array.isArray(result.weapons))throw Error('Invalid saved data');
   current=result;chosen=null;
   $('clan-weapon-status').textContent=result.note||'Saved clan weapon responses';
   render();
  }catch(error){
   if(call!==request)return;
   $('clan-weapon-status').textContent='Clan weapon records could not be read. Use Load report to retry.';
   current=null;
   $('clan-weapon-rows').innerHTML='';
   $('clan-weapon-leaders').innerHTML='';
   $('clan-weapon-summary').innerHTML='';
   $('clan-weapon-coverage').textContent='Source unavailable; no estimates shown.';
  }finally{if(call===request)button.disabled=false;}
 }
 function download(){
  if(!current)return;
  const source=$('clan-weapon-source').value;
  const visible=sortWeapons(current.weapons,source,$('clan-weapon-sort').value,$('clan-weapon-search').value);
  const blob=new Blob([csvRows(visible,source)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='pubg-clan-weapon-'+source+'.csv';
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
 }
 function init(){
  if(ready||!$('clan-weapon-load'))return;
  ready=true;
  $('clan-weapon-load').addEventListener('click',load);
  $('clan-weapon-export').addEventListener('click',download);
  ['clan-weapon-source','clan-weapon-sort'].forEach(id=>$(id).addEventListener('change',render));
  $('clan-weapon-search').addEventListener('input',render);
  $('clan-weapon-rows').addEventListener('click',event=>{
   const button=event.target.closest?.('[data-clan-weapon]');
   if(!button)return;
   chosen=button.dataset.clanWeapon;render();
  });
 }
 return{init,load,render,sortWeapons,csvRows,csvSafe};
});
