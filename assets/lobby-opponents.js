'use strict';
// Source-only scouting from saved PUBG lobby rosters: no spatial replay.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)root.LobbyOpponents=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const $=id=>document.getElementById(id);
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
 const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const fmt=(v,d=0)=>n(v)===null?'—':v.toLocaleString('en-GB',{maximumFractionDigits:d});
 const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?
  new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Unknown date';
 const csvCell=value=>{
  const raw=String(value??'').replace(/[\r\n]/g,' ');
  const safe=/^\s*[=+\-@]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 function csvRows(rows){
  const lines=[['Visible name','Matches observed','Participant appearances',
   'Observed kills','Kills sample count','Observed damage','Damage sample count',
   'Best recorded place','Last recorded match','Same-name collisions'].map(csvCell).join(',')];
  for(const r of rows||[])lines.push([
   r.name,r.matchesObserved,r.participantAppearances,
   r.kills??'',r.killsObserved,r.damage??'',r.damageObserved,
   r.bestPlacement??'',r.latestMatchAt??'',r.nameCollisionMatches
  ].map(csvCell).join(','));
  return lines.join('\r\n')+'\r\n';
 }
 let name=null,matches=[],report=null,request=0,detailRequest=0;
 function matchesChanged(player,rows){
  name=typeof player==='string'&&player.trim()?player:null;
  matches=Array.isArray(rows)?rows.filter(m=>typeof m?.id==='string').slice(0,100):[];
  request++;detailRequest++;report=null;
  if(!$('scout-load'))return;
  $('scout-load').disabled=!name;$('scout-export').disabled=true;
  $('scout-status').textContent=name?
   'Choose Read saved opponents to analyse verified rosters from the archived official PUBG matches.':
   'Choose a saved console player first.';
  $('scout-summary').innerHTML='';
  $('scout-table').innerHTML='';
  $('scout-count').textContent='No opponent groups loaded.';
  $('scout-detail').textContent='Choose a visible name from a loaded opponent table.';
  $('scout-map').innerHTML='<option value="">All saved maps</option>';
  $('scout-mode').innerHTML='<option value="">All saved modes</option>';
  $('scout-search').value='';
 }
 function params(opponent){
  const p=new URLSearchParams({route:'opponents',name,days:$('scout-days').value,
   sort:$('scout-order').value});
  if($('scout-map').value)p.set('map',$('scout-map').value);
  if($('scout-mode').value)p.set('mode',$('scout-mode').value);
  if(opponent)p.set('opponent',opponent);
  return p;
 }
 function options(id,items,placeholder){
  const select=$(id),old=select.value;
  const valid=Array.isArray(items)?items.filter(x=>typeof x==='string'&&x.length<=90):[];
  select.innerHTML='<option value="">'+escape(placeholder)+'</option>'+
   valid.map(x=>'<option value="'+escape(x)+'">'+escape(x)+'</option>').join('');
  select.value=old&&valid.includes(old)?old:'';
 }
 function visibleRows(data,query){
  const q=String(query||'').trim().toLowerCase();
  return (Array.isArray(data?.opponents)?data.opponents:[])
   .filter(r=>!q||String(r.name||'').toLowerCase().includes(q));
 }
 function paint(){
  if(!report)return;
  const rows=visibleRows(report,$('scout-search').value);
  $('scout-count').textContent='Showing '+rows.length+' of '+report.opponentsReturned+
   ' visible name groups · '+report.opponentNames+' distinct labels observed · '+
   report.matchesIncluded+' match(es) within the current filters.';
  $('scout-summary').innerHTML=[
   ['Saved match references',report.savedMatchesScanned],
   ['Full lobbies available',report.fullLobbiesFound],
   ['Roster-verified games',report.lobbyReportsClassified],
   ['Opponent appearances',report.opponentAppearances]
  ].map(([label,value])=>'<div class="scout-kpi"><small>'+escape(label)+
   '</small><strong>'+fmt(value)+'</strong></div>').join('');
  $('scout-table').innerHTML=rows.map(r=>
   '<tr><td><button type="button" class="scout-name" data-scout-name="'+escape(r.name)+
   '">'+escape(r.name)+'</button></td><td>'+fmt(r.matchesObserved)+
   '</td><td>'+fmt(r.participantAppearances)+'</td><td>'+
   fmt(r.kills)+'<small class="scout-samples">n='+fmt(r.killsObserved)+'</small></td><td>'+
   fmt(r.damage,1)+'<small class="scout-samples">n='+fmt(r.damageObserved)+'</small></td><td>'+
   (r.bestPlacement!==null?'#'+fmt(r.bestPlacement):'—')+
   '</td><td>'+escape(date(r.latestMatchAt))+'</td><td>'+
   fmt(r.nameCollisionMatches)+'</td></tr>'
  ).join('')||'<tr><td colspan="8">No genuine recorded opposing roster names match the filters. Try a longer window or another map.</td></tr>';
 }
 async function load(){
  if(!name)return;
  const call=++request,selected=name;
  detailRequest++;report=null;
  $('scout-load').disabled=true;$('scout-export').disabled=true;
  $('scout-status').textContent='Reading previously saved official PUBG lobbies…';
  $('scout-table').innerHTML='';$('scout-summary').innerHTML='';
  $('scout-detail').textContent='Choose an opponent after the report loads.';
  try{
   const response=await fetch('/api/public-matches?'+params().toString(),{
    cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await response.json();
   if(!response.ok||data.schemaVersion!==1||
    data.kind!=='lobby-opponent-scout'||!Array.isArray(data.opponents))
    throw Error(data.error||'Official opponent scouting unavailable');
   if(call!==request||selected!==name)return;
   report=data;
   options('scout-map',data.mapOptions,'All saved maps');
   options('scout-mode',data.modeOptions,'All saved modes');
   $('scout-status').textContent=data.note+' Source: '+data.source+'. '+data.savedMatchesScanned+
    ' saved references checked; '+data.fullLobbiesFound+
    ' complete archived lobbies found. Statistics do not imply direct combat between players.';
   $('scout-export').disabled=!data.opponents.length;
   paint();
  }catch(error){
   if(call!==request)return;
   $('scout-status').textContent='Opponent scouting unavailable: '+error.message;
   $('scout-count').textContent='No saved opponent report available.';
  }finally{if(call===request)$('scout-load').disabled=!name;}
 }
 async function detail(opponent){
  if(!report||!name)return;
  const call=++detailRequest,selected=name,box=$('scout-detail');
  box.textContent='Reading recorded games for '+opponent+'…';
  try{
   const response=await fetch('/api/public-matches?'+params(opponent).toString(),{
    cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await response.json();
   if(!response.ok||data.kind!=='lobby-opponent-detail'||!
    Array.isArray(data.observations))throw Error(data.error||'Saved opponent history unavailable');
   if(call!==detailRequest||selected!==name)return;
   box.innerHTML='<h4>Recorded appearances · '+escape(opponent)+'</h4>'+
    '<p class="small muted">'+fmt(data.observationsReturned)+' of '+
    fmt(data.observationsAvailable)+' saved participant observations shown (maximum 25). '+
    'The rows compare each player’s whole-match totals, NOT head-to-head damage or kills.</p>'+
    '<div class="scroll-table"><table><thead><tr><th>DATE</th><th>MAP / MODE</th>'+
    '<th>OPPONENT PLACE</th><th>OPPONENT KILLS</th><th>OPPONENT DAMAGE</th>'+
    '<th>YOUR SQUAD PLACE</th><th>YOUR KILLS</th><th>YOUR DAMAGE</th>'+
    '</tr></thead><tbody>'+data.observations.map(r=>
     '<tr><td>'+escape(date(r.playedAt))+'</td><td>'+escape(r.map)+
     ' · '+escape(r.mode)+'</td><td>'+fmt(r.opponentPlacement)+
     '</td><td>'+fmt(r.opponentKills)+'</td><td>'+fmt(r.opponentDamage,1)+
     '</td><td>'+fmt(r.playerPlacement)+'</td><td>'+fmt(r.playerKills)+
     '</td><td>'+fmt(r.playerDamage,1)+'</td></tr>'
    ).join('')+'</tbody></table></div>';
  }catch(error){
   if(call===detailRequest)box.textContent='Opponent detail unavailable: '+error.message;
  }
 }
 function download(){
  if(!report)return;
  const blob=new Blob([csvRows(visibleRows(report,$('scout-search').value))],
   {type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  try{
   anchor.href=url;anchor.download='pubg-official-opponents-'+report.windowDays+'d.csv';
   document.body.appendChild(anchor);anchor.click();anchor.remove();
  }finally{URL.revokeObjectURL(url);}
 }
 function init(){
  if(!$('scout-load'))return;
  $('scout-load').addEventListener('click',load);
  $('scout-export').addEventListener('click',download);
  $('scout-search').addEventListener('input',paint);
  for(const id of ['scout-days','scout-map','scout-mode','scout-order'])
   $(id).addEventListener('change',()=>{if(report)void load();});
  $('scout-table').addEventListener('click',event=>{
   const target=event.target.closest?.('[data-scout-name]');
   if(target)void detail(target.dataset.scoutName);
  });
 }
 return{init,matchesChanged,load,paint,visibleRows,csvRows,csvCell};
});
