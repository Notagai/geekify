'use strict';
// DOM-based visual player: static PNG layers load once; only text/progress change.
const vscode=acquireVsCodeApi();
const assets=JSON.parse(document.getElementById('assets').textContent);
const board=document.getElementById('board'),viewport=document.getElementById('viewport');
const status=document.getElementById('audioStatus'),listen=document.getElementById('listenHere');
const art=(key,x,y,w,h,extra='')=>{
  const node=document.createElement('img');node.src=assets[key]||'';
  node.alt='';node.style.left=x+'px';node.style.top=y+'px';
  node.style.width=w+'px';node.style.height=h+'px';
  if(extra)node.className=extra;board.append(node);return node;
};
function el(tag,cls,x,y,w,h){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  Object.assign(node.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
  board.append(node);return node;
}
function label(cls,x,y,w,h,text){
  const node=el('div',cls,x,y,w,h);node.textContent=text;return node;
}
function btn(cls,x,y,w,h,text,fn){
  const node=el('button',cls,x,y,w,h);node.type='button';node.textContent=text;
  node.addEventListener('click',fn);return node;
}
function send(name,more={}){vscode.postMessage({type:'action',name,...more});}
let state={demo:true,track:null,progressMs:0,playing:false,lyrics:[],items:[],queue:[],browseType:''};
let activeTab='now',activeSub='lyrics',updatedAt=performance.now(),lastTrack='';
let sdkPlayer=null,sdkDevice=null,tokenSequence=0;
const tokens=new Map();
function layout(){
  const width=viewport.clientWidth,height=viewport.clientHeight;
  const scale=Math.min(width/1200,height/675,2);
  board.style.transform='scale('+scale+')';
  board.style.left=(width-1200*scale)/2+'px';
  board.style.top=(height-675*scale)/2+'px';
}
new ResizeObserver(layout).observe(viewport);
board.style.backgroundImage='url("'+assets['frame/wood-tile']+'")';
art('frame/edge-top',42,4,1116,33);
art('frame/edge-bottom',40,640,1120,31);
art('frame/edge-left',1,41,34,602);
art('frame/edge-right',1161,40,39,606);
for(const [id,x,y,w,h] of [
 ['frame/corner-tl',0,0,73,70],['frame/corner-tr',1127,0,73,70],
 ['frame/corner-bl',0,600,73,75],['frame/corner-br',1127,600,73,75],
 ['branding/logo-tag',49,12,232,97],['decor/vine',5,0,103,145],
 ['decor/flowers',15,409,115,109],['decor/polaroid',124,405,111,104],
 ['paper/lyrics-panel',266,78,900,436],['decor/tape',1018,85,115,68],
 ['paper/player-panel',29,528,1141,127]
])art(id,x,y,w,h);
const navButtons=[];
const navNames=['Now Playing','Search','Library','Playlists','Devices','Settings'];
const navIds=['now','search','library','playlists','devices','settings'];
const navIcons=['icon-now','icon-search','icon-library','icon-playlists','icon-devices','icon-settings'];
navIds.forEach((id,i)=>{
  const y=133+i*48;
  const skin=art('sidebar/button-idle',43,y,195,47);
  art('sidebar/'+navIcons[i],56,y+10,27,27);
  const button=btn('nav',43,y,195,47,navNames[i],()=>{
    activeTab=id;activeSub='lyrics';redraw();
    if(id==='library'||id==='playlists'||id==='devices')send(id);
  });
  navButtons.push({id,button,skin});
});
const subButtons=[];
['lyrics','queue','info'].forEach((id,i)=>{
  const x=303+i*143;
  const skin=art('paper/tab-inactive',x,77,144,54);
  const button=btn('subtab',x,77,144,54,id[0].toUpperCase()+id.slice(1),()=>{
    activeTab='now';activeSub=id;
    if(id==='queue')send('queue');redraw();
  });
  subButtons.push({id,button,skin});
});
const paper=el('div','paper-content',329,181,760,322);
const cover=art('player/default-cover',80,546,88,88,'art-cover');
art('player/album-frame',74,541,102,104);
const title=label('player-title',195,548,268,33,'Midnight Frequency');
const artist=label('player-artist',195,582,290,28,'geekify sessions');
const heart=art('player/heart',452,548,31,29);
btn('hit',446,545,46,43,'',()=>send('save')).setAttribute('aria-label','Save to Liked Songs');
const time=label('time',194,616,65,25,'0:00');
const duration=label('time',650,616,60,25,'2:16');
art('player/progress-empty',246,604,383,36);
const fill=art('player/progress-fill',247,604,380,36);
const knob=art('player/progress-knob',242,608,30,30);
const progress=el('button','progress-hit',248,605,380,30);
progress.setAttribute('aria-label','Seek through song');
progress.addEventListener('click',e=>send('seek',{ratio:(e.clientX-progress.getBoundingClientRect().left)/progress.getBoundingClientRect().width}));
const transport=[['shuffle',742,561,54,52,'shuffle'],['previous',800,561,55,52,'previous'],
  ['pause',860,554,67,68,'toggle'],['next',934,561,56,52,'next'],
  ['repeat',992,561,56,52,'repeat']];
const transportButtons={};
transport.forEach(([id,x,y,w,h,action])=>{
  art('player/'+id,x,y,w,h);
  transportButtons[id]=btn('hit',x,y,w,h,'',()=>send(action));
  transportButtons[id].setAttribute('aria-label',action);
});
const playGlyph=label('badge',891,579,34,33,'');
const tag=label('badge',1080,587,60,25,'DEMO');
const connection=label('status',795,35,290,27,'● Demo');
function msClock(ms){const t=Math.max(0,Math.floor((Number(ms)||0)/1000));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
function truncate(value,max=65){const text=String(value||'');return text.length>max?text.slice(0,max-1)+'…':text;}
function advance(){if(!state.playing)return state.progressMs||0;return Math.min(state.track?.durationMs||0,(state.progressMs||0)+(performance.now()-updatedAt));}
function renderProgress(){
  const ratio=Math.max(0,Math.min(1,advance()/(state.track?.durationMs||1)));
  fill.style.clipPath='inset(0 '+(100-ratio*100)+'% 0 0)';
  knob.style.left=(242+376*ratio)+'px';
  time.textContent=msClock(advance());
  duration.textContent=msClock(state.track?.durationMs||0);
  if(activeTab==='now'&&activeSub==='lyrics')renderLyrics();
}
function textNode(tag,cls,text){
  const node=document.createElement(tag);node.className=cls;node.textContent=text;
  return node;
}
let lyricSignature='';
function renderLyrics(){
  const lines=state.lyrics||[];
  const now=advance();
  let idx=0;
  if(state.lyricsStatus==='synced')for(let i=0;i<lines.length;i++)if(lines[i].timeMs<=now)idx=i;
  const shown=state.lyricsStatus==='plain'
    ?lines.slice(0,6).map(x=>({text:x.text,active:false}))
    :lines.slice(Math.max(0,idx-2),idx+3).map((x,i)=>({
        text:x.text,active:Math.max(0,idx-2)+i===idx
      }));
  const signature=JSON.stringify(shown);
  if(signature===lyricSignature)return;
  lyricSignature=signature;
  paper.replaceChildren();
  if(!shown.length){
    paper.append(textNode('p','note',state.demo?'Demo has no lyrics.':'Lyrics unavailable for this track.'));
    return;
  }
  const holder=textNode('div','lyrics-lines','');
  shown.forEach(line=>holder.append(textNode('p','lyric'+(line.active?' active':''),line.text)));
  paper.append(holder);
  if(state.lyricsStatus==='plain')paper.append(textNode('small','secondary','UNSYNCED LYRICS'));
}
function renderList(items){
  paper.replaceChildren();
  const heading=textNode('div','title-line',activeTab==='search'?'SEARCH':
    activeTab==='library'?'LIKED SONGS':activeTab==='playlists'?(state.playlistName||'YOUR PLAYLISTS'):
      activeTab==='devices'?'DEVICES':'UP NEXT');
  paper.append(heading);
  if(activeTab==='search'){
    const input=document.createElement('input');input.className='search-input';
    input.placeholder='Search tracks…';input.setAttribute('aria-label','Search Spotify');
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){send('search',{query:input.value.trim()});input.blur();}
    });
    paper.append(input);
  }
  const list=textNode('div','list','');paper.append(list);
  (items||[]).slice(0,25).forEach(item=>{
    const button=textNode('button','item','');
    button.type='button';button.append(textNode('span','',truncate(item.title,42)));
    button.append(textNode('small','',truncate(item.subtitle,28)));
    if(item.type==='playlist')button.addEventListener('click',()=>send('playlist',{id:item.id}));
    else if(item.type==='device')button.addEventListener('click',()=>send('transfer',{deviceId:item.id}));
    else button.addEventListener('click',()=>send('playItem',{uri:item.uri}));
    list.append(button);
  });
  if(!items?.length)list.append(textNode('p','secondary','No tracks here yet.'));
}
function redraw(){
  navButtons.forEach(({id,button,skin})=>{
    button.classList.toggle('selected',id===activeTab);
    skin.src=assets[id===activeTab?'sidebar/button-active':'sidebar/button-idle'];
  });
  subButtons.forEach(({id,button,skin})=>{
    button.style.display=activeTab==='now'?'flex':'none';
    skin.style.display=activeTab==='now'?'':'none';
    skin.src=assets[id===activeSub?'paper/tab-active':'paper/tab-inactive'];
  });
  const song=state.track||{};
  title.textContent=truncate(song.title||'Nothing playing',25);
  artist.textContent=truncate(song.artist||'Search Spotify to begin',29);
  cover.src=song.imageUrl&&/^https:\/\/(?:i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9.-]+\.spotifycdn\.com|[a-z0-9.-]+\.spotify\.com)\//i.test(song.imageUrl)
    ?song.imageUrl:assets['player/default-cover'];
  connection.textContent=state.demo?'● Demo':'● Spotify';
  tag.textContent=state.demo?'DEMO':'LIVE';
  playGlyph.textContent=state.playing?'':'▶';
  transportButtons.pause.setAttribute('aria-label',state.playing?'Pause':'Play');
  if(activeTab==='now'){
    if(activeSub==='lyrics'){lyricSignature='';renderLyrics();}
    else if(activeSub==='queue')renderList((state.queue||[]).map(x=>({...x,subtitle:x.artist})));
    else{
      paper.replaceChildren();
      paper.append(textNode('h2','title-line','SONG INFORMATION'));
      [song.title,song.artist,song.album].filter(Boolean).forEach(x=>paper.append(textNode('p','note',x)));
    }
  }else if(activeTab==='settings'){
    paper.replaceChildren();
    paper.append(textNode('h2','title-line','SETTINGS'));
    paper.append(textNode('p','note','Run geekify login to authorize Spotify with streaming access.'));
    paper.append(textNode('p','secondary','The VS Code panel may not support protected playback. Use Spotify web player when needed.'));
  }else renderList(activeTab==='devices'||activeTab==='search'||activeTab==='library'||activeTab==='playlists'?state.items:[]);
  renderProgress();
}
document.getElementById('openWeb').addEventListener('click',()=>send('openWeb'));
listen.addEventListener('click',()=>{
  if(!sdkPlayer||!sdkDevice)return;
  // Must be called directly inside the gesture to satisfy autoplay restrictions.
  void sdkPlayer.activateElement();
  send('transfer',{deviceId:sdkDevice});
  status.textContent='Switching playback to Geekify…';
});
function requestToken(cb){
  const requestId=++tokenSequence;
  tokens.set(requestId,cb);
  vscode.postMessage({type:'token',requestId});
}
function initSdk(){
  if(!window.Spotify||sdkPlayer||state.demo)return;
  if(!state.canStream){
    status.textContent='Run geekify login again to grant Spotify streaming access.';
    listen.textContent='Reconnect required';return;
  }
  sdkPlayer=new Spotify.Player({
    name:'Geekify in VS Code',
    getOAuthToken:cb=>requestToken(cb),
    volume:0.5
  });
  sdkPlayer.addListener('ready',({device_id})=>{
    sdkDevice=device_id;listen.disabled=false;
    listen.textContent='▶ Listen inside Geekify';
    status.textContent='In-panel audio available. Click Listen inside Geekify.';
  });
  sdkPlayer.addListener('not_ready',()=>{
    sdkDevice=null;listen.disabled=true;status.textContent='In-panel audio device disconnected.';
  });
  ['initialization_error','authentication_error','account_error','playback_error'].forEach(type=>
    sdkPlayer.addListener(type,({message})=>{
      status.textContent='In-panel playback unavailable: '+message+'. Use the Spotify web player.';
      listen.disabled=true;listen.textContent='In-panel audio unavailable';
    }));
  sdkPlayer.addListener('autoplay_failed',()=>{
    status.textContent='Audio blocked by autoplay; click Listen inside Geekify again.';
  });
  void sdkPlayer.connect().then(ok=>{
    if(!ok)status.textContent='Protected playback unavailable here. Use Spotify web player.';
  }).catch(error=>{status.textContent=error.message;});
}
window.onSpotifyWebPlaybackSDKReady=initSdk;
window.addEventListener('message',event=>{
  const message=event.data;if(!message||typeof message.type!=='string')return;
  if(message.type==='token'){
    const callback=tokens.get(message.requestId);
    if(callback){
      tokens.delete(message.requestId);
      if(message.token)callback(message.token);
      else status.textContent='Spotify token unavailable: '+(message.error||'Sign in again.');
    }
    return;
  }
  if(message.type==='state'){
    const priorDemo=state.demo;
    state=message;updatedAt=performance.now();
    if(message.notice)status.textContent=message.notice;
    else if(message.demo)status.textContent='Demo mode: connect Spotify to hear your music.';
    else if(!sdkDevice)status.textContent='Spotify connected. Trying in-panel playback…';
    redraw();
    if(priorDemo&&!message.demo&&window.Spotify)initSdk();
  }
});
setInterval(renderProgress,350);
vscode.postMessage({type:'ready'});
layout();