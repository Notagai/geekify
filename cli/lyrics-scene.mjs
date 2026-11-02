// Geekify's lyrics-first music desk. No mascot is drawn in this renderer.
// Foldered's wood tile and blank stationery skins are passed as image data URIs.
// Text and progress are live SVG content, not part of any background screenshot.
export const WIDTH=1200, HEIGHT=675;
export const TABS=['now','search','library','playlists','devices'];
const esc=s=>String(s??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const shorten=(s,n=40)=>{const chars=Array.from(String(s??''));return chars.length>n?chars.slice(0,n-1).join('')+'…':chars.join('');};
const R=(x,y,w,h,c,rx=0,stroke='none',sw=0)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+c+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
const P=(d,fill,stroke='none',sw=0)=>'<path d="'+d+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
const T=(x,y,str,size=18,color='#452b1e',weight=500,anchor='start')=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" font-family="Consolas,DejaVu Sans Mono,monospace" font-size="'+size+'" font-weight="'+weight+'" text-anchor="'+anchor+'">'+esc(str)+'</text>';
const I=(url,x,y,w,h)=>url?'<image href="'+esc(url)+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none"/>':'';
export const formatTime=ms=>{const s=Math.floor(Math.max(0,ms||0)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const isInside=(x,y,a)=>x>=a.x&&x<a.x+a.w&&y>=a.y&&y<a.y+a.h;
export const HIT={
  play:{x:847,y:562,w:46,h:45},
  previous:{x:794,y:566,w:44,h:43},
  next:{x:902,y:566,w:45,h:43},
  shuffle:{x:740,y:568,w:44,h:43},
  repeat:{x:956,y:568,w:44,h:43},
  heart:{x:609,y:566,w:36,h:32},
  lyrics:{x:316,y:65,w:160,h:48},
  queue:{x:476,y:65,w:148,h:48},
  info:{x:624,y:65,w:148,h:48}
};
export function hitTest(x,y,view='now'){
  for(let i=0;i<TABS.length;i++)if(isInside(x,y,{x:38,y:147+i*70,w:203,h:58}))return {type:'tab',value:TABS[i]};
  if(view==='now'){
    for(const [type,area] of Object.entries(HIT))if(isInside(x,y,area))return {type};
  }else if(isInside(x,y,{x:290,y:145,w:855,h:392})){
    const index=Math.floor((y-145)/43);
    if(index>=0&&index<9)return {type:'item',index};
  }
  return null;
}
function skyCover(){
  let svg=R(42,560,85,85,'url(#sunset)');
  svg+=P('M42 619 L66 603 L83 613 L102 590 L128 616 L128 645 L42 645Z','#45324b');
  svg+=P('M42 636 L62 622 L80 635 L101 612 L128 631 L128 645 L42 645Z','#292a41');
  for(let i=0;i<13;i++)svg+=R(43+(i*37)%83,614+(i*19)%29,2,3,'#f1ae7b');
  return svg;
}
function nav(tab,assets){
  let out='';
  out+=R(24,130,232,388,'#4f2e1c',4,'#a86a38',3);
  const names=['Now Playing','Search','Library','Playlists','Devices'];
  const glyph=['♫','⌕','▣','☷','▤'];
  for(let i=0;i<names.length;i++){
    const y=143+i*70,selected=TABS[i]===tab;
    out+=R(38,y,203,58,selected?'#c98f4d':'#e8c795',5,'#87522f',3);
    if(assets.tabInactive||assets.tabActive)out+=I(selected?assets.tabActive:assets.tabInactive,38,y,203,58);
    out+=T(55,y+38,glyph[i],26,'#5b351d',700);
    out+=T(89,y+35,names[i],17,'#3f291a',selected?800:550);
  }
  out+=T(47,500,'[?] help    [q] exit',13,'#f8deb5');
  return out;
}
function paper(){
  let out='';
  // Thick layered paper with offset shadows and a softly torn right edge.
  out+=R(281,114,881,425,'#412518',5);
  out+=P('M288 117 H1149 L1157 129 L1154 145 L1162 160 L1157 183 L1160 207 L1155 230 L1160 258 L1155 289 L1161 309 L1155 334 L1160 368 L1154 400 L1160 434 L1154 460 L1160 482 L1153 528 H289 L282 521 L284 476 L279 453 L284 427 L280 390 L285 359 L280 324 L285 291 L281 248 L285 214 L281 182 L285 154 Z','#efd6ad','#c79b6b',3);
  out+=P('M299 125 H1142 L1147 148 L1149 505 L1139 517 H298 Z','#f9e9cb');
  for(let i=0;i<7;i++){out+=R(289,156+i*51,10,18,'#543222',3);}
  // Restrained paper grain; no expensive random noise at render time.
  for(let i=0;i<108;i++){
    const x=308+(i*83)%829,y=133+(i*47)%372;
    out+=R(x,y,2+(i%3),1,i%2?'#e5cda8':'#f2dfbc');
  }
  return out;
}
function lyricsView(state){
  const prev=state.lyricsPrev||[];
  const current=state.lyricsCurrent||[];
  const next=state.lyricsNext||[];
  const hasLyrics=prev.length||current.length||next.length;
  let out='';
  if(state.subtab==='queue'||state.subtab==='info'){
    if(state.subtab==='info'){
      out+=T(339,187,'SONG INFORMATION',20,'#795338',750);
      out+=T(338,265,shorten(state.track?.title||'Nothing playing',56),25);
      out+=T(338,307,shorten(state.track?.artist||'',60),20);
      out+=T(338,343,shorten(state.track?.album||'',66),17,'#8b7154');
      out+=T(338,444,'Lyrics always open by default.',16,'#946e4d');
    }else{
      out+=T(339,190,'UP NEXT',23,'#795338',750);
      out+=T(340,255,'Queue metadata is controlled by Spotify.',19,'#71523e');
      out+=T(340,287,'Use the Spotify app to inspect your full queue.',16,'#8d7055');
    }
    return out;
  }
  if(!hasLyrics){
    out+=T(723,291,state.lyricsLoading?'Finding lyrics…':state.lyricsStatus==='missing'?'No matching lyrics for this track.':'Lyrics unavailable.',24,'#815d44',600,'middle');
    out+=T(723,335,'Your music keeps playing.',17,'#9e7e62',400,'middle');
    return out;
  }
  // Space and hierarchy belong to the lyrics, not song metadata.
  // Up to two previous, two current and two following lines, in real time.
  const preceding=prev.slice(-2),active=current.slice(0,3),following=next.slice(0,2);
  const lines=[...preceding.map(t=>({t,kind:'prev'})),...active.map(t=>({t,kind:'active'})),...following.map(t=>({t,kind:'next'}))];
  const startY=175+(7-lines.length)*16;
  lines.forEach((item,i)=>{
    const y=startY+i*61;
    if(item.kind==='active')out+=R(320,y-36,785,52,'#e9c29b',5);
    out+=T(345,y,shorten(item.t,48),item.kind==='active'?30:24,
      item.kind==='active'?'#60361e':'#987658',item.kind==='active'?800:450);
  });
  out+=R(1141,163,4,307,'#e4c49a',2);
  out+=R(1141,178,4,64,'#9b7650',2);
  return out;
}
function listView(state){
  let out='';
  const names={search:'SEARCH',library:'LIKED SONGS',playlists:state.playlistName?'PLAYLIST / '+shorten(state.playlistName,30):'YOUR PLAYLISTS',devices:'SPOTIFY DEVICES'};
  out+=T(324,177,names[state.tab]||'LIBRARY',23,'#764e30',750);
  if(state.tab==='search')out+=R(727,143,402,46,'#f4dfbf',5,'#c19c72',2)+T(742,173,state.query?'⌕ '+shorten(state.query,30):'Press / to search…',18);
  if(state.loading)return out+T(328,265,'Loading Spotify…',20);
  if(!state.items?.length)return out+T(328,265,state.demo?'Connect Spotify to browse your music.':'No items available.',20,'#88694e');
  state.items.slice(0,9).forEach((item,i)=>{
    const y=203+i*42;
    out+=R(315,y,810,39,i===state.selected?'#e1bd8d':i%2?'#f6e5c4':'#f1dbb8',3);
    out+=T(329,y+27,String((state.offset||0)+i+1).padStart(2,'0'),15,'#ae8761');
    out+=T(395,y+27,shorten(item.title,37),18,'#4d3424',i===state.selected?750:500);
    out+=T(926,y+27,shorten(item.subtitle,17),15,'#806248');
  });
  return out;
}
function bottomPlayer(state){
  const track=state.track||{};
  const ratio=Math.max(0,Math.min(1,track.durationMs?state.progressMs/track.durationMs:0));
  let out='';
  out+=R(18,539,1166,116,'#4a2818',5,'#9c6338',3);
  out+=R(28,549,1146,96,'#f2d9af',4,'#ceaa78',3);
  out+=state.coverDataUrl?I(state.coverDataUrl,43,561,82,82):skyCover();
  out+=R(42,560,85,85,'none',3,'#a8764b',3);
  out+=T(148,581,shorten(track.title||'No active track',28),20,'#4b2b1b',750);
  out+=T(148,608,shorten(track.artist||'Open Spotify to play',32),16,'#78513c');
  out+=T(148,633,shorten(track.album||'',37),13,'#9c7654');
  out+=T(492,643,formatTime(state.progressMs),13,'#78513c',700);
  out+=R(541,631,503,8,'#b58d64',4);
  out+=R(541,631,503*ratio,8,'#607c5d',4);
  out+=R(537+503*ratio,626,13,17,'#f8e9c8',2,'#7b5638',2);
  out+=T(1076,643,formatTime(track.durationMs),13,'#78513c',700);
  const control=(x,label,active=false)=>R(x,563,44,42,active?'#8c5830':'#b7844c',4,'#6f442a',3)+T(x+22,592,label,24,'#fff1d5',750,'middle');
  out+=control(739,'⤨')+control(792,'◀')+control(844,state.playing?'Ⅱ':'▶',true)+control(896,'▶')+control(948,'↻');
  out+=T(1131,586,state.demo?'DEMO':'LIVE',13,state.demo?'#9c6b48':'#57724a',750,'end');
  return out;
}
export function sceneSvg(state={},assets={}){
  const tab=state.tab||'now';
  let out='<svg xmlns="http://www.w3.org/2000/svg" width="'+WIDTH+'" height="'+HEIGHT+'" viewBox="0 0 1200 675">';
  out+='<defs><linearGradient id="sunset" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#564169"/><stop offset=".6" stop-color="#bb788c"/><stop offset="1" stop-color="#e5a06a"/></linearGradient>';
  if(assets.wood)out+='<pattern id="wood" width="386" height="386" patternUnits="userSpaceOnUse">'+I(assets.wood,0,0,386,386)+'</pattern>';
  out+='</defs>';
  out+=R(0,0,1200,675,assets.wood?'url(#wood)':'#713b20');
  out+=R(7,7,1186,661,'none',5,'#a77345',5);
  out+=R(18,14,1166,102,'#6d3e24',4,'#8d5934',2);
  out+=R(26,23,244,81,'#f0d5a8',1,'#6a3c22',4);
  out+=P('M26 23 L259 19 L268 91 L26 104Z','#f1d7aa','#a16d41',2);
  out+=I(assets.sticky,26,21,243,83);
  out+=T(45,75,'♫ geekify.',33,'#4d2d1b',800);
  out+=T(888,59,'your music desk',17,'#efd6ac',500);
  out+=R(1049,35,117,39,'#583422',2,'#a77343',2);
  out+=T(1108,60,state.demo?'◌ DEMO':'● LIVE',16,'#f3d8ad',750,'middle');
  out+=nav(tab,assets);
  out+=paper();
  if(tab==='now'){
    const active=state.subtab||'lyrics';
    const tabs=[['lyrics','Lyrics'],['queue','Queue'],['info','Info']];
    tabs.forEach(([key,label],i)=>{
      const x=316+i*153,y=67;
      out+=R(x,y,150,51,key===active?'#f8e5c3':'#ddbb8d',3,'#9e7048',3);
      if(assets.tabActive||assets.tabInactive)out+=I(key===active?assets.tabActive:assets.tabInactive,x,y,150,51);
      out+=T(x+75,y+35,label,20,'#4b3121',key===active?800:500,'middle');
    });
    out+=lyricsView(state);
  }else{
    out+=listView(state);
  }
  out+=bottomPlayer(state);
  if(state.searchActive){
    out+=R(342,208,745,80,'#fff2d9',5,'#966b43',4);
    out+=T(363,255,'SEARCH / '+shorten(state.query||'',48)+'_',23,'#4c3020',700);
  }
  if(state.status)out+=T(299,535,shorten(state.status,90),12,'#f0d2ab',600);
  out+='</svg>';
  return out;
}
