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
  'playItem','transfer','search','library','playlists','playlist','devices','queue','openWeb','refresh']);
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
  let closed=false,pollTimer,lyricAbort,polling=false,trackKey='';
  let demo=forceDemo||!auth.isConnected();
  let track=demo?DEMO:null,playing=demo,progressMs=demo?75000:0;
  let lyrics=demo?DEMO_LYRICS:[],lyricsStatus=demo?'synced':'missing';
  let playback=null,repeat='off',shuffle=false;
  let queue=[],items=[],browseType='',playlist=null,notice='';
  function send(message){if(!closed)void panel.webview.postMessage(message);}
  function emit(){
    const scopes=String(auth.loadConfig().token?.scope||'').split(/\s+/);
    send({type:'state',demo,track,playing,progressMs,lyrics,lyricsStatus,
      queue,items,browseType,playlistName:playlist?.name||'',notice,repeat,shuffle,
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
    let nextDelay=5500;
    try{
      const state=await api.playback();
      if(closed||demo)return;
      playback=state;playing=Boolean(state?.is_playing);
      progressMs=state?.progress_ms||0;repeat=state?.repeat_state||'off';
      shuffle=Boolean(state?.shuffle_state);
      track=spotify.trackInfo(state?.item);
      const key=track?.uri||'';
      if(key!==trackKey){trackKey=key;void loadLyrics(track);}
      notice='';
      emit();
    }catch(error){
      notice=safeError(error);nextDelay=Math.max(5000,(error.retryAfter||5)*1000);
      emit();
    }finally{
      polling=false;
      if(!closed&&!demo)pollTimer=setTimeout(poll,nextDelay);
    }
  }
  function device(){return playback?.device?.id||undefined;}
  async function browse(type,query){
    if(demo){notice='Log in with geekify login to browse Spotify.';emit();return;}
    let response;
    if(type==='search')response=(await api.search(String(query||'').slice(0,100)))?.tracks?.items||[];
    else if(type==='library')response=(await api.saved())?.items?.map(x=>x.track).filter(Boolean)||[];
    else if(type==='playlists')response=(await api.playlists())?.items||[];
    else if(type==='playlist')response=(await api.playlistItems(playlist.id))?.items?.map(x=>x.item||x.track).filter(Boolean)||[];
    else if(type==='devices')response=(await api.devices())?.devices||[];
    else if(type==='queue'){
      queue=(await api.queue())?.queue?.slice(0,20).map(spotify.trackInfo).filter(Boolean)||[];
      emit();return;
    }
    browseType=type;
    items=response.map(item=>{
      if(type==='devices')return {type:'device',id:item.id,title:item.name,subtitle:item.is_active?'Active':'Available'};
      if(type==='playlists')return {type:'playlist',id:item.id,title:item.name,
        subtitle:(item.items?.total??item.tracks?.total??0)+' tracks',name:item.name};
      const t=spotify.trackInfo(item);
      return {type:'track',id:t?.id,uri:t?.uri,title:t?.title||'Unavailable',subtitle:t?.artist||''};
    });
    emit();
  }
  async function act(message){
    if(!allowedActions.has(message.name))return;
    const name=message.name;
    if(name==='openWeb'){
      await vscode.env.openExternal(vscode.Uri.parse('https://open.spotify.com/'));return;
    }
    if(name==='refresh'){if(demo)emit();else await poll();return;}
    if(name==='search'||name==='library'||name==='playlists'||name==='devices'||name==='queue'){
      await browse(name,message.query);return;
    }
    if(name==='playlist'){
      const selected=items.find(x=>x.type==='playlist'&&x.id===message.id);
      if(selected){playlist=selected;await browse('playlist');}return;
    }
    if(demo){
      if(name==='toggle')playing=!playing;
      else if(name==='seek')progressMs=Math.round(DEMO.durationMs*Math.max(0,Math.min(1,Number(message.ratio)||0)));
      else if(name==='next'||name==='previous'){progressMs=0;playing=true;}
      emit();return;
    }
    if(name==='transfer'){
      if(typeof message.deviceId!=='string'||!(/^[a-zA-Z0-9]+$/.test(message.deviceId)))throw new Error('Invalid device.');
      await api.transfer(message.deviceId);
    }else if(name==='playItem'){
      const item=items.find(x=>x.type==='track'&&x.uri===message.uri);
      if(!item)throw new Error('Track not found in the current list.');
      await api.playUri(item.uri,device());
    }else if(name==='toggle')await api.playPause(playing,device());
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
    clearTimeout(pollTimer);await poll();
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
      catch(error){notice=safeError(error);emit();}
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