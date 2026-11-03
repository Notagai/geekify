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
    '..######........',
    '..######........',
    '.############...',
    '.############...',
    '.##........##...',
    '.##........##...',
    '.##........##...',
    '.##........##...',
    '.############...',
    '.############...',
    '................'
  ],
  folder:[
    '................',
    '..######........',
    '..######........',
    '.############...',
    '.############...',
    '.##........##...',
    '.##........##...',
    '.##........##...',
    '.##........##...',
    '.############...',
    '.############...',
    '................'
  ],
  chevron:[
    '................',
    '......##........',
    '.......##.......',
    '........##......',
    '.........##.....',
    '..........##....',
    '.........##.....',
    '........##......',
    '.......##.......',
    '......##........',
    '................'
  ],
  management:[
    '................',
    '..##..#######...',
    '..##..#######...',
    '................',
    '..##..#######...',
    '..##..#######...',
    '................',
    '..##..#######...',
    '..##..#######...',
    '................',
    '................'
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
let lyricSize=28;
let lyricNodes=[],lyricTrackKey='',lyricActiveIndex=-1;
lyricSize=Math.max(18,Math.min(46,lyricSize));
const tokens=new Map();

// The section tabs sit above the full-width parchment, with a responsive player below.
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
const connection=make('span','connection',header,'● No active device');
const workspace=make('div','workspace',frame);
const nav=make('nav','section-tabs',workspace);
nav.setAttribute('aria-label','Geekify sections');
nav.setAttribute('role','tablist');
const navDefs=[
 ['now','Current'],['library','Library'],['management','Management'],
 ['search','Search'],['devices','Devices'],['settings','Settings']
];
const navButtons=[];
for(const [id,title] of navDefs){
  const b=button('nav-item section-tab',nav,undefined,()=>{
    const previousTab=activeTab;
    activeTab=id;activeSub='lyrics';lyricSignature='';
    // Lyrics rendering caches its DOM. Leaving Current replaces the paper
    // contents, so invalidate that cache before returning to Current.
    if(id==='now'&&previousTab!=='now'){
      lyricTrackKey='';lyricActiveIndex=-1;lyricNodes=[];
    }
    if(id==='search')send(lastSearch?'search':'daily',{query:lastSearch});
    if(id==='library'||id==='devices'||id==='management')send(id);
    redraw();
  });
  b.append(icon(id));
  make('span','nav-text',b,title);
  b.setAttribute('aria-label',title);
  b.setAttribute('role','tab');
  b.setAttribute('aria-controls','geekify-page');
  navButtons.push({id,button:b});
}
const sheet=make('section','parchment',workspace);
sheet.setAttribute('id','geekify-page');
sheet.setAttribute('role','tabpanel');
const decor=make('div','sidebar-decor parchment-decor',sheet);
for(const [cls,label] of [['decor-flowers','Flowers'],['decor-photo','Photo']]){
  const obj=button('decor-interactive '+cls,decor,undefined,()=>{
    obj.classList.toggle('touched');
  });
  obj.setAttribute('aria-label','Move '+label+' decoration');
}
const paper=make('div','paper-content',sheet);
paper.setAttribute('aria-live','polite');
paper.style.setProperty('--lyric-size',lyricSize+'px');
const player=make('section','player-panel',frame);
player.setAttribute('aria-label','Music playback');
const artWrap=button('album-art-frame',player,undefined,()=>{
  const expanded=artWrap.classList.toggle('expanded');
  player.classList.toggle('cover-expanded',expanded);
  artWrap.setAttribute('aria-expanded',String(expanded));
});
artWrap.setAttribute('aria-label','Expand playing song cover');
artWrap.setAttribute('aria-expanded','false');
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
  const b=button('transport '+(id==='pause'?'transport-primary':''),controls,undefined,()=>{
    if(sdkPlayer&&sdkDevice&&state.deviceId===sdkDevice){
      const method=action==='toggle'?'togglePlay':action==='next'?'nextTrack':action==='previous'?'previousTrack':null;
      if(method){void sdkPlayer[method]().catch(error=>{status.textContent=error.message;});return;}
    }
    send(action);
  });
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
  const key=[state.track?.uri,state.lyricsStatus,lyricSize,lines.length,lines[0]?.text,lines.at(-1)?.text].join('|');
  if(key!==lyricTrackKey){
    lyricTrackKey=key;lyricActiveIndex=-1;lyricNodes=[];
    paper.replaceChildren();
    paper.classList.remove('unsynced-lyrics');
    if(state.track){
      const info=textNode('div','lyrics-song-info','');
      info.append(textNode('strong','',state.track.title||''));
      info.append(textNode('small','',((state.track.artist||'')+' · '+(state.track.album||'')).replace(/ · $/,'')));
      paper.append(info);
    }
    if(!lines.length){
      paper.append(textNode('p','note',state.demo?'No lyrics for this demo.':'No lyrics found'));
      if(!state.demo&&state.track?.title){
        // A discovery link, never scrape or silently import licensed lyrics.
        const link=textNode('a','lyrics-search-link','Find lyrics on Genius');
        link.href='https://genius.com/search?q='+encodeURIComponent([state.track.title,state.track.artist].filter(Boolean).join(' '));
        link.target='_blank';link.rel='noopener noreferrer';
        paper.append(link);
      }
      return;
    }
    const holder=textNode('div','lyrics-scroll','');
    holder.setAttribute('aria-label','Scrolling song lyrics');
    lines.forEach((line,i)=>{
      const el=textNode('p','lyric lyric-row',line.text);
      el.setAttribute('data-line',String(i));
      lyricNodes.push(el);holder.append(el);
    });
    if(state.lyricsStatus==='plain'){
      paper.classList.add('unsynced-lyrics');
      holder.classList.add('plain-lyrics');
      paper.append(textNode('small','secondary','UNSYNCED LYRICS · Scroll to read'));
    }
    paper.append(holder);
  }
  if(state.lyricsStatus!=='synced'||!lyricNodes.length)return;
  const now=advance();
  let idx=0;
  for(let i=0;i<lines.length;i++)if(lines[i].timeMs<=now)idx=i;
  if(idx===lyricActiveIndex)return;
  if(lyricNodes[lyricActiveIndex])lyricNodes[lyricActiveIndex].classList.remove('active');
  lyricActiveIndex=idx;
  const current=lyricNodes[idx];
  current?.classList.add('active');
  // Native smooth scrolling preserves every line and approximately four on either side.
  current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'instant':'smooth',block:'center'});
}
function spotifyImage(url){
  if(typeof url!=='string')return '';
  try{
    const parsed=new URL(url);
    const host=parsed.hostname.toLowerCase();
    return parsed.protocol==='https:' &&
      (host==='i.scdn.co'||host==='mosaic.scdn.co'||
        host.endsWith('.spotifycdn.com')) ? parsed.href : '';
  }catch{return '';}
}
function coverImage(url,cls,alt){
  const wrap=document.createElement('span');wrap.className='playlist-cover '+cls;
  const img=document.createElement('img');img.alt=alt;
  img.loading='lazy';img.decoding='async';
  img.src=spotifyImage(url)||assets['player/default-cover'];
  img.addEventListener('error',()=>{
    if(img.src!==assets['player/default-cover'])img.src=assets['player/default-cover'];
  });
  wrap.append(img);
  return wrap;
}
function renderList(items){
  paper.replaceChildren();
  const libraryOpen=activeTab==='library'&&state.browseType!=='library';
  if(libraryOpen){
    const trail=textNode('div','library-breadcrumbs','');
    const back=button('library-back',trail,'← Library',()=>send('libraryBack'));
    back.setAttribute('aria-label','Back one folder');
    if(state.browseType==='playlist'){
      trail.append(textNode('span','breadcrumb-separator','/ Playlists /'));
      trail.append(textNode('span','breadcrumb-current',state.playlistName||''));
    }else trail.append(textNode('span','breadcrumb-current',state.browseType==='library-liked'?'/ Liked Songs':'/ Playlists'));
    paper.append(trail);
  }
  const heading=textNode('div','title-line',activeTab==='search'?'SEARCH':
    activeTab==='library'?(state.browseType==='playlist'?(state.playlistName||'PLAYLIST'):
      state.browseType==='library-liked'?'LIKED SONGS':state.browseType==='library-playlists'?'PLAYLISTS':'LIBRARY'):
      activeTab==='devices'?'DEVICES':'UP NEXT');
  if(activeTab==='library'&&state.browseType==='playlist'){
    const hero=textNode('div','playlist-hero','');
    hero.append(coverImage(state.playlistImageUrl,'playlist-hero-cover','Playlist cover'));
    const details=textNode('div','playlist-hero-details','');
    details.append(heading);
    details.append(textNode('small','secondary',(items||[]).length+' songs'));
    hero.append(details);paper.append(hero);
  }else paper.append(heading);
  if(activeTab==='search'){
    const shortcuts=textNode('div','search-shortcuts','');
    // Daily Mixes load automatically when Search opens.
    button('search-shortcut',shortcuts,'Recently Played',()=>send('recent'));
    paper.append(shortcuts);
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
  if(activeTab==='library'&&state.browseType==='library-playlists'&&!(items||[]).length){
    const message=state.browseError
      ?'Could not load playlists: '+state.browseError
      :'No playlists returned by Spotify. Check that this is the correct Spotify account.';
    list.append(textNode('p','note',message));
    button('setting-control',list,'Retry loading playlists',()=>send('libraryFolder',{id:'playlists'}));
  }
  (items||[]).forEach(item=>{
    const row=textNode('div','item-row','');
    const button=textNode('button','item','');
    button.type='button';row.append(button);
    if(item.type==='folder'){
      const folder=textNode('span','folder-icon','');folder.append(icon('folder'));button.append(folder);
      button.className+=' folder-item';
    }else if(['playlist','track','album','artist','show','episode'].includes(item.type)){
      button.append(coverImage(item.imageUrl,'playlist-row-cover',item.type==='playlist'?'Playlist cover':'Album cover'));
    }
    const labels=textNode('span','item-labels','');
    labels.append(textNode('span','item-title',truncate(item.title,70)));
    labels.append(textNode('small','item-subtitle',truncate(item.subtitle,60)));
    button.append(labels);
    if(item.type==='folder'){
      const arrow=textNode('span','folder-chevron','');arrow.append(icon('chevron'));button.append(arrow);
    }
    if(item.type==='playlist'&&activeTab==='library'){
      const pin=button('pin-playlist',row,(state.pinned||[]).some(x=>x.id===item.id)?'Unpin':'Pin',event=>{
        event?.stopPropagation?.();send('togglePin',{id:item.id});
      });
      pin.setAttribute('aria-label','Pin or unpin playlist');
    }
    if(item.type==='track'&&activeTab!=='management'){
      const add=button('queue-add',row,'+ Queue',(event)=>{
        event?.stopPropagation?.();send('planTrack',{uri:item.uri});
      });
      add.title='Add to Geekify play-next plan';
    }
    if(item.type==='folder')button.addEventListener('click',()=>send('libraryFolder',{id:item.id}));
    else if(item.type==='playlist')button.addEventListener('click',()=>{
      if(activeTab==='search')send('openResult',{uri:item.uri});
      else send('playlist',{id:item.id});
    });
    else if(item.type==='device')button.addEventListener('click',()=>send('transfer',{deviceId:item.id}));
    else if(item.type==='track')button.addEventListener('click',()=>send('playItem',{uri:item.uri}));
    else button.addEventListener('click',()=>send('openResult',{uri:item.uri}));
    list.append(row);
  });
  if(!items?.length)list.append(textNode('p','secondary','No tracks here yet.'));
}
function managementSong(item,idx,planned){
  const row=textNode('div','management-song','');
  row.append(textNode('span','queue-index',String(idx+1).padStart(2,'0')));
  row.append(coverImage(item.imageUrl,'playlist-row-cover','Song cover'));
  const info=textNode('span','management-song-text','');
  info.append(textNode('strong','',item.title||'Unknown track'));
  info.append(textNode('small','',item.artist||''));
  row.append(info);
  if(planned){
    const actions=textNode('span','management-actions','');
    for(const [label,delta] of [['↑',-1],['↓',1]]){
      const b=button('mini-control',actions,label,()=>send('movePlanned',{index:idx,delta}));
      b.disabled=(idx+delta<0||idx+delta>=state.planned.length);
      b.setAttribute('aria-label',delta<0?'Move song earlier':'Move song later');
    }
    const remove=button('mini-control',actions,'×',()=>send('removePlanned',{index:idx}));
    remove.setAttribute('aria-label','Remove song from plan');row.append(actions);
  }
  return row;
}
function renderManagement(){
  paper.replaceChildren();
  paper.append(textNode('h2','title-line','MANAGEMENT'));
  paper.append(textNode('p','secondary','Spotify queue · Next five (view only)'));
  (state.queue||[]).slice(0,5).forEach((item,i)=>paper.append(managementSong(item,i,false)));
  if(!state.queue?.length)paper.append(textNode('p','secondary','No upcoming tracks reported.'));
  paper.append(textNode('h3','management-heading','YOUR PLAY-NEXT PLAN'));
  paper.append(textNode('p','secondary','Up to five tracks · Arrange locally, then add to Spotify. Existing Spotify queue cannot be reordered by its API.'));
  (state.planned||[]).forEach((item,i)=>paper.append(managementSong(item,i,true)));
  if(!state.planned?.length)paper.append(textNode('p','secondary','Add tracks from Search or Library using + Queue.'));
  const sendPlan=button('queue-send',paper,'Add plan to Spotify queue',()=>send('submitPlan'));
  sendPlan.disabled=!state.planned?.length||state.demo||state.deviceRestricted;
}
function renderSettings(){
  paper.replaceChildren();
  paper.append(textNode('h2','title-line','SPOTIFY SETTINGS'));
  paper.append(textNode('p','settings-status',state.demo?'Not connected · Demo mode':'Connected to Spotify'));
  paper.append(textNode('p','note','Playback device: '+(state.deviceName||'No active device')));
  if(state.deviceRestricted)paper.append(textNode('p','secondary','This device restricts remote playback commands.'));
  paper.append(textNode('p','secondary','In-panel audio permission: '+(state.canStream?'Authorized':'Not authorized')));
  const lyricSettings=textNode('div','lyric-settings','');
  lyricSettings.append(textNode('span','', 'Lyrics size'));
  const minus=button('lyric-zoom',lyricSettings,'A−',()=>send('lyricsSize',{size:lyricSize-2}));
  minus.setAttribute('aria-label','Decrease lyrics size');
  lyricSettings.append(textNode('span','lyric-size-value',lyricSize+'px'));
  const plus=button('lyric-zoom',lyricSettings,'A+',()=>send('lyricsSize',{size:lyricSize+2}));
  plus.setAttribute('aria-label','Increase lyrics size');
  paper.append(lyricSettings);
  paper.append(textNode('p','secondary','Changes below require Spotify playback permissions and a controllable device.'));
  const controls=textNode('div','settings-actions','');
  button('setting-control',controls,'Shuffle: '+(state.shuffle?'On':'Off'),()=>send('shuffle'));
  button('setting-control',controls,'Repeat: '+(state.repeat||'off'),()=>send('repeat'));
  button('setting-control',controls,'Refresh playback',()=>send('refresh'));
  button('setting-control',controls,'Choose a device',()=>{activeTab='devices';send('devices');redraw();});
  paper.append(controls);
}
function redraw(){
  navButtons.forEach(({id,button})=>{
    const selected=id===activeTab;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-selected',String(selected));
    button.setAttribute('tabindex',selected?'0':'-1');
  });
  const song=state.track||{};
  if(Number.isFinite(Number(state.lyricSize))&&state.lyricSize!==lyricSize){
    lyricSize=state.lyricSize;paper.style.setProperty('--lyric-size',lyricSize+'px');lyricTrackKey='';
  }
  board.classList.toggle('is-playing',Boolean(state.playing));
  title.textContent=truncate(song.title||'Nothing playing',50);
  artist.textContent=truncate(song.artist||'Search Spotify to begin',55);
  cover.src=song.imageUrl&&/^https:\/\/(?:i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9.-]+\.spotifycdn\.com|[a-z0-9.-]+\.spotify\.com)\//i.test(song.imageUrl)
    ?song.imageUrl:assets['player/default-cover'];
  connection.textContent=state.demo?'● Demo':'● '+(state.deviceName||'No active device')+(state.deviceRestricted?' (restricted)':'');
  tag.textContent=state.demo?'DEMO':'LIVE';
  transportButtons.pause.replaceChildren(icon(state.playing?'pause':'play'));
  transportButtons.pause.setAttribute('aria-label',state.playing?'Pause':'Play');
  const shuffleOn=Boolean(state.shuffle);
  transportButtons.shuffle.classList.toggle('mode-active',shuffleOn);
  transportButtons.shuffle.setAttribute('aria-pressed',String(shuffleOn));
  transportButtons.shuffle.setAttribute('aria-label',shuffleOn?'Shuffle on':'Shuffle off');
  const repeatMode=['off','context','track'].includes(state.repeat)?state.repeat:'off';
  transportButtons.repeat.classList.toggle('mode-active',repeatMode!=='off');
  transportButtons.repeat.setAttribute('aria-pressed',String(repeatMode!=='off'));
  transportButtons.repeat.setAttribute('aria-label',repeatMode==='track'?'Repeat one':repeatMode==='context'?'Repeat all':'Repeat off');
  transportButtons.repeat.dataset.mode=repeatMode;
  transportButtons.repeat.replaceChildren(icon('repeat'));
  if(repeatMode==='track'){
    const one=document.createElement('span');one.className='repeat-one-label';one.textContent='1';transportButtons.repeat.append(one);
  }
  if(activeTab==='now'){
    if(activeSub==='lyrics')renderLyrics();
  }else if(activeTab==='settings')renderSettings();
  else if(activeTab==='management')renderManagement();
  else renderList(
    (activeTab==='library'&&['library','library-liked','library-playlists','playlist'].includes(state.browseType))||(activeTab==='search'&&['search','daily','recent'].includes(state.browseType))||state.browseType===activeTab
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
// Checkpoints: refresh on focus, visibility return, and periodic active listening.
let lastSyncRequest=0;
function requestSync(){
  if(state.demo||document.hidden)return;
  const now=performance.now();
  if(now-lastSyncRequest<1800)return;
  lastSyncRequest=now;
  send('refresh');
}
window.addEventListener('focus',requestSync);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestSync();});
setInterval(requestSync,4500);
setInterval(renderProgress,350);
vscode.postMessage({type:'ready'});
