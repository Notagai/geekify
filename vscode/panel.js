'use strict';
// Geekify's working UI is native DOM. The sprite-sheet controls were visibly
// cropped in their source PNGs, so interactive icons use complete inline SVG.
const vscode=acquireVsCodeApi();
const assets=JSON.parse(document.getElementById('assets').textContent);
const board=document.getElementById('board');
const status=document.getElementById('audioStatus');
const listen=document.getElementById('listenHere');
const NS='http://www.w3.org/2000/svg';

const companionConfig=JSON.parse(document.getElementById('companion-config')?.textContent||'null');
const companionRoot=document.getElementById('companion-root');
let companionStateHandler=null;
let companionLastState=null;
let companionSeq=0;
const companionPending=new Map();
// Panel Companion v1: neutral bridge; plugin implementations stay outside this app.
window.PanelCompanionHost={
  register({id,mount}){
    if(!companionConfig||id!==companionConfig.id||typeof mount!=='function')return;
    mount(companionRoot,{
      assets:companionConfig.assets,
      request(method,payload={}){
        if(typeof method!=='string'||method.length>64)return Promise.reject(Error('Invalid companion action'));
        return new Promise((resolve,reject)=>{
          const requestId=++companionSeq;
          const timeout=setTimeout(()=>{companionPending.delete(requestId);reject(Error('Companion request timed out'));},40000);
          companionPending.set(requestId,{resolve,reject,timeout});
          vscode.postMessage({type:'companion',id,requestId,method,payload});
        });
      },
      onPlayback(fn){companionStateHandler=typeof fn==='function'?fn:null;if(companionStateHandler&&companionLastState)companionStateHandler(companionLastState);}
    });
  }
};

// Lucide's 24px outline icon geometry, rendered locally as inline SVG.
// No remote icon font, runtime CDN dependency, or clipped sprite sheets.
const lucidePaths={
  brand:['path|M9 18V5l12-2v13','circle|6|18|3','circle|18|16|3'],
  now:['circle|12|12|10','path|M12 6v6l4 2'],
  search:['circle|11|11|8','path|m21 21-4.35-4.35'],
  library:['path|m16 6 4 14','path|M12 6v14','path|M8 8v12','path|M4 4v16'],
  folder:['path|M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  chevron:['path|m9 18 6-6-6-6'],
  management:['path|M8 6h13','path|M8 12h13','path|M8 18h13','path|M3 6h.01','path|M3 12h.01','path|M3 18h.01'],
  playlists:['path|M9 18V5l12-2v13','circle|6|18|3','circle|18|16|3'],
  devices:['rect|2|3|15|13|2','path|M7 21h5','path|M9.5 16v5','rect|19|8|3|10|1'],
  settings:['path|M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','path|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68h.01A1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9v.01A1.65 1.65 0 0 0 20.83 10H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z'],
  shuffle:['path|m18 14 4 4-4 4','path|m18 2 4 4-4 4','path|M2 18h2.5a6 6 0 0 0 5-3l5-8a6 6 0 0 1 5-3H22','path|M2 6h2.5a6 6 0 0 1 5 3l.5.8','path|m14 14 .5.8a6 6 0 0 0 5 3H22'],
  previous:['path|M19 20 9 12l10-8z','path|M5 19V5'],
  pause:['rect|6|4|4|16|1','rect|14|4|4|16|1'],
  play:['path|m6 3 14 9-14 9V3z'],
  next:['path|m5 4 10 8-10 8V4z','path|M19 5v14'],
  repeat:['path|m17 2 4 4-4 4','path|M3 11V9a3 3 0 0 1 3-3h15','path|m7 22-4-4 4-4','path|M21 13v2a3 3 0 0 1-3 3H3'],
  heart:['path|M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z']
};
function icon(name){
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.classList.add('pixel-icon');
  for(const instruction of lucidePaths[name]||lucidePaths.now){
    const [tag,...args]=instruction.split('|');
    const element=document.createElementNS(NS,tag);
    if(tag==='path')element.setAttribute('d',args[0]);
    if(tag==='circle')for(const [key,value] of [['cx',args[0]],['cy',args[1]],['r',args[2]]])element.setAttribute(key,value);
    if(tag==='rect')for(const [key,value] of [['x',args[0]],['y',args[1]],['width',args[2]],['height',args[3]],['rx',args[4]]])element.setAttribute(key,value);
    svg.append(element);
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
function playPlaylist(extra={}){
  // A real click is the user gesture required to unlock protected audio.
  // The SDK registers a Connect device even if Spotify Desktop is closed.
  if(sdkPlayer&&sdkDevice){
    void sdkPlayer.activateElement().catch(error=>{
      status.textContent='Geekify audio activation failed: '+error.message;
    });
    send('playPlaylist',{...extra,deviceId:sdkDevice});
  }else{
    send('playPlaylist',extra);
  }
}
let state={demo:true,track:null,progressMs:0,playing:false,lyrics:[],items:[],queue:[],browseType:''};
let activeTab='now',activeSub='lyrics',updatedAt=performance.now();
let sdkPlayer=null,sdkDevice=null,tokenSequence=0,lyricSignature='',lastSearch='';
let lyricSize=28;
let searchFilter='all',searchTimer=null;
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
// Decorative foliage reuses the existing pixel-art ivy asset, with no new
// downloads or overlays that can intercept controls.
const edgeFoliage=make('div','edge-foliage',board);
edgeFoliage.setAttribute('aria-hidden','true');
for(const corner of ['top-left','top-right','bottom-left','bottom-right'])
  make('span','edge-leaf edge-leaf-'+corner,edgeFoliage);
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
    if(id==='search')send('search',{query:lastSearch,source:searchFilter==='library'?'library':'spotify'});
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
let playlistSearchQuery='';
let openPlaylistMenuId=null;
let confirmingUnpinId=null;
let floatingPlaylistMenu=null;
function dismissPlaylistMenu(){
  floatingPlaylistMenu?.remove();floatingPlaylistMenu=null;
  openPlaylistMenuId=null;confirmingUnpinId=null;
}
function showPlaylistMenu(item,anchor){
  floatingPlaylistMenu?.remove();
  const pinned=(state.pinned||[]).some(x=>x.id===item.id);
  const menu=textNode('div','playlist-menu playlist-menu-floating','');
  menu.setAttribute('role','menu');
  menu.setAttribute('aria-label','Options for '+(item.title||'playlist'));
  const action=button('playlist-menu-action',menu,
    pinned?(confirmingUnpinId===item.id?'Confirm unpin':'Unpin'):'Pin',()=>{
      if(pinned&&confirmingUnpinId!==item.id){
        confirmingUnpinId=item.id;
        action.textContent='Confirm unpin';
        action.setAttribute('aria-label','Confirm unpin playlist');
        return;
      }
      dismissPlaylistMenu();
      send('togglePin',{id:item.id});
    });
  action.setAttribute('role','menuitem');
  action.setAttribute('aria-label',pinned?'Unpin playlist':'Pin playlist');
  const rect=anchor.getBoundingClientRect();
  const left=Math.max(8,Math.min(rect.right-164,window.innerWidth-172));
  const below=rect.bottom+6;
  const top=below+56>window.innerHeight?Math.max(8,rect.top-62):below;
  menu.style.setProperty('left',left+'px','important');
  menu.style.setProperty('top',top+'px','important');
  document.body.append(menu);
  floatingPlaylistMenu=menu;
}
let renderedListView='';
function renderList(items){
  const view=[activeTab,state.browseType,state.playlistId||''].join('|');
  const sameView=view===renderedListView;
  // Playback updates arrive every few seconds. Rebuilding the paper without
  // restoring both scroll containers made playlists jump to the top.
  const previousPaperScroll=sameView?paper.scrollTop:0;
  const previousList=paper.querySelector?.('.list');
  const previousListScroll=sameView&&previousList?previousList.scrollTop:0;
  renderedListView=view;
  if(!sameView)dismissPlaylistMenu();
  floatingPlaylistMenu?.remove();floatingPlaylistMenu=null;
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
    button('playlist-play',details,'▶ Play playlist',()=>playPlaylist());

    hero.append(details);paper.append(hero);
  }else paper.append(heading);
  if(activeTab==='search'){
    const input=document.createElement('input');input.className='search-input';
    input.type='search';input.placeholder='Search songs, artists, albums, playlists, podcasts and your library…';
    input.setAttribute('aria-label','Universal search');input.value=lastSearch;
    const submit=()=>send('search',{query:lastSearch,source:searchFilter==='library'?'library':'spotify'});
    input.addEventListener('input',()=>{
      lastSearch=input.value;
      if(searchTimer!==null)clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{searchTimer=null;submit();},350);
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        if(searchTimer!==null){clearTimeout(searchTimer);searchTimer=null;}
        lastSearch=input.value.trim();submit();input.blur();
      }
    });
    paper.append(input);
    const filters=textNode('div','search-filters','');
    filters.setAttribute('role','group');filters.setAttribute('aria-label','Search result filters');
    for(const [key,label] of [['all','All'],['track','Songs'],['artist','Artists'],['album','Albums'],['playlist','Playlists'],['show','Podcasts'],['episode','Episodes'],['library','Your Library']]){
      const chip=button('search-filter'+(searchFilter===key?' selected':''),filters,label,()=>{
        if(searchFilter===key)return;
        const wasLibrary=searchFilter==='library';searchFilter=key;
        if(wasLibrary!==(key==='library'))submit();
        else renderList(state.items||[]);
      });
      chip.setAttribute('aria-pressed',String(searchFilter===key));
    }
    paper.append(filters);
    if(state.browseLoading)paper.append(textNode('p','secondary','Searching…'));
    if(state.browseError)paper.append(textNode('p','note',state.browseError));
  }
  const list=textNode('div','list','');paper.append(list);
  if(activeTab==='library'&&state.browseType==='library-playlists'){
    const count=(items||[]).length;
    const statusText=state.browseLoading
      ?'Loading Spotify playlists… '+count+' received'
      :count+' playlists received from Spotify';
    list.append(textNode('p','secondary',statusText));
    if(state.browseError){
      list.append(textNode('p','note','Spotify playlist request failed: '+state.browseError));
    }else if(!count&&!state.browseLoading){
      list.append(textNode('p','note','Spotify returned no playlists for this account.'));
    }
    if(state.browseError||(!count&&!state.browseLoading))
      button('setting-control',list,'Retry loading playlists',()=>send('libraryFolder',{id:'playlists'}));
  }
  const playlistListing=activeTab==='library'&&state.browseType==='library-playlists';
  if(playlistListing){
    const search=document.createElement('input');
    search.type='search';search.className='search-input playlist-search';
    search.placeholder='Search your playlists';
    search.setAttribute('aria-label','Search your playlists');
    search.value=playlistSearchQuery;
    const applyFilter=()=>{
      playlistSearchQuery=search.value;
      const query=playlistSearchQuery.trim().toLocaleLowerCase();
      let matches=0;
      for(const row of list.querySelectorAll('.item-row')){
        const match=!query||(row.dataset.searchText||'').includes(query);
        row.hidden=!match;
        if(match)matches++;
      }
      const empty=list.querySelector('.playlist-filter-empty');
      if(empty)empty.hidden=matches>0||!query;
    };
    search.addEventListener('input',applyFilter);
    paper.insertBefore(search,list);
  }
  const visibleItems=activeTab==='search'&&searchFilter!=='all'&&searchFilter!=='library'
    ?(items||[]).filter(item=>item.type===searchFilter):(items||[]);
  (visibleItems||[]).forEach(item=>{
    const row=textNode('div','item-row','');
    if(activeTab==='search')row.dataset.searchType=item.type;
    if(playlistListing){
      row.dataset.searchText=[item.title,item.subtitle].filter(Boolean).join(' ').toLocaleLowerCase();
      row.hidden=Boolean(playlistSearchQuery.trim())&&!row.dataset.searchText.includes(playlistSearchQuery.trim().toLocaleLowerCase());
    }
    const itemButton=textNode('button','item','');
    itemButton.type='button';row.append(itemButton);
    if(item.type==='folder'){
      const folder=textNode('span','folder-icon','');folder.append(icon('folder'));itemButton.append(folder);
      itemButton.className+=' folder-item';
    }else if(['playlist','track','album','artist','show','episode'].includes(item.type)){
      itemButton.append(coverImage(item.imageUrl,'playlist-row-cover',item.type==='playlist'?'Playlist cover':'Album cover'));
    }
    const labels=textNode('span','item-labels','');
    labels.append(textNode('span','item-title',truncate(item.title,70)));
    labels.append(textNode('small','item-subtitle',truncate(item.subtitle,60)));
    itemButton.append(labels);
    if(item.type==='folder'){
      const arrow=textNode('span','folder-chevron','');arrow.append(icon('chevron'));itemButton.append(arrow);
    }
    if(item.type==='playlist'&&activeTab==='library'){
      const actions=textNode('div','playlist-actions','');
      row.append(actions);
      const menuButton=button('playlist-more',actions,'⋯',()=>{
        if(openPlaylistMenuId===item.id){dismissPlaylistMenu();return;}
        openPlaylistMenuId=item.id;confirmingUnpinId=null;
        showPlaylistMenu(item,menuButton);
      });
      menuButton.setAttribute('aria-label','Playlist options for '+(item.title||'playlist'));
      menuButton.setAttribute('aria-haspopup','menu');
      menuButton.setAttribute('aria-expanded',String(openPlaylistMenuId===item.id));
      if(openPlaylistMenuId===item.id)showPlaylistMenu(item,menuButton);
    }
    if(item.type==='track'&&activeTab!=='management'&&!(activeTab==='library'&&state.browseType==='playlist')){
      const add=button('queue-add',row,'+ Queue',(event)=>{
        event?.stopPropagation?.();send('planTrack',{uri:item.uri});
      });
      add.title='Add to Geekify play-next plan';
    }
    if(item.type==='folder')itemButton.addEventListener('click',()=>send('libraryFolder',{id:item.id}));
    else if(item.type==='playlist')itemButton.addEventListener('click',()=>{
      if(activeTab==='search')send('openResult',{uri:item.uri});
      else send('playlist',{id:item.id});
    });
    else if(item.type==='device')itemButton.addEventListener('click',()=>send('transfer',{deviceId:item.id}));
    else if(item.type==='track')itemButton.addEventListener('click',()=>{
      if(activeTab==='library'&&state.browseType==='playlist')playPlaylist({uri:item.uri});
      else send('playItem',{uri:item.uri});
    });
    else itemButton.addEventListener('click',()=>send('openResult',{uri:item.uri}));
    list.append(row);
  });
  if(playlistListing){
    const empty=textNode('p','note playlist-filter-empty','No matching playlists');
    empty.hidden=!playlistSearchQuery.trim()||items.some(item=>[item.title,item.subtitle].filter(Boolean).join(' ').toLocaleLowerCase().includes(playlistSearchQuery.trim().toLocaleLowerCase()));
    list.append(empty);
  }
  if(sameView){
    paper.scrollTop=previousPaperScroll;
    list.scrollTop=previousListScroll;
  }
  if(activeTab==='library'&&state.browseType==='playlist'&&state.browseError){
    list.append(textNode('p','note','Playlist details: '+state.browseError));
    button('setting-control',list,'Retry playlist tracks',()=>send('retryPlaylist'));
  }
  if(!visibleItems?.length&&!(activeTab==='library'&&state.browseType==='library-playlists')){
    const playlistEmpty=activeTab==='library'&&state.browseType==='playlist';
    const received=Number(state.playlistRowsReceived)||0;
    list.append(textNode('p','secondary',playlistEmpty
      ?state.browseError?'No playable tracks were recognized. See playlist details above.'
        :received?'Spotify returned '+received+' playlist entries, but none had playable track details.'
          :'Spotify returned zero playlist entries for this account or playlist.'
      :activeTab==='devices'?'No devices returned by Spotify.':activeTab==='search'?'No matching results. Try another filter or search term.':'No tracks here yet.'));
    if(playlistEmpty){
      button('setting-control',list,'Retry playlist tracks',()=>send('retryPlaylist'));
      button('setting-control',list,'Open playlist in Spotify',()=>send('openPlaylistInSpotify'));
    }
  }
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
document.addEventListener('pointerdown',event=>{
  if(!openPlaylistMenuId)return;
  if(floatingPlaylistMenu?.contains(event.target))return;
  if(event.target?.closest?.('.playlist-more'))return;
  dismissPlaylistMenu();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&openPlaylistMenuId)dismissPlaylistMenu();
});
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
  if(message.type==='companion-response'&&companionConfig&&message.id===companionConfig.id){
    const pending=companionPending.get(message.requestId);
    if(pending){clearTimeout(pending.timeout);companionPending.delete(message.requestId);
      if(message.error)pending.reject(Error(message.error));
      else pending.resolve(message.result);
    }
    return;
  }
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
    companionLastState={playing:!!message.playing,track:message.track?{id:message.track.id||null,title:message.track.title||'',artist:message.track.artist||''}:null,demo:!!message.demo};
    try{companionStateHandler?.(companionLastState);}catch{}
    if(!message.demo&&window.Spotify&&!sdkPlayer)initSdk();
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
