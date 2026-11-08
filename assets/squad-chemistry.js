'use strict';
// Small, cache-only squad chemistry view. All data originates in archived PUBG
// squad rosters, with no telemetry download, animation or additional API calls.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)root.SquadChemistry=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const $=id=>document.getElementById(id);
  const displayMap=value=>{
    const dictionary=typeof window!=='undefined'?window.PubgReference:null;
    return dictionary?.mapName?dictionary.mapName(value):value;
  };
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
  const number=(n,digits=0)=>valid(n)===null?'—':
    n.toLocaleString('en-GB',{maximumFractionDigits:digits});
  const percent=n=>valid(n)===null?'—':number(n,1)+'%';
  function filter(items,{text='',minGames=1,sort='games'}={}){
    const query=String(text||'').toLowerCase().trim();
    const list=(Array.isArray(items)?items:[]).filter(p=>p&&
      typeof p.name==='string'&&p.name.trim()&&
      valid(p.games)!==null&&p.games>=minGames&&
      (!query||p.name.toLowerCase().includes(query)));
    const key=['games','wins','winRate','top10Rate','kills','damage',
      'pairKillsPerMatch','lastPlayedAt'].includes(sort)?sort:'games';
    return list.slice().sort((a,b)=>{
      if(key==='lastPlayedAt'){
        const x=Date.parse(a.lastPlayedAt)||0,y=Date.parse(b.lastPlayedAt)||0;
        return y-x||b.games-a.games||a.name.localeCompare(b.name);
      }
      const x=valid(a[key]),y=valid(b[key]);
      if(x===null)return y===null?a.name.localeCompare(b.name):1;
      if(y===null)return -1;
      return y-x||b.games-a.games||a.name.localeCompare(b.name);
    });
  }
  function coverage(items){
    const arr=Array.isArray(items)?items:[];
    return{partners:arr.length,repeatPartners:arr.filter(p=>p.games>=2).length,
      pairObservations:arr.reduce((n,p)=>n+(valid(p.pairedObserved)||0),0),
      knownFinishes:arr.reduce((n,p)=>n+(valid(p.knownPlacements)||0),0)};
  }
  const range=items=>(Array.isArray(items)?items:[])
    .filter(r=>r&&typeof r.name==='string'&&valid(r.games)!==null)
    .map(r=>({name:r.name,games:r.games}))
    .sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name)).slice(0,10);
  let source=null,ready=false;
  function render(data){
    source=data||null;
    if(!document.getElementById('teammates-table'))return;
    const items=source?.items||[];
    const selected=$('teammates-partner')?.value||'';
    const choices=items.filter(p=>typeof p.name==='string').map(p=>p.name);
    const select=$('teammates-partner');
    if(select){
      select.innerHTML=choices.map(name=>'<option value="'+escape(name)+'">'+
        escape(name)+'</option>').join('');
      select.value=choices.includes(selected)?selected:choices[0]||'';
    }
    rerender();
  }
  function rerender(){
    if(!source)return;
    const items=filter(source.items,{
      text:$('teammates-search').value,
      minGames:Number($('teammates-min').value)||1,
      sort:$('teammates-sort').value
    });
    const stats=coverage(source.items);
    $('teammates-coverage').textContent=source.archivedMatches+' saved match reports · '+
      stats.partners+' distinct visible teammate names · '+stats.repeatPartners+
      ' recurring partners · '+stats.pairObservations+
      ' pair-kill observations. A visible name is not a verified cross-match account ID.';
    $('teammates-table').innerHTML=items.map(p=>
      '<tr><td><button class="player-button" data-teammate-select="'+escape(p.name)+
      '" type="button">'+escape(p.name)+'</button></td>'+
      '<td>'+number(p.games)+'</td><td>'+number(p.knownPlacements)+'</td>'+
      '<td>'+number(p.wins)+'</td><td>'+percent(p.winRate)+'</td>'+
      '<td>'+percent(p.top10Rate)+'</td>'+
      '<td>'+number(p.kills)+'</td><td>'+number(p.damage,1)+'</td>'+
      '<td>'+number(p.knocks)+'</td><td>'+number(p.myKills)+'</td>'+
      '<td>'+number(p.pairKillsPerMatch,2)+'</td></tr>'
    ).join('')||'<tr><td colspan="11" class="empty">No partners with this search or minimum-game requirement.</td></tr>';
    const bars=range(items),high=Math.max(1,...bars.map(p=>p.games));
    $('teammates-bars').innerHTML=bars.map(p=>
      '<div class="squad-chem-bar"><span>'+escape(p.name)+'</span>'+
      '<div class="squad-chem-track"><div data-width="'+Math.round(p.games/high*100)+'"></div></div>'+
      '<strong>'+number(p.games)+'</strong></div>'
    ).join('')||'<p class="small muted">No saved squad partnerships in this selection.</p>';
    $('teammates-bars').querySelectorAll('[data-width]').forEach(el=>{
      el.style.width=el.dataset.width+'%';
    });
    const selected=$('teammates-partner').value;
    if(!items.some(p=>p.name===selected)){
      $('teammates-partner').value=items[0]?.name||'';
    }
    renderPartner(items.find(p=>p.name===$('teammates-partner').value));
  }
  function renderPartner(p){
    const out=$('teammates-detail');
    if(!p){out.innerHTML='<p class="small muted">Choose a saved partner to inspect map and mode coverage.</p>';return;}
    const rows=(key)=>Array.isArray(p[key])?p[key]:[];
    const groups=label=>rows(label).map(x=>
      '<div class="squad-chem-row"><span>'+escape(label==='maps'?displayMap(x.name):x.name)+'</span><strong>'+
      number(x.games)+' matches</strong></div>').join('')||'<p class="small muted">Not recorded.</p>';
    out.innerHTML='<div class="squad-chem-statrow">'+
      '<div><small>Wins / known finishes</small><strong>'+number(p.wins)+' / '+
        number(p.knownPlacements)+'</strong></div>'+
      '<div><small>Combined kills in both-observed games</small><strong>'+
        number(p.pairedKills)+' · '+number(p.pairedObserved)+' games</strong></div>'+
      '</div>'+
      '<p class="small muted">Paired kills count your kills plus this partner’s kills only in matches where both were recorded. They are not the full squad total or a lifetime statistic.</p>'+
      '<div class="squad-chem-groups"><div><h4>Maps together</h4>'+
      groups('maps')+'</div><div><h4>Modes together</h4>'+
      groups('modes')+'</div></div>';
  }
  function init(){
    if(ready||!$('teammates-table'))return;
    ready=true;
    for(const id of ['teammates-search','teammates-sort','teammates-min']){
      $(id).addEventListener(id==='teammates-search'?'input':'change',rerender);
    }
    $('teammates-partner').addEventListener('change',rerender);
    $('teammates-table').addEventListener('click',e=>{
      const button=e.target.closest?.('[data-teammate-select]');
      if(!button)return;
      $('teammates-partner').value=button.dataset.teammateSelect;
      rerender();
      $('teammates-detail').scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }
  return{filter,coverage,range,number,percent,render,rerender,init};
});
