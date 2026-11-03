'use strict';
// Geekify visual player: local VS Code webview. Never sends private tokens to a server.
const vscode=require('vscode');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {join}=require('node:path');
const {homedir}=require('node:os');
const {randomBytes}=require('node:crypto');
const {startPanelBridge}=require('./bridge.cjs');

const DEMO={id:'geekify-demo',title:'Midnight Frequency',artist:'geekify sessions',
  durationMs:136000,album:'unreleased transmissions',uri:null};
const DEMO_LYRICS=[
  {timeMs:0,text:'another signal lost'},
  {timeMs:22000,text:'in the frequency'},
  {timeMs:60000,text:'maybe tomorrow'},
  {timeMs:88000,text:"we'll be quieter"},
  {timeMs:112000,text:'the city keeps glowing'}
];
const allowedActions=new Set(['toggle','next','previous','seek','save','shuffle','repeat',
  'playItem','playPlaylist','openResult','togglePin','openPlaylistInSpotify','lyricsSize','planTrack','movePlanned','removePlanned','submitPlan','management','transfer','search','daily','recent','library','libraryFolder','libraryBack','playlist','retryPlaylist','devices','queue','openWeb','refresh']);
const safeError=e=>String(e?.message||e).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,175);

let activePanel;
function writeStatus(phase,detail=''){
  try{
    const dir=join(homedir(),'.geekify');
    mkdirSync(dir,{recursive:true,mode:0o700});
    writeFileSync(join(dir,'extension-status.json'),JSON.stringify({
      version:'0.4.8',phase,detail:detail.slice(0,180),updatedAt:Date.now()
    }),{encoding:'utf8',mode:0o600});
  }catch{}
}
function acknowledgeUriRequest(requestId){
  if(!/^[a-f0-9]{32}$/.test(requestId||''))return;
  const dir=join(homedir(),'.geekify');
  mkdirSync(dir,{recursive:true,mode:0o700});
  writeFileSync(join(dir,'panel-open-'+requestId+'.json'),JSON.stringify({
    requestId,opened:true,updatedAt:Date.now()
  }),{encoding:'utf8',mode:0o600});
}
function assetUrls(webview,extensionUri){
  const manifest=JSON.parse(readFileSync(join(extensionUri.fsPath,'assets','geekify','manifest.json'),'utf8'));
  const result={};
  for(const item of manifest.assets){
    result[item.id]=webview.asWebviewUri(vscode.Uri.joinPath(extensionUri,...item.file.split('/'))).toString();
  }
  return result;
}
function getHtml(webview,extensionUri){
  const nonce=randomBytes(18).toString('hex');
  const assets=JSON.stringify(assetUrls(webview,extensionUri)).replace(/</g,'\\u003c');
  const css=webview.asWebviewUri(vscode.Uri.joinPath(extensionUri,'vscode','panel.css'));
  const js=webview.asWebviewUri(vscode.Uri.joinPath(extensionUri,'vscode','panel.js'));
  return readFileSync(join(extensionUri.fsPath,'vscode','panel.html'),'utf8')
    .replaceAll('__CSP_SOURCE__',webview.cspSource)
    .replaceAll('__NONCE__',nonce)
    .replaceAll('__CSS_URI__',css.toString())
    .replaceAll('__JS_URI__',js.toString())
    .replace('__ASSETS_JSON__',assets);
}
async function openPanel(context,forceDemo=false){
  if(activePanel){
    activePanel.panel.reveal(vscode.ViewColumn.One);
    if(forceDemo)activePanel.enableDemo();
    return;
  }
  // Resolve dependencies BEFORE creating a panel, to avoid a blank editor on startup errors.
  const [auth,spotify,lyricModule]=await Promise.all([
    import('../cli/auth.mjs'),import('../cli/spotify.mjs'),import('../src/lyrics.js')
  ]);
  const panel=vscode.window.createWebviewPanel('geekify.player','geekify.',
    vscode.ViewColumn.One,{
      enableScripts:true,retainContextWhenHidden:true,
      localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'assets','geekify','ui'),
        vscode.Uri.joinPath(context.extensionUri,'vscode')]
    });
  const api=new spotify.SpotifyApi();
  let closed=false,pollTimer,lyricAbort,polling=false,trackKey='',pollAgain=false;
  let demo=forceDemo||!auth.isConnected();
  let track=demo?DEMO:null,playing=demo,progressMs=demo?75000:0;
  let lyrics=demo?DEMO_LYRICS:[],lyricsStatus=demo?'synced':'missing';
  let playback=null,repeat='off',shuffle=false,deviceName='',deviceRestricted=false;
  let controlBusy=false,lastControlAt=0;
  let queue=[],items=[],browseType='',playlist=null,notice='',browseError='',browseLoading=false,playlistRowsReceived=0,planned=[];
  let browseRequestId=0;
  const settingsPath=join(homedir(),'.geekify','settings.json');
  function readSettings(){
    try{const data=JSON.parse(readFileSync(settingsPath,'utf8'));
      return {lyricSize:Number.isInteger(data.lyricSize)?Math.max(18,Math.min(46,data.lyricSize)):28,
        pinned:Array.isArray(data.pinned)?data.pinned.filter(x=>x&&/^[A-Za-z0-9]+$/.test(x.id)&&typeof x.title==='string').slice(0,40):[]};
    }catch{return {lyricSize:28,pinned:[]};}
  }
  let localSettings=readSettings();
  function saveSettings(){mkdirSync(join(homedir(),'.geekify'),{recursive:true,mode:0o700});
    writeFileSync(settingsPath,JSON.stringify(localSettings,null,2),{encoding:'utf8',mode:0o600});
  }
  function send(message){if(!closed)void panel.webview.postMessage(message);}
  function emit(){
    const scopes=String(auth.loadConfig().token?.scope||'').split(/\s+/);
    send({type:'state',demo,track,playing,progressMs,lyrics,lyricsStatus,
      queue,planned,items,browseType,browseError,browseLoading,playlistRowsReceived,lyricSize:localSettings.lyricSize,pinned:localSettings.pinned,
      playlistName:playlist?.name||'',
      playlistImageUrl:playlist?.imageUrl||'',notice,repeat,shuffle,
      deviceName,deviceRestricted,deviceId:playback?.device?.id||'',
      canStream:!demo&&scopes.includes('streaming')});
  }
  const state={panel,enableDemo(){
    demo=true;track=DEMO;playing=true;progressMs=75000;
    lyrics=DEMO_LYRICS;lyricsStatus='synced';notice='Demo mode; no Spotify audio.';
    emit();
  }};
  try{
    panel.webview.html=getHtml(panel.webview,context.extensionUri);
  }catch(error){
    panel.dispose();
    throw error;
  }
  activePanel=state;
  async function loadLyrics(next){
    lyricAbort?.abort();lyrics=[];lyricsStatus='missing';
    const controller=new AbortController();lyricAbort=controller;
    if(!next?.title)return;
    try{
      const response=await lyricModule.lookupLyrics(next,controller.signal);
      if(controller.signal.aborted||closed)return;
      lyricsStatus=response.status;
      if(response.status==='synced')lyrics=response.lines;
      else if(response.status==='plain')lyrics=response.plain.map((text,i)=>({timeMs:0,text}));
      emit();
    }catch(error){
      if(!controller.signal.aborted){notice='Lyrics unavailable';emit();}
    }
  }
  async function poll(){
    if(closed||demo||polling)return;
    polling=true;
    let nextDelay=2500;
    try{
      const state=await api.playback();
      if(closed||demo)return;
      playback=state;playing=Boolean(state?.is_playing);
      deviceName=String(state?.device?.name||'No active device').slice(0,80);
      deviceRestricted=Boolean(state?.device?.is_restricted);
      progressMs=state?.progress_ms||0;repeat=state?.repeat_state||'off';
      shuffle=Boolean(state?.shuffle_state);
      track=spotify.trackInfo(state?.item);
      const key=track?.uri||'';
      if(key!==trackKey){
        trackKey=key;
        lyricAbort?.abort();lyrics=[];lyricsStatus='missing';
        if(track)void loadLyrics(track);
      }
      notice='';
      emit();
    }catch(error){
      notice=safeError(error);nextDelay=Math.max(5000,(error.retryAfter||5)*1000);
      emit();
    }finally{
      polling=false;
      if(!closed&&!demo){
        pollTimer=setTimeout(poll,pollAgain?100:nextDelay);
        pollAgain=false;
      }
    }
  }
  function device(){return playback?.device?.id||undefined;}
  async function browse(type,query){
    const requestId=++browseRequestId;
    browseError='';browseLoading=false;
    if(type==='playlist')playlistRowsReceived=0;
    if(demo){notice='Log in with geekify login to browse Spotify.';emit();return;}
    let response;
    if(type==='search'||type==='daily'){
      const q=type==='daily'||!String(query||'').trim()?'Daily Mix':String(query||'').trim().slice(0,100);
      const result=await api.search(q);
      response=[];
      for(const [key,kind] of [['tracks','track'],['albums','album'],['artists','artist'],['playlists','playlist'],['shows','show'],['episodes','episode']]){
        if(type==='daily'&&kind!=='playlist')continue;
        for(const entry of result?.[key]?.items||[])if(entry)response.push({...entry,_kind:kind});
      }
    }
    else if(type==='recent')response=(await api.recent())?.items?.map(row=>row.track).filter(Boolean)||[];
    else if(type==='library'){
      playlist=null;
      browseType='library';
      items=[
        ...localSettings.pinned.map(x=>({type:'playlist',id:x.id,title:x.title,name:x.title,
          subtitle:'Pinned playlist',imageUrl:x.imageUrl||'',uri:'spotify:playlist:'+x.id})),
        {type:'folder',id:'liked',title:'Liked Songs',subtitle:'Your saved tracks'},
        {type:'folder',id:'playlists',title:'Playlists',subtitle:'Your Spotify playlists'}
      ];
      emit();return;
    }
    else if(type==='library-liked')response=(await api.saved())?.items?.map(x=>x.track).filter(Boolean)||[];
    else if(type==='library-playlists'){
      browseType=type;items=[];browseLoading=true;emit();
      try{
        response=await api.allPlaylists(10,page=>{
          if(requestId!==browseRequestId)return;
          items=page.map(item=>({
            type:'playlist',id:item.id,title:item.name||'Untitled playlist',
            subtitle:(item.items?.total??item.tracks?.total??'Unknown number of')+' tracks',
            name:item.name||'Untitled playlist',uri:item.uri||'spotify:playlist:'+item.id,
            imageUrl:item.images?.[0]?.url||''
          }));
          emit();
        });
      }catch(error){
        if(requestId!==browseRequestId)return;
        browseError=safeError(error);
        const partial=Array.isArray(error.partialItems)?error.partialItems:[];
        // Keep successful pages rather than replacing them with an empty screen.
        if(partial.length&&items.length===0)
          items=partial.map(item=>({type:'playlist',id:item.id,title:item.name||'Untitled playlist',
            subtitle:(item.items?.total??item.tracks?.total??'Unknown number of')+' tracks',
            name:item.name||'Untitled playlist',uri:item.uri||'spotify:playlist:'+item.id,
            imageUrl:item.images?.[0]?.url||''}));
        browseLoading=false;emit();return;
      }
      if(requestId!==browseRequestId)return;
      browseLoading=false;
    }
    else if(type==='playlist'){
      try{
        const payload=await api.allPlaylistItems(playlist.id);
        playlistRowsReceived=payload.items.length;
        response=spotify.playlistTrackItems(payload);
        if(playlistRowsReceived&&!response.length)
          browseError='Spotify entry structure: '+spotify.playlistEntryShape(payload)+' (source: '+(payload.source||'unknown')+')';
      }catch(error){
        if(requestId!==browseRequestId)return;
        browseError=safeError(error);
        playlistRowsReceived=(error.partialItems||[]).length;
        response=spotify.playlistTrackItems({items:error.partialItems||[]});
      }
    }
    else if(type==='devices')response=(await api.devices())?.devices||[];
    else if(type==='management'||type==='queue'){
      queue=(await api.queue())?.queue?.slice(0,5).map(spotify.trackInfo).filter(Boolean)||[];
      browseType='management';emit();return;
    }
    // A slower previous request must never replace a newer Library view.
    if(requestId!==browseRequestId)return;
    browseType=type;
    items=response.map(item=>{
      if(type==='devices')return {type:'device',id:item.id,title:item.name,subtitle:(item.is_active?'Active':'Available')+(item.is_restricted?' · Restricted':'')};
      if(item._kind&&item._kind!=='track')return {type:item._kind,id:item.id,uri:item.uri,title:item.name||'Untitled',
        subtitle:item._kind==='album'?(item.artists||[]).map(x=>x.name).join(', '):item._kind.toUpperCase(),
        imageUrl:item.images?.[0]?.url||item.album?.images?.[0]?.url||''};
      if(type==='library-playlists')return {type:'playlist',id:item.id,title:item.name,
        subtitle:(item.items?.total??item.tracks?.total??0)+' tracks',name:item.name,
        imageUrl:item.images?.[0]?.url||''};
      const t=spotify.trackInfo(item);
      if(!t)return null;
      return {type:'track',id:t.id,uri:t.uri,title:t.title,subtitle:t.artist,
        imageUrl:t.imageUrl||''};
    }).filter(Boolean);
    emit();
  }
  async function act(message){
    if(!allowedActions.has(message.name))return;
    const name=message.name;
    if(name==='openWeb'){
      await vscode.env.openExternal(vscode.Uri.parse('https://open.spotify.com/'));return;
    }
    if(name==='refresh'){
      if(demo)emit();else{
        clearTimeout(pollTimer);
        if(polling)pollAgain=true;
        else await poll();
      }
      return;
    }
    if(name==='lyricsSize'){
      const size=Number(message.size);
      if(Number.isFinite(size))localSettings.lyricSize=Math.max(18,Math.min(46,Math.round(size)));
      saveSettings();emit();return;
    }
    if(name==='openPlaylistInSpotify'){
      if(playlist?.id&&/^[A-Za-z0-9]+$/.test(playlist.id))
        await vscode.env.openExternal(vscode.Uri.parse('https://open.spotify.com/playlist/'+playlist.id));
      return;
    }
    if(name==='togglePin'){
      if(typeof message.id!=='string'||!/^[A-Za-z0-9]+$/.test(message.id))return;
      const found=items.find(x=>x.type==='playlist'&&x.id===message.id)||localSettings.pinned.find(x=>x.id===message.id);
      if(!found)return;
      const existing=localSettings.pinned.findIndex(x=>x.id===message.id);
      if(existing>=0)localSettings.pinned.splice(existing,1);
      else if(localSettings.pinned.length<40)localSettings.pinned.push({id:found.id,title:found.title||found.name,
        imageUrl:found.imageUrl||''});
      saveSettings();
      if(browseType==='library')await browse('library');else emit();return;
    }
    if(name==='libraryFolder'){
      if(message.id==='liked'||message.id==='playlists')await browse('library-'+message.id);
      return;
    }
    if(name==='libraryBack'){
      if(browseType==='playlist')await browse('library-playlists');
      else await browse('library');
      return;
    }
    if(name==='search'||name==='daily'||name==='recent'||name==='library'||name==='devices'||name==='queue'||name==='management'){
      await browse(name,message.query);return;
    }
    if(name==='retryPlaylist'){
      if(playlist)await browse('playlist');
      return;
    }
    if(name==='playlist'){
      const selected=items.find(x=>x.type==='playlist'&&x.id===message.id);
      if(selected){playlist=selected;await browse('playlist');}return;
    }
    if(name==='playPlaylist'){
      if(!playlist?.id||!/^[A-Za-z0-9]+$/.test(playlist.id))
        throw new Error('Open a playlist before playing it.');
      if(deviceRestricted)throw new Error('This Spotify device blocks remote playback.');
      const context='spotify:playlist:'+playlist.id;
      // A clicked song starts the playlist context at that song, rather than
      // playing the track alone and discarding the playlist sequence.
      const selected=items.find(x=>x.type==='track'&&x.uri===message.uri);
      if(selected){
        await api.playPlaylist(context,selected.uri,device());
      }else await api.playUri(context,device());
      return;
    }
    if(name==='planTrack'){
      const selected=items.find(x=>x.type==='track'&&x.uri===message.uri);
      if(selected&&planned.length<5&&!planned.some(x=>x.uri===selected.uri)){
        planned.push({uri:selected.uri,title:selected.title,artist:selected.subtitle,imageUrl:selected.imageUrl});
        notice='Added to Geekify play-next plan';emit();
      }return;
    }
    if(name==='movePlanned'||name==='removePlanned'){
      const i=Number(message.index);
      if(!Number.isInteger(i)||i<0||i>=planned.length)return;
      if(name==='removePlanned')planned.splice(i,1);
      else{
        const j=i+Number(message.delta);
        if(!Number.isInteger(j)||j<0||j>=planned.length||Math.abs(j-i)!==1)return;
        [planned[i],planned[j]]=[planned[j],planned[i]];
      }
      emit();return;
    }
    if(name==='submitPlan'){
      if(demo||!planned.length)return;
      if(deviceRestricted)throw new Error('This device restricts Spotify queue changes.');
      let sent=0;
      for(const item of [...planned]){
        await api.addToQueue(item.uri,device());
        planned.shift();sent++;
      }
      notice=sent+' tracks submitted to Spotify queue. Spotify may not guarantee order.';
      await browse('management');return;
    }
    if(demo){
      if(name==='toggle')playing=!playing;
      else if(name==='seek')progressMs=Math.round(DEMO.durationMs*Math.max(0,Math.min(1,Number(message.ratio)||0)));
      else if(name==='next'||name==='previous'){progressMs=0;playing=true;}
      emit();return;
    }
    if(name==='openResult'){
      const found=items.find(x=>x.uri===message.uri&&x.type!=='track');
      if(!found)return;
      if(['playlist','album'].includes(found.type)){
        if(deviceRestricted)throw new Error('This device blocks remote playback. Keep your phone EQ and control playback on the phone, or switch to an unrestricted device.');
        await api.playUri(found.uri,device());
      }else if(['artist','show','episode'].includes(found.type)&&/^[A-Za-z0-9]+$/.test(found.id||'')){
        await vscode.env.openExternal(vscode.Uri.parse('https://open.spotify.com/'+found.type+'/'+found.id));
      }
      return;
    }
    if(['toggle','next','previous','seek','shuffle','repeat','playItem'].includes(name)&&deviceRestricted)
      throw new Error('Device '+deviceName+' blocks remote controls. Switch devices or control playback in Spotify.');
    if(name==='transfer'){
      if(typeof message.deviceId!=='string'||!(/^[a-zA-Z0-9]+$/.test(message.deviceId)))throw new Error('Invalid device.');
      await api.transfer(message.deviceId);
    }else if(name==='playItem'){
      const item=items.find(x=>x.type==='track'&&x.uri===message.uri);
      if(!item)throw new Error('Track not found in the current list.');
      await api.playUri(item.uri,device());
    }else if(name==='toggle'){
      if(controlBusy)return;
      controlBusy=true;
      try{
        const before=await api.playback();
        if(!before?.device)throw new Error('No active Spotify device.');
        playback=before;playing=Boolean(before.is_playing);
        const target=!playing;
        const targetDevice=before.device.id;
        let confirmed=false,lastError=null;
        // Re-issue the same desired state, never an inverse toggle. A rejected
        // command must not leave the UI believing it succeeded.
        for(let attempt=0;attempt<2;attempt++){
          try{await api.playPause(!target,targetDevice);lastError=null;}
          catch(error){
            lastError=error;
            // Authentication, restrictions and rate limits cannot be fixed
            // by immediately sending the same command again.
            if([401,403,429].includes(error?.status))break;
          }
          await new Promise(resolve=>setTimeout(resolve,attempt===0?450:650));
          const observed=await api.playback();
          if(observed){
            playback=observed;
            playing=Boolean(observed.is_playing);
            if(observed.device?.id!==targetDevice)break;
            if(playing===target){confirmed=true;break;}
          }
        }
        await poll();
        if(!confirmed)throw lastError||new Error('Spotify did not confirm '+(target?'Play':'Pause')+'. Playback state refreshed.');
        notice='';
      }finally{controlBusy=false;}
    }
    else if(name==='next')await api.next(device());
    else if(name==='previous')await api.previous(device());
    else if(name==='seek'){
      if(!track?.durationMs)return;
      await api.seek(Math.round(track.durationMs*Math.max(0,Math.min(1,Number(message.ratio)||0))),device());
    }else if(name==='save'&&track?.uri)await api.save(track.uri);
    else if(name==='shuffle')await api.shuffle(!shuffle,device());
    else if(name==='repeat'){
      const modes=['off','context','track'];
      await api.repeat(modes[(modes.indexOf(repeat)+1)%modes.length],device());
    }
    clearTimeout(pollTimer);
    if(polling)pollAgain=true;
    else await poll();
  }
  panel.webview.onDidReceiveMessage(async message=>{
    if(!message||typeof message.type!=='string'||closed)return;
    if(message.type==='ready'){
      emit();if(!demo)void poll();return;
    }
    if(message.type==='token'&&typeof message.requestId==='number'&&!demo){
      try{const token=await auth.accessToken();send({type:'token',requestId:message.requestId,token});}
      catch(error){send({type:'token',requestId:message.requestId,error:safeError(error)});}
      return;
    }
    if(message.type==='action'){
      try{await act(message);}
      catch(error){
        // Show Spotify's actual error; do not impose a client-side cooldown.
        notice=safeError(error);
        emit();
      }
    }
  });
  panel.onDidDispose(()=>{
    closed=true;clearTimeout(pollTimer);lyricAbort?.abort();activePanel=null;
  });
}
async function activate(context,{startBridge=startPanelBridge,status=writeStatus}={}){
  status('activating');
  const open=async demo=>{
    try{await openPanel(context,demo);}
    catch(error){
      const reason=safeError(error);
      status('open-error',reason);
      vscode.window.showErrorMessage('Geekify could not open its player: '+reason);
      throw error;
    }
  };
  try{
    context.subscriptions.push(
      vscode.commands.registerCommand('geekify.open',()=>open(false)),
      vscode.window.registerUriHandler({
        handleUri:async uri=>{
          if(uri.path!=='/open')return;
          const params=new URLSearchParams(uri.query);
          await open(params.get('demo')==='1');
          // A one-shot URI acknowledgement still works if the background
          // loopback listener cannot start in this VS Code profile.
          acknowledgeUriRequest(params.get('request'));
        }
      })
    );
  }catch(error){
    status('registration-error',safeError(error));
    throw error;
  }
  try{
    const bridge=await startBridge(open);
    context.subscriptions.push({dispose:()=>bridge.close()});
    status('ready');
  }catch(error){
    const reason=safeError(error);
    status('bridge-error',reason);
    vscode.window.showWarningMessage('Geekify panel bridge unavailable: '+reason+
      '. Use the command palette: Geekify: Open Player.');
  }
}
function deactivate(){activePanel?.panel.dispose();}
module.exports={activate,deactivate};