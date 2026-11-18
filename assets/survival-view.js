'use strict';
// Account-wide official Survival Mastery; no guessed or season-specific values.
(function(){
 const $=id=>document.getElementById(id);
 const escape=text=>String(text??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stats=['xp','tier','level','totalMatchesPlayed'];
 const labels={xp:'Survival XP',tier:'Survival Mastery tier',
  level:'Survival Mastery level',totalMatchesPlayed:'Matches counting toward mastery'};
 let seq=0,working=false;
 const number=v=>typeof v==='number'&&Number.isFinite(v)?
  v.toLocaleString('en-GB',{maximumFractionDigits:0}):'—';
 const name=()=>$('survival-name').value.trim();
 const selectedPlatform=()=>{
  const explicit=$('survival-platform')?.value;
  if(['xbox','psn'].includes(explicit))return explicit;
  return window.PubgSelectedPlatform?.(name())||'auto';
 };
 function render(data){
  const values=data?.stats,found=stats.filter(k=>values&&
   typeof values[k]==='number'&&Number.isFinite(values[k]));
  $('survival-data').innerHTML=stats.map(k=>
   '<article class="cc-award"><p class="small muted">'+escape(labels[k])+'</p>'+
    '<strong>'+number(values?.[k])+'</strong></article>').join('');
  $('survival-status').textContent=values?
   'Actual saved PUBG Survival Mastery for '+data.name+
   ' · fetched '+(data.savedAt||'unknown time')+' · '+found.length+
   ' of 4 documented attributes present. Missing fields remain unavailable.':
   (data.note||'No genuine saved Survival Mastery yet. Refresh the player to collect it.');
 }
 async function load(){
  if(!name()){$('survival-status').textContent='Enter a saved console gamertag.';return;}
  const request=++seq,selected=name(),platform=selectedPlatform();
  working=true;$('survival-load').disabled=true;
  $('survival-status').textContent='Reading saved official Survival Mastery…';
  try{
   const params=new URLSearchParams({name:selected,kind:'survival',
     platform});
   const response=await fetch('/api/public-insights?'+params.toString(),{
    cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await response.json();
   if(!response.ok||data.schemaVersion!==1||data.kind!=='survival')
    throw Error(data.error||'Saved Survival Mastery unavailable');
   if(request===seq&&selected===name()&&platform===selectedPlatform())render(data);
  }catch(error){
   if(request!==seq)return;
   $('survival-status').textContent=error.message;
   $('survival-data').innerHTML='';
  }finally{
   if(request===seq){$('survival-load').disabled=false;working=false;}
  }
 }
 async function refresh(){
  const selected=name();
  if(!selected){$('survival-status').textContent='Enter a saved console player.';return;}
  const request=++seq,button=$('survival-refresh'),platform=selectedPlatform();
  button.disabled=true;
  $('survival-status').textContent='Requesting PUBG Survival Mastery with the shared API budget…';
  try{
   const response=await fetch('/api/player-refresh',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:selected,platform,scope:'survival'})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'PUBG refresh unavailable');
   if(request!==seq||selected!==name()||platform!==selectedPlatform())return;
   await load();
  }catch(error){
   if(request===seq)$('survival-status').textContent=error.message+
    '. Existing saved data has not been deleted.';
  }finally{button.disabled=false;}
 }
 function setPlayers(players){
  const list=Array.isArray(players)?players:[];
  $('survival-known').innerHTML=[...new Set(list.map(p=>p.name))].map(name=>
   '<option value="'+escape(name)+'"></option>').join('');
  if(!name()&&list.length)$('survival-name').value=list[0].name;
 }
 function show(){if(name()&&!working)load();}
 $('survival-load').addEventListener('click',load);
 $('survival-refresh').addEventListener('click',refresh);
 $('survival-name').addEventListener('input',function(){
  seq++;if($('survival-platform'))$('survival-platform').value='auto';
 });
 $('survival-platform')?.addEventListener('change',function(){seq++;});
 window.SurvivalView={setPlayers,show};
})();
