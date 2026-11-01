import { PixelScene } from './scene.js';
import { fetchLyrics, lyricIndex } from './lyrics.js';
import { redirectUri, getClientId, beginSpotifyLogin, completeSpotifyLogin, disconnectSpotify, getSpotifyPlayback, hasSpotifySession } from './spotify.js';

const $ = (id) => document.getElementById(id);
const DOM = {
  world:$('world'), stage:$('stage-status'), prev:$('lyric-prev'), current:$('lyric-current'), next:$('lyric-next'), note:$('stage-note'),
  demoCta:$('demo-cta'), play:$('play-btn'), song:$('song-title'), artist:$('song-artist'), cover:$('cover-art'),
  time:$('time-current'), duration:$('time-duration'), fill:$('timeline-fill'), knob:$('timeline-knob'), timeline:$('timeline'),
  source:$('source-tag'), live:$('live-pill-text'), connection:$('connection-label'), toast:$('toast'),
  panel:$('settings-panel'), scrim:$('panel-scrim'), settings:$('settings-btn'), close:$('close-settings'),
  full:$('fullscreen-btn'), intensity:$('intensity'), intensityValue:$('intensity-value'), lyrics:$('show-lyrics'),
  reduced:$('reduced-motion'), spotifyId:$('spotify-client-id'), redirect:$('redirect-uri'),
  connect:$('connect-spotify'), disconnect:$('disconnect-spotify'), demoMode:$('demo-mode-btn')
};

const sampleTrack = { id:'geekify-demo', title:'Midnight Frequency', artist:'geekify sessions', primaryArtist:'geekify sessions', album:'unreleased transmissions', durationMs:136000, imageUrl:'' };
// These demo lines are original to geekify. No third-party song text is bundled.
const sampleLyrics = [
  [0,'the city is still awake'], [7600,'and so are we'], [14900,'a thousand little lights'],
  [23200,'in places we could be'], [31300,'somewhere past the skyline'], [40300,'where the colors fade'],
  [48600,'we could stay forever'], [57400,'in this midnight haze'], [65900,'let the world move slowly'],
  [75500,'and the shadows shine'], [84000,'everything feels different'], [93000,'on borrowed time'],
  [102500,'this is our frequency'], [113000,'a little out of phase'],
  [123000,'until the morning finds us']
].map(([timeMs,text])=>({timeMs,text}));

const allowedScenes = ['city','dusk','orbit'];
function stored(key,fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function persist(key,value) { try { localStorage.setItem(key,String(value)); } catch {} }
const state = {
  mode:'demo', scene:allowedScenes.includes(stored('geekify.scene','city'))?stored('geekify.scene','city'):'city',
  intensity:Number(stored('geekify.intensity','65'))/100, reduced:stored('geekify.reduced','false')==='true',
  showLyrics:stored('geekify.lyrics','true')==='true',
  demoPlaying:false, demoOffset:0, demoAnchor:performance.now(),
  spotifyTrack:null, spotifyAnchor:0, spotifyProgress:0, spotifyLyrics:null, lyricsLoading:false,
  spotifyPoll:null, pollDelay:5000, lyricAbort:null, lastLine:'', lastUiUpdate:0, toastTimeout:null, requestInFlight:false
};
const scene = new PixelScene(DOM.world);
function formatTime(ms) {
  if (!Number.isFinite(ms)) return '0:00';
  const seconds=Math.max(0,Math.floor(ms/1000));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function notify(message) {
  DOM.toast.textContent=message;
  DOM.toast.classList.add('visible');
  clearTimeout(state.toastTimeout);
  state.toastTimeout=setTimeout(()=>DOM.toast.classList.remove('visible'),4900);
}
function openSettings(open) {
  DOM.panel.classList.toggle('open',open);
  DOM.panel.setAttribute('aria-hidden',String(!open));
  DOM.settings.setAttribute('aria-expanded',String(open));
  DOM.scrim.hidden=!open;
  if(open) DOM.close.focus(); else DOM.settings.focus();
}
function setScene(next) {
  if (!allowedScenes.includes(next)) return;
  state.scene=next;persist('geekify.scene',next);
  document.querySelectorAll('.scene-option').forEach(button=>button.classList.toggle('selected',button.dataset.scene===next));
  scene.last=-1;
}
function progressMs() {
  if(state.mode==='demo') {
    const value=state.demoOffset+(state.demoPlaying?(performance.now()-state.demoAnchor):0);
    return ((value%sampleTrack.durationMs)+sampleTrack.durationMs)%sampleTrack.durationMs;
  }
  if(!state.spotifyTrack)return 0;
  return Math.max(0,Math.min(state.spotifyTrack.durationMs,state.spotifyProgress+(state.spotifyTrack.isPlaying?(performance.now()-state.spotifyAnchor):0)));
}
function currentTrack() {return state.mode==='demo'?sampleTrack:state.spotifyTrack;}
function isPlaying() {return state.mode==='demo'?state.demoPlaying:Boolean(state.spotifyTrack?.isPlaying);}
function demoStart() {
  state.demoAnchor=performance.now();
  state.demoPlaying=true;
  DOM.demoCta.hidden=true;
  renderPlayerInfo();
}
function toggleDemo() {
  if(state.mode!=='demo')return;
  if(state.demoPlaying){state.demoOffset=progressMs();state.demoPlaying=false;}
  else {state.demoAnchor=performance.now();state.demoPlaying=true;DOM.demoCta.hidden=true;}
  renderPlayerInfo();
}
function setDemoMode() {
  state.mode='demo';state.spotifyTrack=null;state.spotifyLyrics=null;state.lastLine='';
  clearTimeout(state.spotifyPoll);state.spotifyPoll=null;
  if(state.lyricAbort)state.lyricAbort.abort();
  disconnectSpotify();
  DOM.demoCta.hidden=state.demoPlaying;
  document.body.classList.remove('auth-mode');
  DOM.connect.hidden=false;DOM.disconnect.hidden=true;
  renderPlayerInfo();notify('Demo mode enabled. No Spotify account required.');
}
function renderPlayerInfo() {
  const track=currentTrack();
  document.body.classList.toggle('auth-mode',state.mode==='spotify');
  document.body.classList.toggle('paused',!isPlaying());
  DOM.connection.innerHTML='';
  const dot=document.createElement('span');dot.className='connection-circle';DOM.connection.append(dot);
  DOM.connection.append(document.createTextNode(state.mode==='spotify'?' SPOTIFY CONNECTED':' DEMO MODE'));
  DOM.song.textContent=track?.title || 'Nothing playing';
  DOM.artist.textContent=track?.artist || 'Open Spotify and start a song';
  DOM.source.textContent=state.mode==='spotify'?'SPOTIFY // LIVE CONNECTION':'SAMPLE TRANSMISSION // 01';
  DOM.live.textContent=isPlaying()?'LIVE VISUALS':'AMBIENT MODE';
  DOM.play.textContent=state.demoPlaying?'Ⅱ':'▶';
  DOM.play.setAttribute('aria-label',state.demoPlaying?'Pause demo':'Play demo');
  DOM.duration.textContent=formatTime(track?.durationMs || 0);
  DOM.disconnect.hidden=state.mode!=='spotify';
  DOM.connect.hidden=state.mode==='spotify';
  DOM.demoCta.hidden=state.mode!=='demo'||state.demoPlaying;
  if(track?.imageUrl){
    try {
      const u=new URL(track.imageUrl);
      DOM.cover.style.backgroundImage=u.protocol==='https:'?'url('+JSON.stringify(u.toString())+')':'';
      DOM.cover.firstElementChild.hidden=true;
    } catch { DOM.cover.style.backgroundImage='';DOM.cover.firstElementChild.hidden=false; }
  } else {
    DOM.cover.style.backgroundImage='';
    DOM.cover.firstElementChild.hidden=false;
  }
}
function writeLine(previous,current,next) {
  const signature=[previous,current,next].join('\u0000');
  if(state.lastLine===signature)return;
  state.lastLine=signature;
  DOM.prev.textContent=previous;
  DOM.current.textContent=current;
  DOM.next.textContent=next;
  if(!state.reduced && DOM.current.animate) {
    DOM.current.animate([{opacity:.35,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:410,easing:'ease-out'});
  }
}
function renderLyrics() {
  document.body.classList.toggle('hide-lyrics',!state.showLyrics);
  if(state.mode==='demo'&&!state.demoPlaying&&state.demoOffset===0){
    DOM.stage.textContent='A LITTLE BIT OF MAGIC';
    DOM.note.textContent="A visual space for whatever's playing.";
    writeLine('welcome to your after hours','your music, reimagined.','press play to get lost in it');
    return;
  }
  if(state.mode==='spotify'&&!state.spotifyTrack) {
    DOM.stage.textContent='AWAITING TRANSMISSION';
    DOM.note.textContent='Open Spotify on any device and play a song.';
    writeLine('we are tuned in','nothing playing yet','your next track is the signal');
    return;
  }
  const track=currentTrack();
  const lines=state.mode==='demo'?sampleLyrics:state.spotifyLyrics;
  DOM.stage.textContent=state.mode==='demo'?'ORIGINAL DEMO / NOW PLAYING':'LIVE FROM YOUR SPOTIFY';
  if(state.mode==='spotify'&&state.lyricsLoading) {
    DOM.note.textContent='Looking for synchronized lyrics…';
    writeLine(track.artist,'finding the words…',track.title);return;
  }
  if(!lines?.length) {
    DOM.note.textContent=state.mode==='spotify'?'No synced lyrics found for this track. Enjoy the view.':'';
    writeLine('you are listening to',track.title,track.artist);return;
  }
  DOM.note.textContent=state.mode==='demo'?'An original sample sequence for previewing the experience.':'Lyrics provided by LRCLIB when available.';
  const at=lyricIndex(lines,progressMs());
  if(at<0){writeLine('', 'the next line is coming…',lines[0].text);return;}
  writeLine(lines[at-1]?.text||'',lines[at].text,lines[at+1]?.text||'');
}

async function lyricsForTrack(track){
  if(state.lyricAbort)state.lyricAbort.abort();
  const controller=new AbortController();
  state.lyricAbort=controller;
  state.spotifyLyrics=null;state.lyricsLoading=true;state.lastLine='';
  try {
    const lines=await fetchLyrics(track,controller.signal);
    if(!controller.signal.aborted&&state.spotifyTrack?.id===track.id)state.spotifyLyrics=lines;
  } catch(error) {
    if(error.name!=='AbortError') notify('Lyrics lookup unavailable. The visualizer still works.');
  } finally {
    if(!controller.signal.aborted){state.lyricsLoading=false;state.lastLine='';}
  }
}
function queuePoll(delay=state.pollDelay) {
  clearTimeout(state.spotifyPoll);
  if(state.mode!=='spotify')return;
  state.spotifyPoll=setTimeout(pollSpotify,delay);
}
async function pollSpotify(){
  if(state.mode!=='spotify'||state.requestInFlight)return;
  state.requestInFlight=true;
  let delay=5000;
  try{
    const track=await getSpotifyPlayback();
    if(state.mode!=='spotify')return;
    const oldId=state.spotifyTrack?.id;
    state.spotifyTrack=track;
    state.spotifyAnchor=performance.now();
    state.spotifyProgress=track?.progressMs||0;
    if(track?.id!==oldId) {
      if(state.lyricAbort)state.lyricAbort.abort();
      state.spotifyLyrics=null;state.lyricsLoading=false;state.lastLine='';
      if(track)void lyricsForTrack(track);
    }
    renderPlayerInfo();
  }catch(error){
    if(error.retryAfter)delay=error.retryAfter*1000;
    else delay=10000;
    notify(error.message||'Could not check Spotify playback.');
    if(/session.*ended|session expired/i.test(error.message||''))setDemoMode();
  }finally{
    state.requestInFlight=false;
    if(state.mode==='spotify')queuePoll(delay);
  }
}
async function connectSpotify(){
  const id=DOM.spotifyId.value.trim();
  DOM.connect.disabled=true;
  try{await beginSpotifyLogin(id);}
  catch(error){notify(error.message||'Could not open Spotify sign-in.');DOM.connect.disabled=false;}
}
function enterSpotifyMode(){
  state.mode='spotify';state.spotifyTrack=null;state.spotifyLyrics=null;state.lyricsLoading=false;state.lastLine='';
  DOM.demoCta.hidden=true;
  renderPlayerInfo();
  queuePoll(0);
}
function tick(ms){
  scene.draw(ms,state.scene,state.intensity,!isPlaying(),state.reduced);
  if(ms-state.lastUiUpdate>90){
    state.lastUiUpdate=ms;
    const track=currentTrack();
    const position=progressMs();
    const fraction=track?.durationMs?Math.min(100,position/track.durationMs*100):0;
    DOM.time.textContent=formatTime(position);
    DOM.fill.style.width=fraction+'%';
    DOM.knob.style.left=fraction+'%';
    renderLyrics();
  }
  requestAnimationFrame(tick);
}
function bind(){
  DOM.settings.addEventListener('click',()=>openSettings(true));
  DOM.close.addEventListener('click',()=>openSettings(false));
  DOM.scrim.addEventListener('click',()=>openSettings(false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&DOM.panel.classList.contains('open'))openSettings(false);});
  DOM.full.addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{notify('Fullscreen is not available in this browser.');}
  });
  DOM.demoCta.addEventListener('click',demoStart);
  DOM.play.addEventListener('click',toggleDemo);
  DOM.timeline.addEventListener('click',event=>{
    if(state.mode!=='demo')return;
    const rect=DOM.timeline.getBoundingClientRect();
    state.demoOffset=Math.min(sampleTrack.durationMs-1,Math.max(0,(event.clientX-rect.left)/rect.width*sampleTrack.durationMs));
    state.demoAnchor=performance.now();state.lastLine='';
  });
  document.querySelectorAll('.scene-option').forEach(button=>button.addEventListener('click',()=>setScene(button.dataset.scene)));
  DOM.intensity.addEventListener('input',()=>{
    state.intensity=Number(DOM.intensity.value)/100;
    DOM.intensityValue.textContent=DOM.intensity.value+'%';
    persist('geekify.intensity',DOM.intensity.value);
    if(state.reduced)scene.last=-1;
  });
  DOM.lyrics.addEventListener('change',()=>{state.showLyrics=DOM.lyrics.checked;persist('geekify.lyrics',state.showLyrics);});
  DOM.reduced.addEventListener('change',()=>{state.reduced=DOM.reduced.checked;persist('geekify.reduced',state.reduced);scene.last=-1;});
  DOM.connect.addEventListener('click',connectSpotify);
  DOM.disconnect.addEventListener('click',setDemoMode);
  DOM.demoMode.addEventListener('click',setDemoMode);
}
async function init(){
  setScene(state.scene);
  DOM.intensity.value=Math.round(state.intensity*100);
  DOM.intensityValue.textContent=DOM.intensity.value+'%';
  DOM.lyrics.checked=state.showLyrics;
  DOM.reduced.checked=state.reduced;
  DOM.spotifyId.value=getClientId();
  DOM.redirect.textContent=redirectUri();
  bind();renderPlayerInfo();
  requestAnimationFrame(tick);
  try{
    if(await completeSpotifyLogin()){enterSpotifyMode();notify('Connected! Start playing a song in Spotify.');}
    else if(hasSpotifySession())enterSpotifyMode();
  }catch(error){disconnectSpotify();notify(error.message||'Spotify sign-in failed.');}
}
void init();
