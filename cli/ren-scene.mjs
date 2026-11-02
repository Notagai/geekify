// Image-mode Geekify scene. SVG is rasterized to an inline PNG by sharp.
// All geometry is in this 1024x576 canvas, which is mapped to terminal cells.
export const SCENE_WIDTH=1024;
export const SCENE_HEIGHT=576;
export const NAV=['now','search','library','playlists','devices'];
export const HIT={
  previous:{x:593,y:423,w:50,h:48},
  playback:{x:652,y:423,w:58,h:48},
  next:{x:718,y:423,w:50,h:48},
  ren:{x:831,y:260,w:130,h:137}
};
const colors={
  dark:'#3c241d',wood:'#68432f',light:'#92633e',
  paper:'#f5e4c6',paper2:'#ead3ab',ink:'#463026',
  shadow:'#241914',green:'#56765d',red:'#a26358'
};
const xml=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clipped=(s,n=42)=>{const a=Array.from(String(s??''));return a.length>n?a.slice(0,n-1).join('')+'…':a.join('');};
const R=(x,y,w,h,fill,rx=0,stroke='none',sw=0)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
const T=(x,y,label,size=20,color=colors.ink,weight=500)=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" font-family="Consolas,DejaVu Sans Mono,monospace" font-size="'+size+'" font-weight="'+weight+'">'+xml(label)+'</text>';
export const timeLabel=ms=>{const s=Math.floor(Math.max(0,ms||0)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const pointIn=(x,y,a)=>x>=a.x&&x<a.x+a.w&&y>=a.y&&y<a.y+a.h;
export function hitTest(x,y,tab='now'){
  if(x>=32&&x<210)for(let i=0;i<NAV.length;i++)if(y>=154+i*54&&y<199+i*54)return {type:'tab',value:NAV[i]};
  if(tab==='now'){
    for(const [key,hit] of Object.entries(HIT))if(pointIn(x,y,hit))return {type:key};
  } else if(x>=255&&x<960&&y>=165&&y<493){
    const index=Math.floor((y-165)/39);
    if(index>=0&&index<8)return {type:'item',index};
  }
  return null;
}
// Ren: original 27x32 artwork. Lower-case letters are deliberately separate
// shades for hair, face, hoodie seams, hands, trousers and shoes.
const REN=[
'.........hhhhhhh...........',
'.......hhHHHHHHhh.........',
'......hHHHHHHHHHHh........',
'.....hHHHHHHHHHHHHh.......',
'.....HHHHHHHHHHHHHh.......',
'....HHHHHHHHHHHHHHHh......',
'....HHHfffffffffHHh.......',
'....HHfffffffffffHH.......',
'.....HfffeffffeffH........',
'.....HffkffffffkffH.......',
'.....HffffffffffffH.......',
'......HfffnnnnfffH........',
'.......HffffffffH.........',
'........HffffffH..........',
'.........HffffH...........',
'......ggggGGGGgggg........',
'.....gGGGGGGGGGGGgg.......',
'....gGGGGGGGGGGGGGg.......',
'....gGGGGGGGGGGGGGg.......',
'....gGGGGGggGGGGGGg.......',
'....gGGGGGggGGGGGGg.......',
'....gGGGGGggGGGGGGg.......',
'.....sssssssssssss........',
'......ppPPPPPPpp..........',
'......ppPPPPPPpp..........',
'......ppPPPPPPpp..........',
'......ppPP..PPpp..........',
'......ppPP..PPpp..........',
'......ppPP..PPpp..........',
'......bbBB..BBbb..........',
'......wwww..wwww..........',
'......wwww..wwww..........'
];
const SPRITE_COLORS={
  h:'#34343b',H:'#1d2028',f:'#efbd93',e:'#f7c9a6',
  k:'#393137',n:'#bf8c71',g:'#324a3b',G:'#57735b',
  s:'#3d5444',p:'#363a3c',P:'#525354',b:'#363c41',
  B:'#25292c',w:'#d7d4c9'
};
export function renSpriteSvg({x=834,y=257,scale=4,frame=0,blink=false}={}){
  const moving=frame%2!==0;
  let out='';
  for(let sy=0;sy<REN.length;sy++){
    const row=REN[sy];
    for(let sx=0;sx<row.length;sx++){
      const c=row[sx];
      if(!SPRITE_COLORS[c])continue;
      const dy=sy<16?(moving?-2:0):sy<23?(moving?-1:0):0;
      const dx=sy<16&&moving?1:0;
      const shade=blink&&sy===9&&c==='k'?'f':c;
      out+=R(x+(sx+dx)*scale,y+sy*scale+dy,scale,scale,SPRITE_COLORS[shade]);
    }
  }
  return out;
}
function woodGrain(){
  let out='';
  for(let i=0;i<210;i++){
    const seed=(i*9301+49297)%233280;
    const x=(seed*7)%1024,y=(i*43+(i%7)*3)%576;
    const length=22+(seed%160);
    const tone=i%3===0?'#c38c56':i%3===1?'#25190f':'#a6744e';
    out+='<path d="M'+x+' '+y+' q'+Math.floor(length/2)+' '+(i%4-2)+' '+length+' 0" fill="none" stroke="'+tone+'" stroke-width="'+(i%5===0?2:1)+'" opacity="'+(i%3===0?'.18':'.13')+'"/>';
  }
  for(let i=0;i<5;i++)out+=R(0,i*132,1024,2,'#291c15');
  return out;
}
const WOOD_GRAIN=woodGrain();
function demoArt(){
  let out='<defs><linearGradient id="demoSky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#493a57"/><stop offset=".65" stop-color="#bd7c82"/><stop offset="1" stop-color="#f0b77f"/></linearGradient></defs>';
  out+=R(283,184,228,228,'url(#demoSky)');
  out+='<circle cx="437" cy="276" r="38" fill="#f8dfad" opacity=".95"/>';
  out+='<path d="M283 357 L328 304 L371 342 L407 312 L467 365 L511 329 L511 412 L283 412Z" fill="#584760"/>';
  out+='<path d="M283 384 L327 366 L373 386 L431 352 L511 392 L511 412 L283 412Z" fill="#343d50"/>';
  for(let i=0;i<27;i++){const x=285+(i*53)%225,y=336+(i*37)%72;out+=R(x,y,2,2,'#f9cbb1');}
  return out;
}
const button=(x,y,label,active=false)=>R(x,y,46,44,active?'#56745c':'#dfc39a',10,'#ae875f',2)+T(x+11,y+28,label,19,active?'#fff5e5':'#674332',700);
function sidebar(tab){
  let out=R(25,86,194,430,'#3b291f',15,'#a6754c',2);
  out+=T(47,124,'YOUR MUSIC',16,'#d7b98c',700);
  for(let i=0;i<NAV.length;i++){
    const active=NAV[i]===tab,y=154+54*i;
    out+=R(38,y,169,45,active?'#e9cfaa':'#5b3d2a',8,active?'#d9b784':'#67442f',1);
    out+=T(53,y+29,['01  now playing','02  search','03  liked songs','04  playlists','05  devices'][i],16,active?'#513526':'#e9caa4',active?750:500);
  }
  out+=R(38,464,169,39,'#4e6a50',8);
  out+=T(55,490,'✦   REN MODE',15,'#f3e7cf',700);
  return out;
}
function listPanel({tab,items=[],selected=0,offset=0,loading=false,query='',playlistName=''}){
  const names={search:'SEARCH',library:'LIKED SONGS',playlists:playlistName?'PLAYLIST / '+clipped(playlistName,24):'YOUR PLAYLISTS',devices:'SPOTIFY DEVICES'};
  let out=T(272,144,names[tab],26,'#5b3a29',700);
  if(tab==='search')out+=R(653,112,293,37,'#f8ecd7',8,'#cda980',2)+T(668,136,query?' / '+clipped(query,26):'Press / to type a search',15,'#80644c');
  if(loading)return out+T(285,213,'Loading Spotify...',19);
  if(!items.length)return out+T(285,213,tab==='search'?'Search for a song or artist.':'Nothing to show here yet.',18);
  const shown=items.slice(0,8);
  for(let i=0;i<shown.length;i++){
    const row=shown[i],y=165+i*39;
    out+=R(270,y,678,35,i===selected?'#d3b188':i%2?'#f0ddb9':'#f6e7ca',7);
    out+=T(288,y+24,String(offset+i+1).padStart(2,'0'),14,'#9d7958',700);
    out+=T(341,y+24,clipped(row.title,44),16,'#4b3127',i===selected?750:500);
    out+=T(763,y+24,clipped(row.subtitle,18),13,'#83664f');
  }
  out+=T(281,503,'↑↓ select   Enter open   PgUp/PgDn page   Esc back',14,'#7e604b');
  return out;
}
function nowPanel({track,playing,progressMs=0,frame=0,blink=false,coverDataUrl='',lyrics=[]}){
  const title=track?.title||'Nothing playing';
  const duration=track?.durationMs||0;
  const ratio=Math.max(0,Math.min(1,duration?progressMs/duration:0));
  let out=R(268,167,256,258,'#d6b48a',9,'#ad845d',3);
  if(coverDataUrl)out+='<image x="281" y="180" width="230" height="230" preserveAspectRatio="none" image-rendering="pixelated" href="'+xml(coverDataUrl)+'"/>';
  else out+=demoArt();
  out+=T(278,446,'NOW SPINNING',15,'#9d714f',700);
  out+=T(549,222,clipped(title,25),27,'#4c2f25',750);
  out+=T(550,255,clipped(track?.artist||'geekify sessions',34),18,'#795440');
  out+=T(550,281,clipped(track?.album||'original demo',37),15,'#94755d');
  out+=R(551,305,125,30,playing?'#557b60':'#a77f56',7);
  out+=T(565,325,playing?'▶  PLAYING':'Ⅱ  PAUSED',14,'#fff2dc',700);
  out+=T(554,361,'YOUR MUSIC, YOUR SPACE',15,'#93684f');
  out+=R(550,387,375,10,'#c9a881',5);
  out+=R(550,387,375*ratio,10,'#607e5d',5);
  out+=R(550+375*ratio-5,383,12,18,'#425e44',5);
  out+=T(553,419,timeLabel(progressMs),14,'#70503d');
  out+=T(887,419,timeLabel(duration),14,'#70503d');
  // The feet overlap the fixed right end, not the moving playhead.
  out+=renSpriteSvg({x:826,y:259,scale:4,frame,blink});
  out+=button(594,431,'◀◀');
  out+=button(658,431,playing?'Ⅱ':'▶',true);
  out+=button(722,431,'▶▶');
  out+=R(281,470,657,52,'#e2c7a0',8);
  out+=T(298,491,'♪  '+clipped(lyrics[0]||'quiet nights. loud music.',65),16,'#624936');
  out+=T(320,513,clipped(lyrics[1]||'Ren has taken over the progress bar.',68),14,'#977457');
  return out;
}
export function sceneSvg(state={}){
  const tab=state.tab||'now',frame=state.frame||0;
  const status=clipped(state.status||'Space: play/pause   /: search   q: exit',98);
  let out='<svg xmlns="http://www.w3.org/2000/svg" width="'+SCENE_WIDTH+'" height="'+SCENE_HEIGHT+'" viewBox="0 0 1024 576">';
  out+='<defs><linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6c452f"/><stop offset=".55" stop-color="#865639"/><stop offset="1" stop-color="#553621"/></linearGradient></defs>';
  out+=R(0,0,1024,576,'url(#wood)')+WOOD_GRAIN;
  out+=R(12,12,1000,552,'none',19,'#a8794d',3);
  out+=R(22,18,980,55,'#442c22',11,'#b08350',2);
  out+=T(43,55,'geekify.',30,'#f3dbb5',800);
  out+=T(235,54,'/   the music desk',16,'#d1a67d');
  out+=R(833,28,150,29,state.connected?'#53705b':'#997450',7);
  out+=T(849,48,state.connected?'●  SPOTIFY LIVE':'◌  DEMO MODE',14,'#fff1d9',700);
  out+=sidebar(tab);
  out+=R(238,86,762,438,'#4c3024',14,'#b28862',3);
  out+=R(250,98,738,414,'#eed8b4',9);
  out+=R(260,108,719,43,'#f8e7ca',7);
  if(tab==='now')out+=T(278,137,'NOW PLAYING',24,'#5f4030',750);
  else out+=T(278,137,'MUSIC LIBRARY',22,'#5f4030',750);
  out+=R(23,531,978,32,'#422d22',7);
  out+=T(39,553,status,14,'#ead1ac');
  if(tab==='now')out+=nowPanel(state);
  else out+=listPanel(state);
  if(state.searchActive)out+=R(291,150,642,54,'#faf0dc',10,'#806344',3)+T(311,183,'SEARCH: '+clipped(state.query||'',53)+'_',20,'#604230',700);
  out+='</svg>';
  return out;
}
