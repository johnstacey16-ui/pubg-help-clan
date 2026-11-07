'use strict';
// Official saved PUBG match-lobby scoreboard. No upstream request is triggered.
// The full lobby is optional because its cache can expire before the 180-day archive.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)root.MatchLobby=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const $=id=>document.getElementById(id);
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
 const value=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const fmt=(v,digits=0)=>value(v)===null?'—':
  v.toLocaleString('en-GB',{maximumFractionDigits:digits});
 const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?
  new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Unknown date';
 const duration=v=>value(v)===null?'—':
  Math.floor(v/60)+'m '+String(Math.floor(v%60)).padStart(2,'0')+'s';
 const csvCell=value=>{
  const raw=String(value??'').replace(/[\r\n]/g,' ');
  const safe=/^\s*[=+\-@]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 function csvTeams(data){
  const heading=['Squad','Squad place','Player','Self','Player place','Kills','Damage',
   'Knocks','Assists','Headshots','Survived seconds','Death type','Road kills',
   'Longest kill (m)'];
  const lines=[heading.map(csvCell).join(',')];
  for(const team of data?.teams||[])
   for(const p of team.players||[]){
    const cells=[team.displayIndex,team.placement??'',p.name,p.isSelf?'yes':'no',
     p.placement??'',p.kills??'',p.damage??'',p.knocks??'',
     p.assists??'',p.headshots??'',p.timeSurvivedSeconds??'',
     p.deathType??'',p.roadKills??'',p.longestKillMeters??''];
    lines.push(cells.map(csvCell).join(','));
   }
  return lines.join('\r\n')+'\r\n';
 }
 let name=null,matches=[],report=null,request=0;
 function matchesChanged(player,records){
  request++;name=player;matches=Array.isArray(records)?records.filter(m=>
   typeof m?.id==='string'&&/^[0-9a-f-]{36}$/i.test(m.id)).slice(0,100):[];
  report=null;
  if(!$('lobby-match'))return;
  const select=$('lobby-match'),old=select.value;
  select.innerHTML=matches.map(m=>
   '<option value="'+escape(m.id)+'">'+escape(m.map||'Unknown map')+
   ' · '+escape(m.mode||'Unknown mode')+' · '+escape(date(m.playedAt))+
   '</option>').join('');
  select.value=matches.some(m=>m.id===old)?old:matches[0]?.id||'';
  $('lobby-load').disabled=!name||!matches.length;
  $('lobby-export').disabled=true;
  $('lobby-status').textContent=matches.length?
   'Select a saved match and choose Load official lobby. Full-lobby records may be unavailable for older archived games.':
   'No saved match summaries for this player. Select Refresh recent above.';
  $('lobby-summary').innerHTML='';
  $('lobby-team-table').innerHTML='';
  $('lobby-player-table').innerHTML='';
  $('lobby-count').textContent='No full lobby loaded.';
 }
 function sortedTeams(items,order){
  const list=Array.isArray(items)?items.slice():[];
  return list.sort((a,b)=>{
   if(order==='kills'||order==='damage'){
    const left=a[order]?.value,right=b[order]?.value;
    return (value(right)??-1)-(value(left)??-1)||
      (a.placement??999)-(b.placement??999);
   }
   if(order==='players')
    return b.players.length-a.players.length||
      (a.placement??999)-(b.placement??999);
   return (a.placement??999)-(b.placement??999)||
     Number(b.isOwnTeam)-Number(a.isOwnTeam)||
     a.displayIndex-b.displayIndex;
  });
 }
 function visibleRows(data,query,onlyMine,order){
  const q=String(query||'').trim().toLowerCase();
  return sortedTeams(data?.teams,order).filter(t=>!onlyMine||t.isOwnTeam)
   .map(t=>({
    ...t,rosterPlayers:t.players.length,players:t.players.filter(p=>!q||
     p.name.toLowerCase().includes(q))
   })).filter(t=>!q||t.players.length);
 }
 function paint(){
  if(!report)return;
  const order=$('lobby-sort').value,q=$('lobby-search').value,
   mine=$('lobby-team-scope').value==='mine',
   teams=visibleRows(report,q,mine,order);
  const participants=teams.reduce((sum,t)=>sum+t.players.length,0);
  $('lobby-count').textContent='Showing '+teams.length+' squad row(s) and '+
   participants+' player row(s) · saved source has '+report.teamsShown+
   ' squads and '+report.playersShown+' participants. Squad totals use all saved members even when player search narrows the rows.';
  $('lobby-summary').innerHTML=[
   ['Observed participants',report.playersShown],
   ['Recorded squads',report.teamsShown],
   ['Your recorded squad',report.teams.find(t=>t.isOwnTeam)?.placement===null?
    'Place unavailable':'#'+fmt(report.teams.find(t=>t.isOwnTeam)?.placement)],
   ['Duration',duration(report.durationSeconds)]
  ].map(([label,n])=>'<div class="lobby-kpi"><small>'+escape(label)+
   '</small><strong>'+escape(typeof n==='number'?fmt(n):n)+'</strong></div>').join('');
  $('lobby-team-table').innerHTML=teams.map(t=>
   '<tr'+(t.isOwnTeam?' class="lobby-own"':'')+'>'+
   '<td><strong>'+(t.placement!==null?'#'+fmt(t.placement):'—')+'</strong></td>'+
   '<td>'+t.displayIndex+(t.isOwnTeam?' · YOUR SQUAD':'')+
   (t.assignedRoster?'':' · Unassigned')+'</td>'+
   '<td>'+fmt(t.rosterPlayers??t.players.length)+'</td>'+
   '<td>'+fmt(t.kills?.value)+'<small class="lobby-coverage">n='+fmt(t.kills?.observed)+'</small></td>'+
   '<td>'+fmt(t.damage?.value,1)+'<small class="lobby-coverage">n='+fmt(t.damage?.observed)+'</small></td>'+
   '<td>'+fmt(t.knocks?.value)+'<small class="lobby-coverage">n='+fmt(t.knocks?.observed)+'</small></td></tr>'
  ).join('')||'<tr><td colspan="6" class="empty">No saved squads match these filters.</td></tr>';
  const players=teams.flatMap(t=>t.players.map(p=>({p,team:t})));
  if(order==='kills'||order==='damage')players.sort((a,b)=>
   (value(b.p[order])??-1)-(value(a.p[order])??-1));
  $('lobby-player-table').innerHTML=players.map(({p,team})=>
   '<tr'+(p.isSelf?' class="lobby-own"':'')+'>'+
   '<td><strong>'+escape(p.name)+(p.isSelf?' ★ YOU':'')+'</strong></td>'+
   '<td>'+team.displayIndex+'</td>'+
   '<td>'+(p.placement!==null?'#'+fmt(p.placement):'—')+'</td>'+
   '<td>'+fmt(p.kills)+'</td><td>'+fmt(p.knocks)+'</td>'+
   '<td>'+fmt(p.damage,1)+'</td><td>'+fmt(p.headshots)+'</td>'+
   '<td>'+fmt(p.assists)+'</td><td>'+duration(p.timeSurvivedSeconds)+'</td>'+
   '<td>'+escape(p.deathType||'—')+'</td></tr>'
  ).join('')||'<tr><td colspan="10" class="empty">No saved player names match this selection.</td></tr>';
 }
 async function load(){
  if(!name||!$('lobby-match').value)return;
  const call=++request,selectedName=name;
  const button=$('lobby-load');button.disabled=true;
  $('lobby-status').textContent='Reading the stored official PUBG lobby…';
  $('lobby-summary').innerHTML='';
  $('lobby-team-table').innerHTML='';
  $('lobby-player-table').innerHTML='';
  try{
   const params=new URLSearchParams({
    route:'lobby',name:selectedName,match:$('lobby-match').value
   });
   const response=await fetch('/api/public-matches?'+params.toString(),{
    cache:'no-store',headers:{Accept:'application/json'}
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Full lobby unavailable');
   if(result.schemaVersion!==1||result.kind!=='match-lobby'||
    !Array.isArray(result.teams))throw Error('Unexpected saved lobby data');
   if(call!==request||selectedName!==name)return;
   report=result;
   $('lobby-export').disabled=false;
   $('lobby-status').textContent=result.map+' · '+result.mode+' · '+
    date(result.playedAt)+' · saved '+date(result.savedAt)+
    '. '+result.note;
   paint();
  }catch(error){
   if(call!==request)return;
   report=null;
   $('lobby-status').textContent=error.message;
   $('lobby-count').textContent='No verified full-lobby report loaded.';
   $('lobby-export').disabled=true;
  }finally{
   if(call===request)button.disabled=!name||!matches.length;
  }
 }
 function download(){
  if(!report)return;
  const blob=new Blob([csvTeams(report)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  try{
   a.href=url;a.download='pubg-saved-match-lobby-'+report.matchId.slice(0,8)+'.csv';
   document.body.appendChild(a);a.click();a.remove();
  }finally{URL.revokeObjectURL(url);}
 }
 function init(){
  if(!$('lobby-match'))return;
  $('lobby-load').addEventListener('click',load);
  $('lobby-export').addEventListener('click',download);
  ['lobby-sort','lobby-search','lobby-team-scope'].forEach(id=>
   $(id).addEventListener(id==='lobby-search'?'input':'change',paint));
  $('lobby-match').addEventListener('change',()=>{
   request++;report=null;$('lobby-export').disabled=true;
   $('lobby-count').textContent='Choose Load official lobby to read this saved game.';
   $('lobby-summary').innerHTML='';
   $('lobby-team-table').innerHTML='';$('lobby-player-table').innerHTML='';
  });
  $('match-results').addEventListener('click',e=>{
   const target=e.target.closest?.('[data-lobby-match]');
   if(!target||!matches.some(m=>m.id===target.dataset.lobbyMatch))return;
   $('lobby-match').value=target.dataset.lobbyMatch;
   $('lobby-match').dispatchEvent(new Event('change'));
   $('lobby-panel').scrollIntoView({behavior:'smooth',block:'start'});
  });
 }
 return{init,matchesChanged,load,paint,sortedTeams,visibleRows,csvTeams,csvCell};
});
