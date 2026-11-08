'use strict';
(function () {
  var data = null;
  var extraPlayers = [];
  var rosterPage=1;
  var FAVOURITES_KEY='pubg-clan-roster-favourites-v1';
  function favouriteKey(name) { return String(name||'').trim().toLowerCase(); }
  function readRosterFavourites() {
    try {
      var saved=JSON.parse(window.localStorage?.getItem(FAVOURITES_KEY)||'[]');
      return new Set(Array.isArray(saved)?saved.filter(function(x){
        return typeof x==='string'&&x.length>0&&x.length<=100;
      }).slice(0,250).map(favouriteKey):[]);
    }catch(error){return new Set();}
  }
  var rosterFavourites=readRosterFavourites();
  function toggleRosterFavourite(name) {
    if(!data || !data.roster.entries.some(function(r){
      return favouriteKey(r.name)===favouriteKey(name);
    }))return;
    var key=favouriteKey(name);
    if(rosterFavourites.has(key))rosterFavourites.delete(key);
    else if(rosterFavourites.size<250)rosterFavourites.add(key);
    try {window.localStorage?.setItem(FAVOURITES_KEY,JSON.stringify([...rosterFavourites]));}
    catch(error){} // Private browsing and disabled storage still work for this session.
    renderRoster();
  }
  var current = 'overview';
  var compareA = null;
  var compareB = null;
  var matchName = null;
  var matchRequest = 0;
  var seasonName=null;
  var seasonRequest=0;
  var seasonHistory=null;
  var seasonBoard=null;
  var seasonBoardRequest=0;
  var insightNames={weapons:null,teammates:null};
  var insightRequests={weapons:0,teammates:0};
  var insightCache={weapons:null,teammates:null};
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v) { return Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-GB') : '—'; };
  var dec = function (v) { return v === null || v === undefined ? '—' : Number(v).toFixed(2); };
  var escapeHtml = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); };
  var modeName = function (s) { return String(s).replace('-fpp',' FPP').toUpperCase(); };
  var dateText = function (s) { return s ? new Date(s).toLocaleString('en-GB', {dateStyle:'medium',timeStyle:'short'}) : 'Not available'; };
  var visiblePlayers = function () {
    var combined=[...(data?.players||[])];
    for(const p of extraPlayers) {
      var i=combined.findIndex(x=>x.name.toLowerCase()===p.name.toLowerCase());
      if(i>=0)combined[i]=p;else combined.push(p);
    }
    return combined;
  };
  var findPlayer = function (name) {
    return visiblePlayers().find(p=>p.name.toLowerCase()===String(name).toLowerCase())||null;
  };
  async function lookupAnyPlayer(refresh,nameValue,platformValue,openAfter) {
    var name=String(nameValue||$('console-gamertag').value).trim();
    var platform=platformValue||$('console-platform').value;
    var result=$('console-search-result');
    if(!name||name.length>100||name.includes(',')||!['auto','xbox','psn'].includes(platform)){
      result.textContent='Enter one valid PUBG gamertag. Auto-detect is recommended.';
      return false;
    }
    $('console-gamertag').value=name;
    $('console-platform').value=platform;
    $('console-search').disabled=true;
    $('console-refresh').disabled=true;
    result.textContent=refresh?'Checking the shared PUBG API request budget…':'Searching saved PUBG statistics…';
    try {
      var url='/api/player-lookup';
      var response=await fetch(refresh?url:url+'?name='+encodeURIComponent(name)+'&platform='+platform,
        refresh?{
          method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({name,platform})
        }:{cache:'no-store',headers:{Accept:'application/json'}});
      var payload=await response.json();
      if(!response.ok) {
        result.textContent=(payload.error||'Unable to retrieve player')+
          (payload.retryAfterSeconds?' Try again in about '+payload.retryAfterSeconds+' seconds.':'')+
          (payload.suggestedPlatform?' Change the console selector to '+(payload.suggestedPlatform==='xbox'?'Xbox':'PlayStation')+'.':'');
        if(payload.code==='platform_ambiguous')
          result.textContent+=' Both consoles returned a matching name, so please select Xbox or PlayStation before refreshing again.';
        return false;
      }
      if(!payload.found){
        result.innerHTML='<strong>'+escapeHtml(name)+'</strong> — no saved account yet. '+
          (platform==='auto'?'Use Refresh from PUBG to identify Xbox or PlayStation automatically.':
            'Use Refresh from PUBG to look for this name on '+(platform==='xbox'?'Xbox':'PlayStation')+'.');
        return false;
      }
      var p=payload.player;
      // Remember the one actual console returned by the saved or live lookup.
      if(['xbox','psn'].includes(p.platform))$('console-platform').value=p.platform;
      extraPlayers=extraPlayers.filter(x=>!(x.name.toLowerCase()===p.name.toLowerCase()));
      extraPlayers.push(p);
      if(data){
        renderCompare();chooseMatchPlayer(matchName);chooseInsightPlayers();chooseSeasonPlayer();
        window.FullPubgStats?.setPlayers(visiblePlayers());
      }
      result.innerHTML='<div class="lookup-top"><strong>'+escapeHtml(p.name)+
        ' · '+(p.platform==='xbox'?'Xbox':'PlayStation')+'</strong><span class="badge '+
        (payload.isClanMember?'verified':'')+'">'+
        (payload.isClanMember?'Official clan':'Other console player')+'</span></div>'+
        '<div class="lookup-stats"><span><strong>'+fmt(p.kills)+'</strong> kills</span>'+
        '<span><strong>'+fmt(p.wins)+'</strong> wins</span>'+
        '<span><strong>'+fmt(p.matches)+'</strong> matches</span></div>'+
        '<p class="small muted">Saved PUBG update: '+escapeHtml(dateText(p.updatedAt))+
        (payload.refreshState?' · '+escapeHtml(payload.refreshState):'')+'</p>'+
        '<button type="button" class="secondary" data-profile="'+escapeHtml(p.name)+'">Open full player profile →</button>';
      if(openAfter)openProfile(p.name,true);
      if(refresh&&payload.refreshState==='refreshed')reload();
      return true;
    }catch(error){
      result.textContent='Saved PUBG statistics are temporarily unavailable. Please try again.';
      return false;
    }finally{
      $('console-search').disabled=false;
      $('console-refresh').disabled=false;
    }
  }

  function go(page, preserveHash) {
    if (['overview','leaderboard','players','modes','full-stats','matches','weapons','season','teammates','compare','awards','analysis','data-tools','help','survival','sources','global','health','roadmap'].indexOf(page) === -1) return;
    current = page;
    document.querySelectorAll('.page').forEach(function (el) { el.hidden = el.id !== 'page-' + page; });
    document.querySelectorAll('[data-page]').forEach(function (el) {
      el.classList.toggle('active', el.dataset.page === page);
      if (el.dataset.page === page) el.setAttribute('aria-current','page');
      else el.removeAttribute('aria-current');
    });
    $('crumb').textContent = {overview:'Overview',leaderboard:'Leaderboards',players:'Player roster',modes:'Game modes','full-stats':'Complete player stats',compare:'Compare',matches:'Match intelligence',weapons:'Weapon mastery',season:'Season & ranked',teammates:'Teammate insights',awards:'Clan awards',analysis:'Deep analysis','data-tools':'Data workbench',help:'Analytics guide',survival:'Survival mastery',sources:'PUBG data library',global:'Official regional ranks',health:'Data health',roadmap:'Roadmap'}[page];
    // The dashboard is lazy-loaded inside the shared HELP toolkit. It can
    // finish booting after a user has already returned to another tool.
    // Never hijack a toolkit tool URL or its scroll position in that case.
    var clanPanel=document.getElementById('panel-clan');
    var isActiveClan=!clanPanel||typeof clanPanel.classList?.contains!=='function'||
      clanPanel.classList.contains('active');
    try {
      if(!preserveHash&&isActiveClan)
        history.replaceState(null,'',page==='overview'?'/dashboard/':'/dashboard/#'+page);
    } catch (e) {}
    if(isActiveClan)window.scrollTo(0,0);
    if(page==='matches'){
      if(data)loadCachedMatches();
      window.ClanMatchBoard?.load();
      window.ClanActivityPulse?.load();
    }
    if(page==='full-stats')window.FullPubgStats?.show();
    if(page==='awards')window.ClanRecordBook?.load();
    if((page==='weapons'||page==='teammates')&&data)loadInsight(page);
    if(page==='season'&&data){loadSeason();loadSeasonLeaderboard();}
    if(data&&window.CommandCentre?.render)window.CommandCentre.render(page,data);
    if(page==='sources'&&window.SourceExplorer?.show)window.SourceExplorer.show();
    if(page==='survival'&&data&&window.SurvivalView?.show)window.SurvivalView.show();
    if(page==='health'&&window.CacheHealth?.show)window.CacheHealth.show();
  }
  function chart(target, totals, modes) {
    var max = Math.max.apply(null, [1].concat(modes.map(function (m) { return totals[m] ? totals[m].kills : 0; })));
    var host=$(target);
    host.innerHTML = modes.map(function (m) {
      var v = totals[m] ? totals[m].kills : 0;
      var h = Math.max(2, Math.round(v / max * 135));
      return '<div class="bar-wrap" title="' + escapeHtml(modeName(m)) + ' · ' + fmt(v) + ' kills">' +
        '<span class="bar-value">' + fmt(v) + '</span>' +
        '<span class="bar-actual" data-height="' + h + '"></span>' +
        '<span class="bar-label">' + escapeHtml(modeName(m)) + '</span></div>';
    }).join('');
    // CSSOM writes work under our strict CSP; HTML style attributes do not.
    if(host.querySelectorAll)host.querySelectorAll('.bar-actual[data-height]').forEach(function(el){
      el.style.height=el.dataset.height+'px';
    });
  }
  function playerLink(p) {
    return '<button class="player-button" type="button" data-profile="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</button>';
  }
  function renderOverview() {
    $('kills').textContent = fmt(data.totals.kills);
    $('wins').textContent = fmt(data.totals.wins);
    $('matches').textContent = fmt(data.totals.matches);
    $('verified').textContent = data.roster.verified + ' / ' + data.roster.total;
    var pct = data.roster.total ? Math.round(100 * data.roster.verified / data.roster.total) : 0;
    $('verified-caption').textContent = pct + '% of the official roster';
    $('snapshot').textContent = 'Latest saved player update · ' + dateText(data.lastSync);
    $('roster-percent').textContent = pct + '%';
    $('roster-fraction').textContent = data.roster.verified + ' / ' + data.roster.total + ' players';
    $('roster-progress').style.width = pct + '%';
    $('roster-status').textContent = (data.roster.states.pending || 0) + ' pending · ' +
      (data.roster.states.ambiguous || 0) + ' ambiguous · ' + (data.roster.states.not_found || 0) + ' not found';
    $('xbox-count').textContent = fmt(data.platforms.xbox);
    $('ps-count').textContent = fmt(data.platforms.psn);
    chart('overview-chart', data.modeTotals, data.modeOrder);
    $('top-five').innerHTML = data.players.slice(0,5).map(function (p,i) {
      return '<div class="leader-row"><span class="rank">' + String(i+1).padStart(2,'0') + '</span>' +
        '<div class="leader-player"><strong>' + playerLink(p) + '</strong><small>' +
        (p.platform === 'xbox' ? 'Xbox' : 'PlayStation') + ' · ' + fmt(p.wins) + ' wins</small></div>' +
        '<div class="leader-kills">' + fmt(p.kills) + '<small>KILLS</small></div></div>';
    }).join('') || '<p class="empty">No verified clan players yet.</p>';
  }
  function rankingMetric(p,key) {
    if(Object.hasOwn(p,key))return p[key];
    return p.advanced ? p.advanced[key] : null;
  }
  function statValue(value,decimal) {
    return value===null||value===undefined?'—':(decimal?Number(value).toFixed(2):fmt(value));
  }
  function renderLeaderboard() {
    if (!data) return;
    var platform = $('leader-console').value;
    var key = $('sort').value;
    var players = data.players.filter(function (p) { return platform === 'all' || platform === p.platform; });
    players.sort(function (a,b) {
      var av=rankingMetric(a,key),bv=rankingMetric(b,key);
      return Number(bv==null?-1:bv)-Number(av==null?-1:av)||b.kills-a.kills;
    });
    $('leader-stat-label').textContent=($('sort').options?.[$('sort').selectedIndex]?.textContent||key).toUpperCase();
    $('ranking-table').innerHTML = players.map(function (p,i) {
      return '<tr><td><strong>' + String(i+1).padStart(2,'0') + '</strong></td><td>' + playerLink(p) +
        ' <span class="badge">' + (p.platform==='xbox'?'Xbox':'PS') + '</span></td>' +
        '<td><strong>' + fmt(p.kills) + '</strong></td><td>' + fmt(p.wins) + '</td><td>' + fmt(p.matches) +
        '</td><td>' + dec(p.kd) + '</td><td>' + (p.winRate==null?'—':dec(p.winRate)+'%') +
        '</td><td><strong class="mint">' + statValue(rankingMetric(p,key),key==='kd'||key==='winRate'||key==='longestKill') + '</strong></td></tr>';
    }).join('') || '<tr><td class="empty" colspan="8">No players for this filter.</td></tr>';
  }
  function renderRoster() {
    if (!data) return;
    var q=$('search').value.trim().toLowerCase(),platform=$('player-console').value;
    var status=$('player-status').value,sort=$('roster-sort').value;
    var favOnly=$('roster-favs-only').checked;
    var byName=new Map(data.players.map(function(p){return [p.name.toLowerCase(),p];}));
    var roster=data.roster.entries.filter(function(p){
      return (!q||p.name.toLowerCase().includes(q)) &&
        (platform==='all'||(platform==='unknown'?!p.platform:p.platform===platform)) &&
        (status==='all'||(status==='verified'?p.verified:p.status===status)) &&
        (!favOnly||rosterFavourites.has(favouriteKey(p.name)));
    });
    roster.sort(function(a,b){
      if(sort==='favourites'){
        var favour=Number(rosterFavourites.has(favouriteKey(b.name)))-
          Number(rosterFavourites.has(favouriteKey(a.name)));
        if(favour)return favour;
      }
      if(sort==='kills'||sort==='wins'){
        var diff=(byName.get(b.name.toLowerCase())?.[sort]??-1)-
          (byName.get(a.name.toLowerCase())?.[sort]??-1);
        if(diff)return diff;
      }
      return a.name.localeCompare(b.name);
    });
    var size=Number($('roster-page-size').value)||20;
    if(![10,20,50,100].includes(size))size=20;
    var pages=Math.max(1,Math.ceil(roster.length/size));
    rosterPage=Math.max(1,Math.min(rosterPage,pages));
    var first=(rosterPage-1)*size;
    var shown=roster.slice(first,first+size);
    var totalFavourites=data.roster.entries.filter(function(p){
      return rosterFavourites.has(favouriteKey(p.name));
    }).length;
    $('roster-count').textContent=(roster.length?
      'Showing '+(first+1)+'–'+(first+shown.length)+' of '+roster.length+' matching members':
      'No matching members')+
      ' · '+data.roster.total+' official members · '+totalFavourites+' favourites on this device';
    $('roster-page-label').textContent='Page '+rosterPage+' of '+pages;
    $('roster-prev').disabled=rosterPage<=1;
    $('roster-next').disabled=rosterPage>=pages;
    $('roster-table').innerHTML=shown.map(function(r){
      var p=byName.get(r.name.toLowerCase()),st=r.verified?'verified':r.status;
      var fav=rosterFavourites.has(favouriteKey(r.name));
      var label={verified:'✓ Verified',pending:'⏳ Pending',
        ambiguous:'? Ambiguous',not_found:'! Not found'}[st]||st;
      return '<tr><td><button type="button" class="favourite-toggle'+(fav?' is-favourite':'')+
        '" data-favourite="'+escapeHtml(r.name)+'" aria-pressed="'+fav+
        '" aria-label="'+(fav?'Remove favourite: ':'Save favourite: ')+escapeHtml(r.name)+
        '" title="'+(fav?'Remove favourite':'Save favourite')+'">'+(fav?'★':'☆')+'</button> '+
        (p?playerLink(p):'<strong>'+escapeHtml(r.name)+'</strong>')+
        '</td><td>'+(r.platform==='xbox'?'Xbox':r.platform==='psn'?'PlayStation':'—')+
        '</td><td><span class="badge '+escapeHtml(st)+'">'+escapeHtml(label)+'</span></td>'+
        '<td>'+(p?fmt(p.kills):'—')+'</td><td>'+(p?fmt(p.wins):'—')+
        '</td><td>'+(p?fmt(p.matches):'—')+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="empty">No players match the chosen filters.</td></tr>';
  }
  function renderModes() {
    if (!data) return;
    chart('modes-chart', data.modeTotals, data.modeOrder);
    $('modes-table').innerHTML = data.modeOrder.map(function (m) {
      var s = data.modeTotals[m], rate = s.matches ? (s.kills/s.matches).toFixed(2) : '—';
      return '<tr><td><strong>' + escapeHtml(modeName(m)) + '</strong></td><td>' + fmt(s.matches) +
        '</td><td><strong>' + fmt(s.kills) + '</strong></td><td>' + fmt(s.wins) +
        '</td><td>' + rate + '</td><td>' + fmt(s.damage) + '</td><td>' + fmt(s.assists) + '</td></tr>';
    }).join('');
  }

  function chooseMatchPlayer(preferred) {
    if(!data)return;
    var names=visiblePlayers().map(function(p){return p.name;});
    if(preferred && names.indexOf(preferred)!==-1)matchName=preferred;
    if(names.indexOf(matchName)===-1)matchName=names[0]||null;
    $('match-player').innerHTML=names.map(function(name){
      return '<option value="'+escapeHtml(name)+'"'+(name===matchName?' selected':'')+'>'+escapeHtml(name)+'</option>';
    }).join('');
    $('match-player').disabled=!matchName;
    $('match-reload').disabled=!matchName;
    if(current==='matches')loadCachedMatches();
  }
  async function loadCachedMatches() {
    if(!matchName)return;
    var request=++matchRequest,name=matchName;
    $('match-note').textContent='Reading saved console match data for '+name+'…';
    $('match-results').innerHTML='';
    window.MatchLab?.reset();
    window.MatchLobby?.matchesChanged(name,[]);
    window.LobbyOpponents?.matchesChanged(name,[]);
    window.PersonalRivalries?.setPlayer(name);
    if(window.TelemetryView?.matchesChanged)window.TelemetryView.matchesChanged(name,[]);
    try{
      var response=await fetch('/api/public-matches?name='+encodeURIComponent(name),{
        cache:'no-store',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Match API HTTP '+response.status);
      var result=await response.json();
      if(request!==matchRequest || matchName!==name)return;
      if(result.schemaVersion!==1||!Array.isArray(result.matches))throw Error('Unexpected match schema');
      if(window.TelemetryView?.matchesChanged)window.TelemetryView.matchesChanged(name,result.matches);
      window.MatchLab?.render(result);
      window.MatchLobby?.matchesChanged(name,result.matches);
      window.LobbyOpponents?.matchesChanged(name,result.matches);
      $('match-note').textContent=(result.note||'Saved PUBG matches only')+
        ' · '+result.availableCount+' detailed match(es) stored'+
        (result.archivedCount?' · '+result.archivedCount+' archived':'');
    }catch(error){
      if(request!==matchRequest)return;
      $('match-note').textContent='Saved match data is temporarily unavailable.';
      $('match-results').innerHTML='<p class="match-empty">The website could not read saved match records. Try Reload saved matches.</p>';
    }
  }
  function compareValue(p,key,mode) {
    var raw=mode==='all'?null:p.modes?.[mode];
    if(mode!=='all' && !raw)return null;
    if(key==='kills')return mode==='all'?p.kills:raw.kills??null;
    if(key==='wins')return mode==='all'?p.wins:raw.wins??null;
    if(key==='matches')return mode==='all'?p.matches:raw.roundsPlayed??null;
    if(key==='kd'||key==='winRate'){
      if(mode==='all')return p[key];
      var rounds=raw.roundsPlayed||0;
      return rounds?Number((key==='kd'?(raw.kills||0)/rounds:
        (raw.wins||0)*100/rounds).toFixed(2)):null;
    }
    var fields={damage:'damageDealt',headshots:'headshotKills',
      assists:'assists',knocks:'dBNOs',revives:'revives',
      top10:'top10s',longestKill:'longestKill'};
    return mode==='all'?(p.advanced?.[key]??null):(raw[fields[key]]??null);
  }

  function chooseInsightPlayers(preferredKind,preferredName) {
    if(!data)return;
    var names=visiblePlayers().map(function(p){return p.name;});
    for(const kind of ['weapons','teammates']){
      if(preferredKind===kind&&names.includes(preferredName))insightNames[kind]=preferredName;
      if(!names.includes(insightNames[kind]))insightNames[kind]=names[0]||null;
      var picker=$(kind+'-player');
      picker.innerHTML=names.map(function(name){
        return '<option value="'+escapeHtml(name)+'"'+(name===insightNames[kind]?' selected':'')+'>'+escapeHtml(name)+'</option>';
      }).join('');
      picker.value=insightNames[kind]||'';
      picker.disabled=!insightNames[kind];
      $(kind+'-reload').disabled=!insightNames[kind];
    }
  }
  function displayedStat(obj,key) {
    var value=obj?.[key];
    return value===null||value===undefined?'—':fmt(value);
  }
  function renderWeaponInsights() {
    if(window.WeaponExplorer?.render)window.WeaponExplorer.render(insightCache.weapons);
  }

  function renderTeammateInsights() {
    window.SquadChemistry?.render(insightCache.teammates);
  }

  async function loadInsight(kind) {
    var name=insightNames[kind];
    if(!name)return;
    var request=++insightRequests[kind];
    if(kind==='weapons'){insightCache.weapons=null;renderWeaponInsights();}
    $(kind+'-note').textContent='Reading saved '+(kind==='weapons'?'weapon mastery':'squad')+' data for '+name+'…';
    try{
      var response=await fetch('/api/public-insights?kind='+kind+'&name='+encodeURIComponent(name),{
        cache:'no-store',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Insight API HTTP '+response.status);
      var result=await response.json();
      if(request!==insightRequests[kind]||insightNames[kind]!==name)return;
      if(result.schemaVersion!==1||result.kind!==kind||!Array.isArray(result.items))throw Error('Unexpected response');
      insightCache[kind]=result;
      $(kind+'-note').textContent=result.note+' · '+fmt(result.count)+' '+
        (kind==='weapons'?'weapon records':'distinct partners')+
        (kind==='weapons'&&result.savedAt?' · Saved '+dateText(result.savedAt):'');
      if(kind==='weapons')renderWeaponInsights();
      else renderTeammateInsights();
    }catch(error){
      if(request!==insightRequests[kind])return;
      $(kind+'-note').textContent='Saved insights temporarily unavailable. Existing clan statistics are unaffected.';
    }
  }

  function chooseSeasonPlayer(preferred) {
    if(!data)return;
    var names=visiblePlayers().map(function(p){return p.name;});
    if(preferred&&names.includes(preferred))seasonName=preferred;
    if(!names.includes(seasonName))seasonName=names[0]||null;
    $('season-player').innerHTML=names.map(function(name){
      return '<option value="'+escapeHtml(name)+'"'+
        (name===seasonName?' selected':'')+'>'+escapeHtml(name)+'</option>';
    }).join('');
    $('season-player').value=seasonName||'';
    $('season-player').disabled=!seasonName;
    $('season-reload').disabled=!seasonName;
    $('season-refresh').disabled=!seasonName;
  }
  function seasonNumber(value) {
    return value===undefined||value===null?'—':fmt(value);
  }

  function renderSeasonHistory() {
    var source=seasonHistory;
    var seasons=source?.archivedSeasons||[];
    var select=$('season-history-season');
    var previous=select.value;
    select.innerHTML=seasons.map(function(id){
      return '<option value="'+escapeHtml(id)+'">'+escapeHtml(id)+'</option>';
    }).join('');
    var selected=seasons.includes(previous)?previous:
      (seasons.includes(source?.seasonId)?source.seasonId:seasons[0]);
    select.value=selected||'';
    select.disabled=!seasons.length;
    var mode=$('season-history-mode').value||'squad';
    var kind=source?.type;
    var key=kind==='ranked'?'rankPoints':'kills';
    var label=kind==='ranked'?'Rank points':'Season kills';
    var history=(Array.isArray(source?.history)?source.history:[])
      .filter(function(p){
        return p.seasonId===selected&&p.mode===mode&&
          p[key]!==null&&p[key]!==undefined&&Number.isFinite(Number(p[key]))&&
          Number.isFinite(Date.parse(p.capturedAt));
      }).slice().sort(function(a,b){return Date.parse(a.capturedAt)-Date.parse(b.capturedAt);});
    var note=$('season-history-note'),plot=$('season-history-chart');
    var summary=$('season-history-summary');
    summary.innerHTML='';
    if(!history.length) {
      note.textContent='No genuine '+label.toLowerCase()+' observations have been saved for this season and mode.';
      plot.innerHTML='<p class="match-empty">Use Refresh from PUBG to begin collecting real progression snapshots.</p>';
      return;
    }
    var first=history[0],last=history[history.length-1],count=history.length;
    note.textContent=count+' real observation'+(count===1?'':'s')+' for '+modeName(mode)+
      ' · '+label+' · '+dateText(first.capturedAt)+' to '+dateText(last.capturedAt);
    summary.innerHTML='<div class="history-number"><strong>'+seasonNumber(last[key])+
      '</strong><small>Latest '+escapeHtml(label)+'</small></div>'+
      '<div class="history-number"><strong>'+fmt(count)+
      '</strong><small>Actual observations</small></div>'+
      (count>1?'<div class="history-number"><strong>'+
        (last[key]-first[key]>=0?'+':'')+fmt(last[key]-first[key])+
        '</strong><small>Change since first observation</small></div>':'');
    if(count<2) {
      plot.innerHTML='<p class="match-empty">Only one real PUBG observation exists for this mode and season. A historical trend needs a second actual refresh.</p>';
      return;
    }
    var values=history.map(function(p){return Number(p[key]);});
    var min=Math.min.apply(null,values),max=Math.max.apply(null,values);
    var range=max-min||1;
    var t0=Date.parse(first.capturedAt),t1=Date.parse(last.capturedAt);
    var timeRange=t1-t0;
    var coords=history.map(function(p,i){
      var elapsed=Date.parse(p.capturedAt)-t0;
      var x=50+620*(timeRange>0?elapsed/timeRange:i/(count-1));
      var y=192-145*(Number(p[key])-min)/range;
      return{x:x,y:y};
    });
    var path=coords.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
    var dots=coords.map(function(p){
      return '<circle class="trend-dot" cx="'+p.x.toFixed(1)+
        '" cy="'+p.y.toFixed(1)+'" r="4"/>';
    }).join('');
    plot.innerHTML='<svg viewBox="0 0 720 246" role="img" aria-label="'+
      escapeHtml(label)+' from '+escapeHtml(dateText(first.capturedAt))+
      ' to '+escapeHtml(dateText(last.capturedAt))+'">'+
      '<line class="trend-grid" x1="50" y1="47" x2="670" y2="47"/>'+
      '<line class="trend-grid" x1="50" y1="192" x2="670" y2="192"/>'+
      '<text class="trend-label" x="8" y="51">'+escapeHtml(fmt(max))+'</text>'+
      '<text class="trend-label" x="8" y="196">'+escapeHtml(fmt(min))+'</text>'+
      '<polyline class="trend-line" points="'+path+'"/>'+dots+
      '<text class="trend-label" x="50" y="223">'+escapeHtml(dateText(first.capturedAt))+'</text>'+
      '<text class="trend-label" x="670" y="223" text-anchor="end">'+
      escapeHtml(dateText(last.capturedAt))+'</text></svg>';
  }

  function renderSeasonLeaderboard() {
    var source=seasonBoard;
    var seasons=Array.isArray(source?.seasons)?source.seasons:[];
    var selector=$('season-board-season');
    var previous=selector.value;
    selector.innerHTML=seasons.map(function(id){
      return '<option value="'+escapeHtml(id)+'">'+escapeHtml(id)+'</option>';
    }).join('');
    var chosen=seasons.includes(previous)?previous:seasons[0];
    selector.value=chosen||'';
    selector.disabled=!seasons.length;
    var kind=$('season-board-type').value;
    var metric=$('season-board-metric').value;
    var labels={rankPoints:'Rank points',kills:'Kills',wins:'Wins',
      matches:'Matches',damage:'Damage'};
    $('season-board-metric-label').textContent=(labels[metric]||metric).toUpperCase();
    var all=(Array.isArray(source?.entries)?source.entries:[])
      .filter(function(r){return r.seasonId===chosen;});
    var ranked=all.filter(function(r){
      return r[metric]!==null&&r[metric]!==undefined&&
        Number.isFinite(Number(r[metric]));
    }).sort(function(a,b){
      return Number(b[metric])-Number(a[metric])||
        a.name.localeCompare(b.name);
    });
    $('season-board-note').textContent=seasons.length?
      ranked.length+' verified clan player'+(ranked.length===1?'':'s')+
      ' with observed '+(labels[metric]||metric).toLowerCase()+
      ' · '+(all.length-ranked.length)+' missing that metric · '+
      'latest real observation per player, not a synchronized snapshot':
      'No saved '+kind+' observations for this game mode yet. Refresh individual players from PUBG to populate genuine results.';
    $('season-board-table').innerHTML=ranked.map(function(r,i){
      return '<tr><td>'+(i+1)+'</td><td><strong>'+escapeHtml(r.name)+
        '</strong></td><td>'+(r.platform==='xbox'?'Xbox':'PlayStation')+
        '</td><td><strong class="mint">'+seasonNumber(r[metric])+
        '</strong></td><td>'+(kind==='ranked'?
          escapeHtml([r.tier,r.subTier].filter(Boolean).join(' ')||'—'):'—')+
        '</td><td>'+escapeHtml(dateText(r.capturedAt))+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="empty">No actual PUBG observations for this selection.</td></tr>';
  }

  async function loadSeasonLeaderboard() {
    var kind=$('season-board-type').value,mode=$('season-board-mode').value;
    var request=++seasonBoardRequest;
    $('season-board-note').textContent='Reading stored '+kind+' leaderboard…';
    $('season-board-table').innerHTML='';
    try{
      var response=await fetch('/api/public-season-leaderboard?type='+
        encodeURIComponent(kind)+'&mode='+encodeURIComponent(mode),{
        cache:'no-store',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Leaderboard HTTP '+response.status);
      var payload=await response.json();
      if(request!==seasonBoardRequest||
        kind!==$('season-board-type').value||mode!==$('season-board-mode').value)return;
      if(payload.schemaVersion!==1||payload.type!==kind||payload.mode!==mode||
        !Array.isArray(payload.seasons)||!Array.isArray(payload.entries))
        throw Error('Unexpected leaderboard response');
      seasonBoard=payload;
      renderSeasonLeaderboard();
    }catch(error){
      if(request!==seasonBoardRequest)return;
      seasonBoard=null;
      $('season-board-table').innerHTML='';
      $('season-board-note').textContent='Saved clan leaderboards are temporarily unavailable.';
    }
  }

  async function loadSeason() {
    var name=seasonName;
    if(!name)return;
    var type=$('season-type').value,request=++seasonRequest;
    $('season-note').textContent='Reading saved '+type+' data for '+name+'…';
    $('season-results').innerHTML='';
    seasonHistory=null;
    $('season-history-chart').innerHTML='';
    $('season-history-summary').innerHTML='';
    $('season-history-note').textContent='Reading stored PUBG season observations…';
    try{
      var result=await fetch('/api/public-season?name='+encodeURIComponent(name)+
        '&type='+encodeURIComponent(type),{cache:'no-store',headers:{Accept:'application/json'}});
      if(!result.ok)throw Error('HTTP '+result.status);
      var payload=await result.json();
      if(request!==seasonRequest||seasonName!==name||type!==$('season-type').value)return;
      $('season-note').textContent=(payload.note||'Saved PUBG season data')+
        (payload.seasonId?' · '+payload.seasonId:'')+
        (payload.savedAt?' · Saved '+dateText(payload.savedAt):'');
      seasonHistory=payload;
      renderSeasonHistory();
      var modes=Array.isArray(payload.modes)?payload.modes:[];
      if(!modes.length){
        $('season-results').innerHTML='<p class="match-empty">No current '+type+
          ' statistics are saved for this player yet. Select Refresh from PUBG.</p>';
        return;
      }
      $('season-results').innerHTML=modes.map(function(row){
        var s=row.stats||{};
        var fields=type==='ranked'?
          [['Matches','roundsPlayed'],['Kills','kills'],['Wins','wins'],
           ['Rank points','currentRankPoint'],['Damage','damageDealt'],['Assists','assists']]:
          [['Matches','roundsPlayed'],['Kills','kills'],['Wins','wins'],
           ['Damage','damageDealt'],['Headshot kills','headshotKills'],['Assists','assists']];
        var tier=type==='ranked'&&s.currentTier?
          '<p class="season-tier">'+escapeHtml(s.currentTier.tier||'Unranked')+' '+
            escapeHtml(s.currentTier.subTier||'')+'</p>':'';
        return '<article class="season-mode-card"><h3>'+escapeHtml(modeName(row.mode))+
          '</h3>'+tier+'<div class="season-mode-stats">'+
          fields.map(function(f){
            return '<div><small>'+escapeHtml(f[0])+'</small><strong>'+
              seasonNumber(s[f[1]])+'</strong></div>';
          }).join('')+'</div></article>';
      }).join('');
    }catch(error){
      if(request!==seasonRequest)return;
      $('season-note').textContent='Saved season statistics are temporarily unavailable.';
      $('season-history-note').textContent='Saved season history temporarily unavailable.';
      $('season-results').innerHTML='';
      $('season-history-chart').innerHTML='';
    }
  }
  async function refreshFromPubg(scope,name,statusId) {
    if(!name)return false;
    var player=findPlayer(name);
    var target=$(statusId);
    var platform=player?.platform||'auto';
    target.textContent='Requesting '+scope+' from PUBG within the shared API budget…';
    var refreshButton=scope==='weapons'?'weapons-refresh':
      scope==='matches'?'match-refresh':'season-refresh';
    $(refreshButton).disabled=true;
    try{
      var response=await fetch('/api/player-refresh',{
        method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({name,platform,scope})
      });
      var result=await response.json();
      if(!response.ok){
        target.textContent=(result.error||'PUBG refresh unavailable')+
          (result.retryAfterSeconds?' Try again in about '+result.retryAfterSeconds+' seconds.':'')+
          (result.suggestedPlatform?' The saved console is '+result.suggestedPlatform+'.':'');
        return false;
      }
      target.textContent=(result.note||'Saved PUBG data updated')+
        (scope==='matches'?' · '+(result.savedDetails||0)+' match details saved':'');
      if(scope==='weapons')await loadInsight('weapons');
      else if(scope==='matches')await loadCachedMatches();
      else {await loadSeason();if(current==='season')await loadSeasonLeaderboard();}
      return true;
    }catch(error){
      target.textContent='PUBG refresh temporarily unavailable; existing saved statistics are unchanged.';
      return false;
    }finally{
      $(refreshButton).disabled=false;
    }
  }
  function renderCompare() {
    if(!data)return;
    var names=visiblePlayers().map(function(p){return p.name;});
    if(!names.length){$('compare-output').textContent='No verified clan players yet.';return;}
    if(!names.includes(compareA))compareA=names[0];
    if(!names.includes(compareB))compareB=names[Math.min(1,names.length-1)];
    [['compare-one',compareA],['compare-two',compareB]].forEach(function(pair){
      $(pair[0]).innerHTML=names.map(function(n){
        return '<option value="'+escapeHtml(n)+'"'+(n===pair[1]?' selected':'')+'>'+escapeHtml(n)+'</option>';
      }).join('');
    });
    var a=findPlayer(compareA),b=findPlayer(compareB),mode=$('compare-mode').value;
    var rows=[
      ['Kills','kills'],['Wins','wins'],['Matches','matches'],
      ['Kills per match','kd'],['Win rate (%)','winRate'],
      ['Damage dealt','damage'],['Headshots','headshots'],['Assists','assists'],
      ['Knockdowns','knocks'],['Revives','revives'],['Top 10 finishes','top10'],
      ['Longest kill (m)','longestKill']
    ];
    $('compare-output').innerHTML=
      '<div class="compare-grid"><strong>'+escapeHtml(a.name)+'</strong><span>VS</span><strong>'+escapeHtml(b.name)+'</strong></div>'+
      rows.map(function(row){
        var av=compareValue(a,row[1],mode),bv=compareValue(b,row[1],mode);
        var decimal=['kd','winRate','longestKill'].includes(row[1]);
        return '<div class="compare-grid"><strong class="'+(av!=null&&bv!=null&&av>bv?'winner':'')+'">'+
          statValue(av,decimal)+'</strong><span>'+escapeHtml(row[0])+'</span><strong class="'+
          (av!=null&&bv!=null&&bv>av?'winner':'')+'">'+statValue(bv,decimal)+'</strong></div>';
      }).join('')+
      '<p class="small muted">Only saved PUBG mode data is compared. Unavailable values show —; longest kill uses the maximum distance, not a total.</p>';
    if(window.CommandCentre?.radar)window.CommandCentre.radar('compare-radar',a,b,mode,data.players);
  }

  var profileRequest = 0;
  function makeHistoryChart(points, metric) {
    var w=620,h=205,left=44,right=14,top=16,bottom=31;
    var values=points.map(function(p){return Math.max(0,Number(p[metric])||0);});
    var lo=Math.min.apply(null,values),hi=Math.max.apply(null,values);
    var span=Math.max(1,hi-lo),usableW=w-left-right,usableH=h-top-bottom;
    var mapped=values.map(function(n,i){
      return {x:left+(points.length===1?usableW/2:i*usableW/(points.length-1)),
        y:top+(hi-n)*usableH/span};
    });
    var route=mapped.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
    var circles=mapped.filter(function(p,i){return i===0||i===mapped.length-1||mapped.length<=12;})
      .map(function(p){return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3.7" fill="#39e4c3"/>';}).join('');
    return '<svg viewBox="0 0 620 205" role="img" aria-label="Verified lifetime '+escapeHtml(metric)+' history chart">'+
      '<line x1="'+left+'" y1="'+(h-bottom)+'" x2="'+(w-right)+'" y2="'+(h-bottom)+'" stroke="#43556d" stroke-width="1"/>'+
      '<line x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+(h-bottom)+'" stroke="#43556d" stroke-width="1"/>'+
      '<text x="5" y="'+(top+5)+'" fill="#a1b5d1" font-size="12">'+fmt(hi)+'</text>'+
      '<text x="5" y="'+(h-bottom)+'" fill="#a1b5d1" font-size="12">'+fmt(lo)+'</text>'+
      '<polyline fill="none" stroke="#39e4c3" stroke-linejoin="round" stroke-linecap="round" stroke-width="3" points="'+route+'"/>'+
      circles+'</svg>';
  }
  async function loadProfileHistory(name) {
    var id=++profileRequest,element=$('profile-history');
    if(!element)return;
    element.textContent='Loading actual saved PUBG snapshots…';
    try {
      var response=await fetch('/api/player-history?name='+encodeURIComponent(name),{headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('History API returned HTTP '+response.status);
      var result=await response.json();
      if(id!==profileRequest || $('profile-name').textContent!==name)return;
      var points=Array.isArray(result.points)?result.points:[];
      if(points.length<2) {
        element.innerHTML='<p class="history-empty">📈 Only the first verified snapshot is saved so far. The chart will grow as the bot refreshes this player from PUBG.</p>'+
          (points[0]?'<p class="small muted">Baseline saved: '+escapeHtml(dateText(points[0].date))+'</p>':'');
        $('history-metric').disabled=true;
        return;
      }
      $('history-metric').disabled=false;
      function paint() {
        var key=$('history-metric').value,first=Number(points[0][key])||0,last=Number(points[points.length-1][key])||0;
        element.innerHTML='<div class="history-meta"><strong>'+fmt(last-first)+' '+escapeHtml(key)+' change</strong><span>'+
          points.length+' verified daily points · '+escapeHtml(dateText(points[0].date))+' to '+escapeHtml(dateText(points[points.length-1].date))+'</span></div>'+
          '<div class="history-chart">'+makeHistoryChart(points,key)+'</div>'+
          '<p class="small muted">Recorded lifetime totals, not per-match performance. A point is added only after a PUBG update.</p>';
      }
      $('history-metric').addEventListener('change',paint);
      paint();
    } catch(error) {
      if(id===profileRequest && element) element.textContent='Saved history is temporarily unavailable. Lifetime statistics above are unaffected.';
    }
  }

  function openProfile(name, fromLink) {
    var p=findPlayer(name);if(!p)return;
    $('profile-name').textContent=p.name;
    $('profile-console').textContent=p.platform==='xbox'?'Xbox':'PlayStation';
    $('profile-body').innerHTML = '<div class="profile-stats">' +
      [['KILLS',p.kills],['WINS',p.wins],['MATCHES',p.matches]].map(function (r) {
        return '<div class="profile-stat"><small>'+r[0]+'</small><strong>'+fmt(r[1])+'</strong></div>';
      }).join('') + '</div><p><span class="badge verified">' + dec(p.kd) + ' kills/match</span> <span class="badge">' +
      dec(p.winRate) + '% win rate</span></p><h3>Lifetime game mode details</h3>' +
      (data.modeOrder.map(function (m) {
        var s=p.modes[m];
        if(!s||!s.roundsPlayed)return'';
        return '<div class="profile-mode"><strong>'+escapeHtml(modeName(m))+'</strong><span>'+fmt(s.roundsPlayed)+
          ' matches · '+fmt(s.kills)+' kills · '+fmt(s.wins)+' wins</span></div>';
      }).join('') || '<p class="muted">No mode details saved yet.</p>') +
      '<div class="profile-insight-actions"><button class="secondary" type="button" data-match-player="'+escapeHtml(p.name)+'">⚑ Matches</button>'+
      '<button class="secondary" type="button" data-insight-page="weapons" data-insight-name="'+escapeHtml(p.name)+'">⌖ Weapons</button>'+
      '<button class="secondary" type="button" data-insight-page="teammates" data-insight-name="'+escapeHtml(p.name)+'">♟ Teammates</button>'+
      '<button class="secondary" type="button" data-insight-page="season" data-insight-name="'+escapeHtml(p.name)+'">🏆 Season</button>'+ 
       '<button class="secondary" type="button" data-full-stats="'+escapeHtml(p.name)+'">▦ All statistics</button></div>'+
      '<h3>Advanced lifetime statistics</h3><div class="advanced-stats">'+
      [['Damage',p.advanced?.damage],['Headshots',p.advanced?.headshots],['Assists',p.advanced?.assists],
       ['Knockdowns',p.advanced?.knocks],['Revives',p.advanced?.revives],['Top 10',p.advanced?.top10],
       ['Longest kill (m)',p.advanced?.longestKill],['Heals',p.advanced?.heals],
       ['Boosts',p.advanced?.boosts]].map(function(item){
         return '<div><small>'+escapeHtml(item[0])+'</small><strong>'+statValue(item[1],item[0]==='Longest kill (m)')+'</strong></div>';
       }).join('')+'</div>'+
      '<p class="small muted">Last saved player update: '+escapeHtml(dateText(p.updatedAt))+'. Upstream PUBG refresh is managed through the Discord dashboard.</p>'+
      '<div class="profile-history"><div class="profile-history-header"><h3>📈 Actual lifetime progress</h3><label>Metric <select id="history-metric">'+
      '<option value="kills">Kills</option><option value="wins">Wins</option><option value="matches">Matches</option></select></label></div>'+
      '<div id="profile-history" aria-live="polite">Loading history…</div></div>';
    if(!fromLink) history.pushState(null,'','/dashboard/#player/'+p.platform+'/'+encodeURIComponent(p.name));
    if(typeof $('profile').showModal==='function') {
      if(!$('profile').open)$('profile').showModal();
    } else $('profile').setAttribute('open','');
    loadProfileHistory(p.name);
  }
  async function reload() {
    $('reload').disabled=true;
    $('notice').hidden=false;
    $('notice').textContent='Loading real saved PUBG statistics from Supabase…';
    try {
      var r=await fetch('/api/public-stats',{cache:'no-store',headers:{Accept:'application/json'}});
      if(!r.ok)throw Error('Data API returned HTTP '+r.status);
      var result=await r.json();
      if(!result || result.schemaVersion!==1 || !Array.isArray(result.players))throw Error('Unsupported response');
      data=result;
      renderOverview();renderLeaderboard();renderRoster();renderModes();renderCompare();chooseMatchPlayer(matchName);
      chooseInsightPlayers();chooseSeasonPlayer();
      if(current==='weapons'||current==='teammates')loadInsight(current);
      if(current==='season'){loadSeason();loadSeasonLeaderboard();}
      window.FullPubgStats?.setPlayers(visiblePlayers());
       if(window.CommandCentre?.render)window.CommandCentre.render(current,data);
      if(window.SourceExplorer?.setPlayers)window.SourceExplorer.setPlayers(data.players);
      if(window.SurvivalView?.setPlayers)window.SurvivalView.setPlayers(data.players);
      if(current==='survival'&&window.SurvivalView?.show)window.SurvivalView.show();
      $('notice').hidden=true;
    } catch(error) {
      $('notice').textContent='Could not load saved statistics: '+error.message+'. The existing Discord bot is unaffected.';
    } finally { $('reload').disabled=false; }
  }
  document.querySelectorAll('[data-page]').forEach(function (b) { b.addEventListener('click',function () {go(b.dataset.page);}); });
  document.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click',function () {go(b.dataset.go);}); });
  document.addEventListener('click',function (e) {
    var favourite=e.target.closest&&e.target.closest('[data-favourite]');
    if(favourite)toggleRosterFavourite(favourite.dataset.favourite);
    var b=e.target.closest&&e.target.closest('[data-profile]');
    if(b)openProfile(b.dataset.profile);
    var fullStats=e.target.closest&&e.target.closest('[data-full-stats]');
    if(fullStats){window.FullPubgStats?.select(fullStats.dataset.fullStats);
      if($('profile').open)$('profile').close();go('full-stats');}
    var match=e.target.closest&&e.target.closest('[data-match-player]');
    if(match) {
      chooseMatchPlayer(match.dataset.matchPlayer);
      if($('profile').open)$('profile').close();
      go('matches');
    }
    var insight=e.target.closest&&e.target.closest('[data-insight-page]');
    if(insight){
      var kind=insight.dataset.insightPage;
      if(kind==='weapons'||kind==='teammates'||kind==='season'){
        if(kind==='season')chooseSeasonPlayer(insight.dataset.insightName);
        else chooseInsightPlayers(kind,insight.dataset.insightName);
        if($('profile').open)$('profile').close();
        go(kind);
      }
    }
  });
  $('profile-close').addEventListener('click',function () { $('profile').close(); });
  $('profile').addEventListener('close',function(){
    profileRequest++;
    if(location.hash.startsWith('#player/')) history.replaceState(null,'',current==='overview'?'/dashboard/':'/dashboard/#'+current);
  });
  $('share-profile').addEventListener('click',async function(){
    var name=$('profile-name').textContent;
    var player=findPlayer(name);
    var url=location.origin+'/dashboard/#player/'+(player?.platform||'xbox')+'/'+encodeURIComponent(name);
    try {
      if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      this.textContent='✓ Link copied';
    } catch (error) {
      window.prompt('Copy this player profile link:',url);
    }
  });
  $('profile').addEventListener('click',function(e) {if(e.target===$('profile'))$('profile').close();});
  ['sort','leader-console'].forEach(function (id) {$(id).addEventListener('change',renderLeaderboard);});
  ['player-console','player-status','roster-sort','roster-page-size','roster-favs-only']
    .forEach(function(id){$(id).addEventListener('change',function(){
      rosterPage=1;renderRoster();
    });});
  $('search').addEventListener('input',function(){rosterPage=1;renderRoster();});
  $('roster-prev').addEventListener('click',function(){rosterPage--;renderRoster();});
  $('roster-next').addEventListener('click',function(){rosterPage++;renderRoster();});
  $('compare-one').addEventListener('change',function(e){compareA=e.target.value;renderCompare();});
  $('compare-two').addEventListener('change',function(e){compareB=e.target.value;renderCompare();});
  $('compare-mode').addEventListener('change',renderCompare);
  $('reload').addEventListener('click',reload);
  $('console-player-form').addEventListener('submit',function(e){
    if(e?.preventDefault)e.preventDefault();
    lookupAnyPlayer(false);
  });
  $('console-refresh').addEventListener('click',function(){lookupAnyPlayer(true);});
  // A different name starts a fresh discovery; users can still override the console.
  $('console-gamertag').addEventListener('input',function(){
    $('console-platform').value='auto';
  });
  $('match-player').addEventListener('change',function(e){matchName=e.target.value;loadCachedMatches();});
  $('match-reload').addEventListener('click',loadCachedMatches);
  window.MatchLab?.init();
  window.MatchLobby?.init();
  window.LobbyOpponents?.init();
  window.SquadChemistry?.init();
  window.ClanRecordBook?.init();
  window.ClanActivityPulse?.init();
  window.ClanMatchBoard?.init();
  $('match-refresh').addEventListener('click',function(){
    refreshFromPubg('matches',matchName,'match-note');
  });
  $('weapons-refresh').addEventListener('click',function(){
    refreshFromPubg('weapons',insightNames.weapons,'weapons-note');
  });
  $('season-player').addEventListener('change',function(e){seasonName=e.target.value;loadSeason();});
  $('season-type').addEventListener('change',loadSeason);
  $('season-reload').addEventListener('click',loadSeason);
  ['season-board-type','season-board-mode'].forEach(function(id){
    $(id).addEventListener('change',function(){
      if(id==='season-board-type'){
        $('season-board-metric').value=$('season-board-type').value==='ranked'?'rankPoints':'kills';
      }
      $('season-board-season').value='';
      loadSeasonLeaderboard();
    });
  });
  ['season-board-season','season-board-metric'].forEach(function(id){
    $(id).addEventListener('change',renderSeasonLeaderboard);
  });
  $('season-board-reload').addEventListener('click',loadSeasonLeaderboard);
  $('season-history-season').addEventListener('change',renderSeasonHistory);
  $('season-history-mode').addEventListener('change',renderSeasonHistory);
  $('season-refresh').addEventListener('click',function(){
    refreshFromPubg($('season-type').value,seasonName,'season-note');
  });
  for(const kind of ['weapons','teammates']){
    $(kind+'-player').addEventListener('change',function(e){
      insightNames[kind]=e.target.value;loadInsight(kind);
    });
    $(kind+'-reload').addEventListener('click',function(){loadInsight(kind);});
  }
  $('weapon-category').addEventListener('change',renderWeaponInsights);
  $('weapon-sort').addEventListener('change',renderWeaponInsights);
  $('weapon-search').addEventListener('input',renderWeaponInsights);
  window.WeaponExplorer?.init();
  window.ClanWeaponBoard?.init();
  var hash=location.hash.slice(1);
  var sharedName=null,sharedPlatform=null;
  if(hash.startsWith('player/')){
    try {
      var path=hash.slice(7),slash=path.indexOf('/');
      if(slash>=0 && ['xbox','psn'].includes(path.slice(0,slash))){
        sharedPlatform=path.slice(0,slash);
        sharedName=decodeURIComponent(path.slice(slash+1));
      } else sharedName=decodeURIComponent(path);
    }catch(error){}
  }
  go(sharedName?'overview':(['overview','leaderboard','players','modes','full-stats','matches','weapons','season','teammates','compare','awards','analysis','data-tools','help','survival','sources','global','health','roadmap'].includes(hash)?hash:'overview'),Boolean(sharedName));
  reload().then(async function(){
    if(!sharedName)return;
    if(findPlayer(sharedName) && (!sharedPlatform||findPlayer(sharedName).platform===sharedPlatform)){
      openProfile(sharedName,true);
    } else {
      await lookupAnyPlayer(false,sharedName,sharedPlatform||'auto',true);
    }
  });
})();