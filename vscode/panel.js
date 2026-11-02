'use strict';
// Geekify's working UI is native DOM. The sprite-sheet controls were visibly
// cropped in their source PNGs, so interactive icons use complete inline SVG.
const vscode=acquireVsCodeApi();
const assets=JSON.parse(document.getElementById('assets').textContent);
const board=document.getElementById('board');
const status=document.getElementById('audioStatus');
const listen=document.getElementById('listenHere');
const NS='http://www.w3.org/2000/svg';
// Native 16x16 pixel masks. Every mark is a filled grid square, not an
// antialiased outline or an incomplete cut from the generated sprite sheet.
const pixelGlyphs={
  brand:[
    '.....######.....',
    '....##....##....',
    '...##......##...',
    '..##........##..',
    '..##........##..',
    '..##........##..',
    '.###........###.',
    '.###........###.',
    '.###........###.',
    '..##........##..',
    '................'
  ],
  now:[
    '................',
    '..######........',
    '.###########....',
    '.##........##...',
    '.##....#...##...',
    '.##....###.##...',
    '.##....####.#...',
    '.##....###.##...',
    '.##....#...##...',
    '.##........##...',
    '.############...',
    '..##########....'
  ],
  search:[
    '....######......',
    '...##....##.....',
    '..##......##....',
    '..##......##....',
    '..##......##....',
    '...##....##.....',
    '....######......',
    '.........##.....',
    '..........##....',
    '...........##...',
    '............##..',
    '.............##.'
  ],
  library:[
    '................',
    '..####.####.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..##.#.##.#.##..',
    '..####.####.##..',
    '..############..'
  ],
  playlists:[
    '................',
    '..##..########..',
    '..##..########..',
    '................',
    '..##..########..',
    '..##..########..',
    '................',
    '..##..########..',
    '..##..########..',
    '................',
    '..##..########..',
    '..##..########..'
  ],
  devices:[
    '.#########......',
    '.##.....##.####.',
    '.##.....##.##.#.',
    '.##.....##.##.#.',
    '.##.....##.##.#.',
    '.##.....##.##.#.',
    '.##.....##.##.#.',
    '.#########.##.#.',
    '....##.....##.#.',
    '..######...####.',
    '................'
  ],
  settings:[
    '.....#####......',
    '..##.#####.##...',
    '..###########...',
    '.####.....####..',
    '.###..###..###..',
    '.###..#.#..###..',
    '.###..###..###..',
    '.####.....####..',
    '..###########...',
    '..##.#####.##...',
    '.....#####......'
  ],
  shuffle:[
    '.###........##..',
    '.#####....####..',
    '.....##.##......',
    '......###.......',
    '......###.......',
    '.....##.##......',
    '.#####....####..',
    '.###........##..'
  ],
  previous:[
    '.###............',
    '.###.......##...',
    '.###......###...',
    '.###....#####...',
    '.###..#######...',
    '.###....#####...',
    '.###......###...',
    '.###.......##...'
  ],
  pause:[
    '..####....####..',
    '..####....####..',
    '..####....####..',
    '..####....####..',
    '..####....####..',
    '..####....####..',
    '..####....####..',
    '..####....####..'
  ],
  play:[
    '..###...........',
    '..#####.........',
    '..#######.......',
    '..#########.....',
    '..###########...',
    '..#########.....',
    '..#######.......',
    '..#####.........',
    '..###...........'
  ],
  next:[
    '............###.',
    '...##.......###.',
    '...###......###.',
    '...#####....###.',
    '...#######..###.',
    '...#####....###.',
    '...###......###.',
    '...##.......###.'
  ],
  repeat:[
    '....########....',
    '..###......##...',
    '.##........##...',
    '.##........####.',
    '.##..........##.',
    '.##........####.',
    '.##........##...',
    '..###......##...',
    '....########....'
  ],
  heart:[
    '..####....####..',
    '.######..######.',
    '################',
    '################',
    '.##############.',
    '..############..',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......'
  ]
};
function icon(name){
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 16 16');
  svg.setAttribute('aria-hidden','true');
  svg.classList.add('pixel-icon');
  const rows=pixelGlyphs[name]||pixelGlyphs.now;
  // Center each sprite vertically; coalesce horizontal runs into exact rectangles.
  const yOffset=Math.floor((16-rows.length)/2);
  for(let y=0;y<rows.length;y++){
    const line=rows[y];
    for(let x=0;x<Math.min(16,line.length);){
      if(line[x]!=='#'){x++;continue;}
      let end=x+1;
      while(end<16&&line[end]==='#')end++;
      const pixel=document.createElementNS(NS,'rect');
      pixel.setAttribute('x',String(x));
      pixel.setAttribute('y',String(y+yOffset));
      pixel.setAttribute('width',String(end-x));
      pixel.setAttribute('height','1');
      svg.append(pixel);
      x=end;
    }
  }
  return svg;
}
function make(tag,cls,parent,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=text;
  parent.append(n);
  return n;
}
function button(cls,parent,text,fn){
  const n=make('button',cls,parent);
  n.type='button';
  if(text!==undefined)n.textContent=text;
  n.addEventListener('click',fn);
  return n;
}
function send(name,extra={}){vscode.postMessage({type:'action',name,...extra});}
let state={demo:true,track:null,progressMs:0,playing:false,lyrics:[],items:[],queue:[],browseType:''};
let activeTab='now',activeSub='lyrics',updatedAt=performance.now();
let sdkPlayer=null,sdkDevice=null,tokenSequence=0,lyricSignature='',lastSearch='';
const tokens=new Map();

// Every region sizes to the real webview. A narrow editor stacks the sidebar,
// parchment and transport controls; no more 1200px canvas scaled to a stamp.
board.style.setProperty('--wood-image','url("'+assets['frame/wood-tile']+'")');
board.style.setProperty('--paper-tile-image','url("'+assets['paper/grain-tile']+'")');
board.style.setProperty('--paper-top-image','url("'+assets['paper/torn-top']+'")');
board.style.setProperty('--paper-bottom-image','url("'+assets['paper/torn-bottom']+'")');
board.style.setProperty('--paper-left-image','url("'+assets['paper/worn-left']+'")');
board.style.setProperty('--paper-right-image','url("'+assets['paper/worn-right']+'")');
board.style.setProperty('--forest-image','url("'+assets['paper/forest-edge']+'")');
board.style.setProperty('--player-image','url("'+assets['paper/player-panel']+'")');
board.style.setProperty('--idle-image','url("'+assets['sidebar/button-idle']+'")');
// Do not use sidebar/button-active.png: its source contains a cropped corner.
board.style.setProperty('--brand-vine-image','url("'+assets['branding/ivy-corner']+'")');
board.style.setProperty('--flowers-image','url("'+assets['decor/flowers']+'")');
board.style.setProperty('--polaroid-image','url("'+assets['decor/polaroid']+'")');
const frame=make('div','desk',board);
const header=make('header','desk-header',frame);
const brand=make('div','brand-mark',header);
make('span','brand-vine',brand).setAttribute('aria-hidden','true');
const brandBadge=make('div','brand-badge',brand);
brandBadge.append(icon('brand'));
make('span','brand-label',brandBadge,'geekify.');
const connection=make('span','connection',header,'● Spotify');
const workspace=make('div','workspace',frame);
const sidebar=make('aside','sidebar',workspace);
const nav=make('nav','sidebar-nav',sidebar);
nav.setAttribute('aria-label','Geekify sections');
const navDefs=[
 ['now','Now Playing'],['search','Search'],['library','Library'],
 ['playlists','Playlists'],['devices','Devices'],['settings','Settings']
];
const navButtons=[];
for(const [id,title] of navDefs){
  const b=button('nav-item',nav,undefined,()=>{
    activeTab=id;activeSub='lyrics';lyricSignature='';
    if(id==='library'||id==='playlists'||id==='devices')send(id);
    redraw();
  });
  b.append(icon(id));
  make('span','nav-text',b,title);
  b.setAttribute('aria-label',title);
  navButtons.push({id,button:b});
}
const decor=make('div','sidebar-decor',sidebar);
make('div','decor-flowers',decor).setAttribute('aria-hidden','true');
make('div','decor-photo',decor).setAttribute('aria-hidden','true');
const sheet=make('section','parchment',workspace);
const tabs=make('div','paper-tabs',sheet);
const subButtons=[];
for(const id of ['lyrics','queue','info']){
  const b=button('paper-tab',tabs,id[0].toUpperCase()+id.slice(1),()=>{
    activeTab='now';activeSub=id;lyricSignature='';
    if(id==='queue')send('queue');
    redraw();
  });
  subButtons.push({id,button:b});
}
const paper=make('div','paper-content',sheet);
paper.setAttribute('aria-live','polite');
const player=make('section','player-panel',frame);
player.setAttribute('aria-label','Music playback');
const artWrap=make('div','album-art-frame',player);
const cover=make('img','album-art',artWrap);
cover.alt='Album cover';
cover.src=assets['player/default-cover'];
const songInfo=make('div','song-info',player);
const title=make('div','player-title',songInfo,'Midnight Frequency');
const artist=make('div','player-artist',songInfo,'geekify sessions');
const saveButton=button('save-button',songInfo,undefined,()=>send('save'));
saveButton.append(icon('heart'));
saveButton.setAttribute('aria-label','Save current song');
const playback=make('div','playback',player);
const controls=make('div','transport-controls',playback);
const transportButtons={};
for(const [id,action,description] of [
 ['shuffle','shuffle','Toggle shuffle'],['previous','previous','Previous song'],
 ['pause','toggle','Pause or play'],['next','next','Next song'],
 ['repeat','repeat','Change repeat mode']
]){
  const b=button('transport '+(id==='pause'?'transport-primary':''),controls,undefined,()=>send(action));
  b.append(icon(id));
  b.setAttribute('aria-label',description);
  transportButtons[id]=b;
}
const timeline=make('div','timeline-row',playback);
const time=make('span','time-start',timeline,'0:00');
const progress=make('div','seek-track',timeline);
progress.setAttribute('role','slider');
progress.setAttribute('tabindex','0');
progress.setAttribute('aria-label','Seek through song');
progress.setAttribute('aria-valuemin','0');
progress.setAttribute('aria-valuemax','100');
progress.setAttribute('aria-valuenow','0');
const fill=make('div','seek-fill',progress);
const knob=make('div','seek-knob',progress);
const duration=make('span','time-end',timeline,'2:16');
const tag=make('span','playback-tag',player,'DEMO');
progress.addEventListener('click',e=>send('seek',{
  ratio:Math.max(0,Math.min(1,(e.clientX-progress.getBoundingClientRect().left)/
    progress.getBoundingClientRect().width))
}));
progress.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const step=e.key==='ArrowLeft'?-0.05:e.key==='ArrowRight'?0.05:0;
  const ratio=e.key==='Home'?0:e.key==='End'?1:
    Math.max(0,Math.min(1,(Number(progress.getAttribute('aria-valuenow'))||0)/100+step));
  send('seek',{ratio});
});
function msClock(ms){const t=Math.max(0,Math.floor((Number(ms)||0)/1000));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
function truncate(value,max=65){const text=String(value||'');return text.length>max?text.slice(0,max-1)+'…':text;}
function advance(){if(!state.playing)return state.progressMs||0;return Math.min(state.track?.durationMs||0,(state.progressMs||0)+(performance.now()-updatedAt));}
function renderProgress(){
  const ratio=Math.max(0,Math.min(1,advance()/(state.track?.durationMs||1)));
  fill.style.width=(ratio*100)+'%';
  knob.style.left=(ratio*100)+'%';
  progress.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
  time.textContent=msClock(advance());
  duration.textContent=msClock(state.track?.durationMs||0);
  if(activeTab==='now'&&activeSub==='lyrics')renderLyrics();
}
function textNode(tag,cls,text){
  const node=document.createElement(tag);node.className=cls;node.textContent=text;
  return node;
}
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
    input.value=lastSearch;
    input.addEventListener('input',()=>{lastSearch=input.value;});
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        lastSearch=input.value.trim();
        send('search',{query:lastSearch});
        input.blur();
      }
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
  navButtons.forEach(({id,button})=>{
    const selected=id===activeTab;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-current',selected?'page':'false');
  });
  tabs.hidden=activeTab!=='now';
  subButtons.forEach(({id,button})=>{
    const selected=id===activeSub&&activeTab==='now';
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  const song=state.track||{};
  title.textContent=truncate(song.title||'Nothing playing',50);
  artist.textContent=truncate(song.artist||'Search Spotify to begin',55);
  cover.src=song.imageUrl&&/^https:\/\/(?:i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9.-]+\.spotifycdn\.com|[a-z0-9.-]+\.spotify\.com)\//i.test(song.imageUrl)
    ?song.imageUrl:assets['player/default-cover'];
  connection.textContent=state.demo?'● Demo':'● Spotify';
  tag.textContent=state.demo?'DEMO':'LIVE';
  transportButtons.pause.replaceChildren(icon(state.playing?'pause':'play'));
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
  }else renderList(
    state.browseType===activeTab||(activeTab==='playlists'&&state.browseType==='playlist')
      ?state.items:[]
  );
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
