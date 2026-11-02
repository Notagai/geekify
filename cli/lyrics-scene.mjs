// Geekify's original modular pixel-art interface, assembled from independently
// generated and cleaned PNG assets. Song data, labels and lyrics stay dynamic.
// This renderer deliberately contains no Ren/Reina character sprite.
export const WIDTH=1200, HEIGHT=675;
export const TABS=['now','search','library','playlists','devices','settings'];
const escapeXml=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const shorten=(value,limit=40)=>{const ch=Array.from(String(value??''));return ch.length>limit?ch.slice(0,limit-1).join('')+'…':ch.join('');};
const image=(uri,x,y,w,h)=>uri?`<image href="${escapeXml(uri)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" image-rendering="pixelated"/>`:'';
const rect=(x,y,w,h,color,rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}"/>`;
const text=(x,y,label,size=19,color='#492a19',weight=500,anchor='start')=>`<text x="${x}" y="${y}" font-family="Consolas,'DejaVu Sans Mono',monospace" font-weight="${weight}" font-size="${size}" text-anchor="${anchor}" fill="${color}">${escapeXml(label)}</text>`;
const A=(assets,key,x,y,w,h)=>image(assets?.[key],x,y,w,h);
const HIT={
  play:{x:856,y:556,w:71,h:73},previous:{x:800,y:568,w:59,h:51},
  next:{x:932,y:568,w:59,h:51},shuffle:{x:745,y:567,w:59,h:51},
  repeat:{x:991,y:567,w:59,h:51},heart:{x:449,y:546,w:43,h:42},
  lyrics:{x:304,y:78,w:146,h:50},queue:{x:451,y:78,w:144,h:50},
  info:{x:598,y:78,w:139,h:50}
};
export function hitTest(x,y,tab='now'){
  for(let i=0;i<TABS.length;i++)if(x>=45&&x<=237&&y>=135+i*48&&y<=178+i*48)return {type:'tab',value:TABS[i]};
  if(tab==='now'){
    // Seek bar is independent of the playback buttons and uses actual artwork bounds.
    if(x>=246&&x<=629&&y>=603&&y<=640){
      return {type:'seek',ratio:Math.max(0,Math.min(1,(x-247)/380))};
    }
    for(const [type,h] of Object.entries(HIT))if(x>=h.x&&x<h.x+h.w&&y>=h.y&&y<h.y+h.h)return {type};
  }else if(x>=319&&x<1129&&y>=188&&y<476){
    // List baselines are 214, 246, 278...; nine 32px rows.
    const index=Math.floor((y-188)/32);
    if(index>=0&&index<9)return {type:'item',index};
  }
  return null;
}
export const formatTime=ms=>{const sec=Math.floor(Math.max(0,ms||0)/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;};
function frame(assets){
  let s=rect(0,0,1200,675,'#713b20');
  if(assets?.['frame/wood-tile']){
    s=`<defs><pattern id="geekify-wood" patternUnits="userSpaceOnUse" width="256" height="256">${A(assets,'frame/wood-tile',0,0,256,256)}</pattern></defs>`+rect(0,0,1200,675,'url(#geekify-wood)');
  }
  // Keep the actual textured wood surface visible between paper elements.
  // The original pixel-art frame pieces overlay the wood. Corners and edges
  // remain individual textures; these are NOT plain border rectangles.
  s+=A(assets,'frame/edge-top',42,4,1116,33);
  s+=A(assets,'frame/edge-bottom',40,640,1120,31);
  s+=A(assets,'frame/edge-left',1,41,34,602);
  s+=A(assets,'frame/edge-right',1161,40,39,606);
  s+=A(assets,'frame/corner-tl',0,0,73,70);
  s+=A(assets,'frame/corner-tr',1127,0,73,70);
  s+=A(assets,'frame/corner-bl',0,600,73,75);
  s+=A(assets,'frame/corner-br',1127,600,73,75);
  return s;
}
function nav(state,assets){
  let s='';
  const labels=['Now Playing','Search','Library','Playlists','Devices','Settings'];
  const icons=['icon-now','icon-search','icon-library','icon-playlists','icon-devices','icon-settings'];
  for(let i=0;i<labels.length;i++){
    const y=133+i*48,sel=state.tab===TABS[i];
    s+=A(assets,sel?'sidebar/button-active':'sidebar/button-idle',43,y,195,47);
    s+=A(assets,'sidebar/'+icons[i],56,y+10,27,27);
    s+=text(94,y+31,labels[i],17,sel?'#fff0d4':'#432816',sel?750:650);
  }
  return s;
}
function pageTabs(state,assets){
  let s='';
  for(let i=0;i<3;i++){
    const name=['lyrics','queue','info'][i],x=303+i*143;
    s+=A(assets,state.subtab===name?'paper/tab-active':'paper/tab-inactive',x,77,144,54);
    s+=text(x+72,111,name[0].toUpperCase()+name.slice(1),20,'#472a1e',state.subtab===name?800:500,'middle');
  }
  return s;
}
function lyricMarkup(state){
  if(state.subtab==='info'){
    let s=text(340,186,'SONG INFORMATION',23,'#70442b',750);
    s+=text(340,255,shorten(state.track?.title||'Nothing playing',45),27,'#4d2a1d',700);
    s+=text(340,305,shorten(state.track?.artist||'',56),21,'#835b45');
    s+=text(340,347,shorten(state.track?.album||'',60),18,'#906e54');
    s+=text(340,422,'Lyrics remain the default view.',17,'#987a61');
    return s;
  }
  if(state.subtab==='queue'){
    let s=text(340,181,'UP NEXT',24,'#70442b',800);
    if(state.queueLoading)return s+text(340,250,'Loading your Spotify queue…',20,'#78523a');
    const queued=state.queueItems||[];
    if(!queued.length)return s+text(340,250,shorten(state.queueNotice||'Your queue is empty.',64),18,'#78523a')
      +text(340,288,'Press U to refresh.',16,'#987a61');
    queued.slice(0,7).forEach((item,i)=>{
      const y=219+i*40;
      s+=text(340,y,String(i+1).padStart(2,'0'),16,'#a77a54');
      s+=text(399,y,shorten(item.title,36),19,'#4e3022',650);
      s+=text(973,y,shorten(item.subtitle,18),14,'#8e6b54');
    });
    return s+text(1092,493,'U refresh',14,'#987a61',500,'end');
  }
  const prev=state.lyricsPrev||[],current=state.lyricsCurrent||[],next=state.lyricsNext||[];
  if(!prev.length&&!current.length&&!next.length){
    return text(715,277,state.lyricsLoading?'Finding lyrics…':'Lyrics unavailable for this track.',23,'#906345',550,'middle')+
      text(715,312,'Your music keeps playing.',17,'#a58569',450,'middle');
  }
  // Synced lyric hierarchy: earlier lines sit above the highlighted lyric, and
  // incoming lines are below it. Separate timing drives real highlighting.
  let groups=[
    ...prev.slice(-2).map(t=>({value:t,active:false})),
    ...current.slice(0,3).map(t=>({value:t,active:true})),
    ...next.slice(0,2).map(t=>({value:t,active:false}))
  ];
  groups=groups.slice(0,7);
  let s='',firstY=195+Math.max(0,5-groups.length)*29;
  for(const [i,g] of groups.entries()){
    const y=firstY+i*46;
    if(g.active){
      // Hand-torn paint stroke, deliberately not a straight filled rectangle.
      s+=`<path d="M327 ${y-30} l18 -5 65 4 70 -2 73 3 60 -5 71 4 60 -3 71 5 23 -3 20 8 -12 5 10 8 -24 6 -51 -2 -66 3 -82 -3 -74 4 -70 -2 -77 2 -35 -6Z" fill="#e7b285" opacity=".60"/>`;
    }
    s+=text(347,y,shorten(g.value,46),g.active?27:24,g.active?'#522b1c':'#74503b',g.active?760:500);
  }
  // Scroll thumb from the independently cropped pixel-art UI pack.
  s+=A(state.assets,'frame/edge-right',1131,176,8,222);
  if(state.lyricsStatus==='plain')s+=text(1095,474,'UNSYNCED LYRICS',14,'#997158',650,'end');
  return s;
}
function listMarkup(state){
  const names={search:'SEARCH',library:'LIKED SONGS',playlists:state.playlistName?'PLAYLIST / '+shorten(state.playlistName,28):'YOUR PLAYLISTS',devices:'SPOTIFY DEVICES',settings:'SETTINGS'};
  let s=text(330,173,names[state.tab]||'LIBRARY',25,'#70452e',760);
  if(state.tab==='settings')return s+
      text(330,253,'The interface uses original Geekify pixel artwork.',20)+
      text(330,295,'Press 1-5 to browse Spotify, or q to exit.',18,'#8c674c')+
      text(330,335,'Character sprites are intentionally disabled.',18,'#8c674c');
  if(state.tab==='search')s+=text(711,173,state.query?'⌕ '+shorten(state.query,26):'Press / to search',18,'#8a5c40');
  if(state.loading)return s+text(331,239,'Loading Spotify…',21);
  if(!state.items?.length)return s+text(331,251,state.demo?'Connect Spotify to browse music.':'Nothing to show here yet.',20,'#8a654c');
  for(const [i,item] of state.items.slice(0,9).entries()){
    const y=214+i*32;
    if(i===state.selected){s+=`<path d="M324 ${y-27} l28 -4 155 2 172 -2 159 3 175 -2 107 3 0 25 -149 1 -189 -2 -165 3 -182 -2 -111 1Z" fill="#e6c093" opacity=".72"/>`;}
    s+=text(342,y,String((state.offset||0)+i+1).padStart(2,'0'),15,'#a87d54');
    s+=text(402,y,shorten(item.title,37),19,'#4e3022',i===state.selected?760:500);
    s+=text(964,y,shorten(item.subtitle,17),14,'#8e6b54');
  }
  return s;
}
function player(state,assets){
  const track=state.track||{},ratio=Math.max(0,Math.min(1,track.durationMs?state.progressMs/track.durationMs:0));
  let s=A(assets,'paper/player-panel',29,528,1141,127);
  // Album frame has a transparent centre; actual song artwork remains dynamic.
  s+=image(state.coverDataUrl||assets['player/default-cover'],80,546,88,88);
  s+=A(assets,'player/album-frame',74,541,102,104);
  s+=text(194,565,shorten(track.title||'Nothing playing',24),22,'#4b2c1a',790);
  s+=text(194,588,shorten(track.artist||'Open Spotify to begin',27),16,'#65432f');
  s+=A(assets,'player/heart',452,548,31,29);
  s+=text(192,631,formatTime(state.progressMs),15,'#5e3a28',600);
  s+=A(assets,'player/progress-empty',246,604,383,36);
  if(ratio>0) {
    // Clip the generated wood-fill sprite instead of drawing a square bar.
    s+=`<clipPath id="geekify-progress-clip"><rect x="247" y="604" width="${Math.max(1,380*ratio)}" height="36"/></clipPath>`;
    s+=`<g clip-path="url(#geekify-progress-clip)">${A(assets,'player/progress-fill',247,604,380,36)}</g>`;
  }
  s+=A(assets,'player/progress-knob',242+376*ratio,608,30,30);
  s+=text(648,631,formatTime(track.durationMs),15,'#5e3a28',600);
  s+=A(assets,'player/shuffle',742,561,54,52);
  s+=A(assets,'player/previous',800,561,55,52);
  s+=A(assets,'player/pause',860,554,67,68);
  if(!state.playing){
    // A play glyph is an overlay, not a newly fabricated square button.
    s+=`<path d="M890 574 L890 602 L912 588Z" fill="#fff0d5" stroke="#684020" stroke-width="2"/>`;
  }
  s+=A(assets,'player/next',934,561,56,52);
  s+=A(assets,'player/repeat',992,561,56,52);
  s+=text(1134,597,state.demo?'DEMO':'LIVE',15,state.demo?'#8c6744':'#57744e',750,'end');
  return s;
}
export function sceneSvg(state={},assets={}){
  const view=state.tab||'now',subtab=state.subtab||'lyrics';
  const st={...state,tab:view,subtab,assets};
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`;
  s+=frame(assets);
  s+=A(assets,'branding/logo-tag',49,12,232,97);
  s+=A(assets,'decor/vine',5,0,103,145);
  s+=A(assets,'decor/flowers',15,409,115,109);
  s+=A(assets,'decor/polaroid',124,405,111,104);
  s+=nav(st,assets);
  s+=A(assets,'paper/lyrics-panel',266,78,900,436);
  if(view==='now'){
    s+=pageTabs(st,assets);
    s+=lyricMarkup(st);
  }else s+=listMarkup(st);
  s+=A(assets,'decor/tape',1018,85,115,68);
  s+=player(st,assets);
  if(st.status){
    // Errors and control feedback must be visible, not silently stored in state.
    s+=rect(531,24,596,40,'#f1c79b',5);
    s+=text(549,50,shorten(st.status,69),17,'#57301d',700);
  }else{
    s+=text(886,52,st.demo?'● Demo':'● Spotify',16,'#efdfc0',650);
  }
  if(st.searchActive){
    // A soft torn-note highlight over the fixed background; content remains live.
    s+=A(assets,'paper/tab-active',306,209,679,76);
    s+=text(346,252,'SEARCH / '+shorten(st.query||'',39)+'_',22,'#4d311d',700);
  }
  s+='</svg>';
  return s;
}
