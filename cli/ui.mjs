import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { login, logout, isConnected, loadConfig } from './auth.mjs';
import { SpotifyApi, trackInfo } from './spotify.mjs';
import { lookupLyrics, lyricIndex } from '../src/lyrics.js';

const ESC='\x1b[';
const CODE={reset:'\x1b[0m',base:'\x1b[38;2;224;220;238m',muted:'\x1b[38;2;145;141;171m',
  bright:'\x1b[38;2;255;241;225m',pink:'\x1b[38;2;247;161;198m',mint:'\x1b[38;2;128;237;185m',
  warning:'\x1b[38;2;255;197;116m',violet:'\x1b[38;2;187;156;255m',selected:'\x1b[48;2;54;44;79m\x1b[38;2;255;235;246m'};
const DEMO_TRACK={
  id:'geekify-demo',uri:null,title:'Midnight Frequency',artist:'geekify sessions',
  primaryArtist:'geekify sessions',durationMs:136000,album:'unreleased transmissions'
};
const DEMO_LYRICS=[[0,'the city is still awake'],[7600,'and so are we'],[14900,'a thousand little lights'],
  [23200,'in places we could be'],[31300,'somewhere past the skyline'],[40300,'where the colors fade'],
  [48600,'we could stay forever'],[57400,'in this midnight haze'],[65900,'let the world move slowly'],
  [75500,'and the shadows shine'],[84000,'everything feels different'],[93000,'on borrowed time'],
  [102500,'this is our frequency'],[113000,'a little out of phase'],[123000,'until the morning finds us']]
  .map(([timeMs,text])=>({timeMs,text}));
const tabs=['now','search','library','playlists','devices'];
const trim=(text,length)=>{
  const chars=Array.from(String(text??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' '));
  return chars.length>length?chars.slice(0,Math.max(0,length-1)).join('')+'…':chars.join('');
};
const widthOf=text=>Array.from(String(text)).length;
const pad=(text,length)=>trim(text,length)+' '.repeat(Math.max(0,length-widthOf(trim(text,length))));
const clock=ms=>{
  const s=Math.floor(Math.max(0,ms||0)/1000);
  return String(Math.floor(s/60))+':'+String(s%60).padStart(2,'0');
};
const itemLabel=item=>{
  if(item?.type==='playlist')return item.name+'   ·   '+(item.items?.total??item.tracks?.total??'?')+' songs';
  if(item?.type==='device')return item.name+'  /  '+item.type+(item.is_active?'  [ACTIVE]':'');
  const t=trackInfo(item);
  return t?t.title+'   /   '+t.artist:'Unavailable track';
};
export class GeekifyTui {
  constructor({demo=false}={}){
    this.api=new SpotifyApi();
    this.demo=demo||!isConnected();
    this.tab='now';this.playing=false;this.current=this.demo?DEMO_TRACK:null;
    this.demoStarted=performance.now();this.demoOffset=0;
    this.playback=null;this.progressAnchor=performance.now();
    this.trackKey='';this.lyrics={lines:[],plain:[],status:'missing'};
    this.lyricPending=false;this.abortLyrics=null;this.lyricRequest=0;this.plainOffset=0;
    this.items=[];this.selected=0;this.offset=0;this.total=0;this.searchQuery='';
    this.playlist=null;this.busy=false;this.message='';this.messageUntil=0;
    this.prompt=null;this.help=false;this.running=false;this.timer=null;this.refreshTimer=null;
    this.rows=[];this.pollDelay=6000;this.loadingList=false;
  }
  alert(message,seconds=6){this.message=String(message);this.messageUntil=Date.now()+seconds*1000;this.draw();}
  async run(){
    if(!stdin.isTTY||!stdout.isTTY)throw new Error('geekify needs an interactive terminal. Use "geekify --help" for commands.');
    this.running=true;
    this.enterScreen();
    this.keyListener=data=>{void this.handleInput(data).catch(error=>this.alert(error.message));};
    stdin.on('data',this.keyListener);
    this.resizeListener=()=>{this.rows=[];this.draw();};
    stdout.on('resize',this.resizeListener);
    this.timer=setInterval(()=>this.draw(),300);
    this.draw();
    if(!this.demo)void this.refreshPlayback();
    else this.alert('Demo mode: connect with [c] for your real Spotify account.',8);
    await new Promise(resolve=>{this.onExit=resolve;});
  }
  enterScreen(){
    stdout.write('\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J');
    stdin.setRawMode(true);stdin.resume();
  }
  leaveScreen(){
    try{stdin.setRawMode(false);}catch{}
    stdout.write('\x1b[?25h\x1b[?1049l'+CODE.reset);
  }
  quit(){
    if(!this.running)return;this.running=false;
    clearTimeout(this.refreshTimer);clearInterval(this.timer);
    this.abortLyrics?.abort();
    stdin.off('data',this.keyListener);
    stdout.off('resize',this.resizeListener);
    this.leaveScreen();
    this.onExit?.();
  }
  async commandLogin(){
    clearTimeout(this.refreshTimer);
    stdin.off('data',this.keyListener);
    this.leaveScreen();
    try {
      const rl=createInterface({input:stdin,output:stdout});
      let clientId=loadConfig().clientId||'';
      try{
        if(!clientId){clientId=(await rl.question('Spotify Client ID (from developer.spotify.com/dashboard): ')).trim();}
        else{
          const response=(await rl.question('Spotify Client ID [enter to use '+clientId.slice(0,5)+'…]: ')).trim();
          if(response)clientId=response;
        }
      }finally{rl.close();}
      if(!clientId)throw new Error('Client ID required for Spotify authorization.');
      await login(clientId);
      this.demo=false;this.current=null;this.trackKey='';this.playing=false;this.playback=null;
      this.items=[];this.selected=0;this.offset=0;this.tab='now';this.lyrics={lines:[],plain:[],status:'missing'};
      this.alert('Spotify connected!');
    }catch(error){
      process.stdout.write('\n'+error.message+'\n');
    }finally{
      if(!this.running)return;
      this.enterScreen();stdin.on('data',this.keyListener);this.rows=[];
      this.draw();if(!this.demo)void this.refreshPlayback();
    }
  }
  async refreshPlayback(){
    if(this.demo||!this.running||this.busy)return;
    this.busy=true;
    let delay=6000;
    try{
      const playback=await this.api.playback();
      if(this.demo||!this.running)return;
      this.playback=playback;
      this.progressAnchor=performance.now();
      this.playing=Boolean(playback?.is_playing);
      this.current=trackInfo(playback?.item);
      const key=this.current?.uri||this.current?.id||'none';
      if(key!==this.trackKey){
        this.trackKey=key;
        this.lyrics={lines:[],plain:[],status:'missing'};
        this.plainOffset=0;
        if(this.current)void this.loadLyrics(this.current);
        else {this.abortLyrics?.abort();this.lyricPending=false;}
      }
    }catch(error){
      delay=error.retryAfter?error.retryAfter*1000:12000;
      this.alert(error.message||'Could not retrieve Spotify playback.');
    }finally{
      this.busy=false;this.draw();
      if(this.running&&!this.demo){clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.refreshPlayback(),delay);}
    }
  }
  async loadLyrics(track){
    this.abortLyrics?.abort();
    const controller=new AbortController();
    this.abortLyrics=controller;
    const request=++this.lyricRequest;
    this.lyricPending=true;this.draw();
    try{
      const lyrics=await lookupLyrics(track,controller.signal);
      if(!controller.signal.aborted && request===this.lyricRequest && this.trackKey===(track.uri||track.id||'none'))this.lyrics=lyrics;
    }catch(error){
      if(error.name!=='AbortError'&&request===this.lyricRequest){
        this.lyrics={lines:[],plain:[],status:'error'};
        this.alert('Lyrics provider error: '+error.message);
      }
    }finally{
      if(request===this.lyricRequest){this.lyricPending=false;this.draw();}
    }
  }
  playbackPosition(){
    if(this.demo){
      const elapsed=this.demoOffset+(this.playing?performance.now()-this.demoStarted:0);
      return Math.min(DEMO_TRACK.durationMs,Math.max(0,elapsed%DEMO_TRACK.durationMs));
    }
    if(!this.playback)return 0;
    const base=this.playback.progress_ms||0;
    return Math.min(this.current?.durationMs||Infinity,base+(this.playing?performance.now()-this.progressAnchor:0));
  }
  async action(task,success){
    try{await task();if(success)this.alert(success,2);if(!this.demo)void this.refreshPlayback();}
    catch(error){this.alert(error.message||'Action failed.');}
  }
  async loadList(offset=0){
    if(this.demo){this.alert('Demo mode has no Spotify catalog. Press [c] to connect.');return;}
    if(this.loadingList)return;
    this.loadingList=true;this.offset=offset;this.items=[];this.selected=0;this.draw();
    try{
      let payload;
      if(this.tab==='search'){
        if(!this.searchQuery){this.loadingList=false;this.draw();return;}
        payload=(await this.api.search(this.searchQuery,offset))?.tracks;
        this.items=payload?.items||[];
      }else if(this.tab==='library'){
        payload=await this.api.saved(offset);
        this.items=(payload?.items||[]).map(row=>row.track).filter(Boolean);
      }else if(this.tab==='playlists'){
        if(this.playlist){
          payload=await this.api.playlistItems(this.playlist.id,offset);
          this.items=(payload?.items||[]).map(row=>row.item||row.track).filter(Boolean);
        }else{
          payload=await this.api.playlists(offset);
          this.items=(payload?.items||[]).map(p=>({...p,type:'playlist'}));
        }
      }else if(this.tab==='devices'){
        payload=await this.api.devices();
        this.items=(payload?.devices||[]).map(d=>({...d,type:'device'}));
      }
      this.total=payload?.total??this.items.length;
    }catch(error){this.alert(error.message);}
    finally{this.loadingList=false;this.draw();}
  }
  async setTab(tab){
    if(!tabs.includes(tab))return;
    this.tab=tab;this.offset=0;this.selected=0;
    if(tab!=='playlists')this.playlist=null;
    this.draw();
    if(tab!=='now')await this.loadList(0);
  }
  async enterItem(){
    if(this.demo)return this.alert('Connect Spotify with [c] to access your catalog.');
    const item=this.items[this.selected];if(!item)return;
    if(item.type==='playlist'){
      this.playlist=item;this.offset=0;this.selected=0;await this.loadList();return;
    }
    if(item.type==='device'){
      await this.action(()=>this.api.transfer(item.id),'Playback transferred to '+item.name);
      await this.loadList();return;
    }
    const track=trackInfo(item);
    if(track?.uri)await this.action(()=>this.api.playUri(track.uri),'Playing '+track.title+' on your Spotify device');
  }
  async handleInput(chunk){
    const input=chunk.toString('utf8');
    if(input==='\x03'){this.quit();return;}
    if(this.prompt){
      if(input==='\x1b'){this.prompt=null;this.draw();return;}
      if(input==='\r'||input==='\n'){
        const prompt=this.prompt;this.prompt=null;this.draw();
        if(prompt.mode==='search'){this.searchQuery=prompt.text.trim();await this.setTab('search');}
        else await this.execCommand(prompt.text);
        return;
      }
      if(input==='\x7f'||input==='\b'){this.prompt.text=this.prompt.text.slice(0,-1);}
      else if(!input.includes('\x1b')&&!/[\x00-\x1f]/.test(input)&&this.prompt.text.length<120){this.prompt.text+=input;}
      this.draw();return;
    }
    if(this.help){
      if(['\x1b','?','q','\r',' '].includes(input))this.help=false;
      this.draw();return;
    }
    if(input==='\x1b'||input==='\x7f'){
      if(this.playlist){this.playlist=null;await this.loadList(0);}else if(this.tab!=='now'){await this.setTab('now');}
      return;
    }
    if(/^[1-5]$/.test(input)){await this.setTab(tabs[Number(input)-1]);return;}
    if(input==='\x1b[A'||input==='k'){this.move(-1);return;}
    if(input==='\x1b[B'||input==='j'){this.move(1);return;}
    if(input==='\x1b[5~'){await this.page(-1);return;}
    if(input==='\x1b[6~'){await this.page(1);return;}
    if(input==='?'){this.help=true;this.draw();return;}
    if(input==='/'){this.prompt={mode:'search',text:''};this.draw();return;}
    if(input===':'){this.prompt={mode:'command',text:''};this.draw();return;}
    if(input==='c'){await this.commandLogin();return;}
    if(input==='q'){this.quit();return;}
    if(input==='\r'||input==='\n'){await this.enterItem();return;}
    if(input===' '){await this.togglePlayback();return;}
    if(input==='n'){await this.action(()=>this.demo?this.demoSkip():this.api.next());return;}
    if(input==='p'){await this.action(()=>this.demo?this.demoSkip():this.api.previous());return;}
    if(input==='+'||input==='='){await this.volume(5);return;}
    if(input==='-'){await this.volume(-5);return;}
    if(input==='s'&&!this.demo){await this.action(()=>this.api.shuffle(!this.playback?.shuffle_state),'Shuffle toggled');return;}
    if(input==='r'&&!this.demo){
      const modes=['off','context','track'];
      const next=modes[(modes.indexOf(this.playback?.repeat_state)+1)%modes.length];
      await this.action(()=>this.api.repeat(next),'Repeat: '+next);return;
    }
    if(input==='f'&&!this.demo&&this.current?.uri){await this.action(()=>this.api.save(this.current.uri),'Saved to your library');return;}
  }
  async execCommand(text){
    const [verb,...parts]=text.trim().split(/\s+/);const arg=parts.join(' ');
    if(['quit','exit','q'].includes(verb)){this.quit();return;}
    if(['connect','login'].includes(verb)){await this.commandLogin();return;}
    if(verb==='logout'){logout();this.demo=true;this.playing=false;this.current=DEMO_TRACK;clearTimeout(this.refreshTimer);this.alert('Logged out. Switched to demo mode.');return;}
    if(verb==='demo'){this.demo=true;this.playing=false;this.current=DEMO_TRACK;clearTimeout(this.refreshTimer);this.alert('Demo mode enabled.');return;}
    if(verb==='refresh'){if(!this.demo)await this.refreshPlayback();if(this.tab!=='now')await this.loadList(this.offset);return;}
    if(verb==='help'){this.help=true;this.draw();return;}
    if(verb==='search'){this.searchQuery=arg;await this.setTab('search');return;}
    this.alert('Unknown command. Type :help or press ?.');
  }
  async togglePlayback(){
    if(this.demo){
      if(this.playing)this.demoOffset=this.playbackPosition();
      else this.demoStarted=performance.now();
      this.playing=!this.playing;this.draw();return;
    }
    await this.action(()=>this.api.playPause(this.playing));
  }
  async demoSkip(){this.demoOffset=0;this.demoStarted=performance.now();this.playing=true;}
  async volume(delta){
    if(this.demo)return this.alert('Volume changes require a Spotify device.');
    const volume=this.playback?.device?.volume_percent;
    if(typeof volume!=='number')return this.alert('Active device has no adjustable volume.');
    await this.action(()=>this.api.volume(volume+delta));
  }
  move(delta){
    if(this.tab==='now'&&this.lyrics.status==='plain'){
      this.plainOffset=Math.max(0,Math.min(Math.max(0,this.lyrics.plain.length-3),this.plainOffset+delta));
      this.draw();return;
    }
    this.selected=Math.max(0,Math.min(this.items.length-1,this.selected+delta));this.draw();
  }
  async page(delta){
    if(this.tab==='now')return;
    const next=Math.max(0,this.offset+25*delta);
    if(next>=this.total&&delta>0)return;
    await this.loadList(next);
  }
  put(lines,text,color='base'){
    lines.push({text,color});
  }
  renderNow(lines,inner){
    const track=this.current;
    this.put(lines,'','base');
    this.put(lines,'  NOW PLAYING                                           '+(this.demo?'DEMO TRANSMISSION':'SPOTIFY CONNECT'),'mint');
    this.put(lines,'','base');
    if(!track){
      this.put(lines,'  Nothing is playing on Spotify right now.','bright');
      this.put(lines,'  Open Spotify and start playback on a connected device.','muted');
      return;
    }
    this.put(lines,'  '+trim(track.title,inner-4),'bright');
    this.put(lines,'  '+trim(track.artist,inner-4),'muted');
    this.put(lines,'  '+trim(track.album||'',inner-4),'muted');
    this.put(lines,'','base');
    const now=this.playbackPosition();const duration=track.durationMs||0;
    const barSize=Math.max(8,Math.min(44,inner-25));const filled=Math.round(barSize*(duration?now/duration:0));
    this.put(lines,'  '+clock(now)+'   '+ '━'.repeat(filled)+'─'.repeat(barSize-filled)+'   '+clock(duration),'pink');
    this.put(lines,'  SPACE play/pause  ·  n next  ·  p previous  ·  +/- volume  ·  f save','muted');
    this.put(lines,'','base');
    this.put(lines,'  ───────────────  L Y R I C S  ───────────────','violet');
    this.put(lines,'','base');
    if(this.demo){
      this.renderSynced(lines,DEMO_LYRICS,now);
      this.put(lines,'  Original demo lines; no audio stream.','muted');
    }else if(this.lyricPending){
      this.put(lines,'  Looking for lyrics on LRCLIB…','warning');
    }else if(this.lyrics.status==='synced'){
      this.renderSynced(lines,this.lyrics.lines,now);
      this.put(lines,'  Synced by track position  ·  LRCLIB','muted');
    }else if(this.lyrics.status==='plain'){
      const plain=this.lyrics.plain;
      for(const row of plain.slice(this.plainOffset,this.plainOffset+5))this.put(lines,'  '+trim(row,inner-4),'bright');
      this.put(lines,'','base');this.put(lines,'  Unsynced lyrics (j/k to scroll)  ·  LRCLIB','warning');
    }else{
      this.put(lines,'  '+(this.lyrics.status==='error'?'Lyrics provider unavailable.':'No matching lyrics available for this song.'),'warning');
      this.put(lines,'  The track may be instrumental or have an unmatched release.','muted');
    }
    this.put(lines,'','base');
    const device=this.playback?.device;
    if(!this.demo&&device)this.put(lines,'  OUTPUT  '+device.name+'   |   VOL '+String(device.volume_percent??'--')+'%   |   '+(this.playback?.shuffle_state?'SHUFFLE ON':'SHUFFLE OFF'),'muted');
    if(this.demo)this.put(lines,'  DEMO MODE  |  Press c to connect to Spotify','muted');
  }
  renderSynced(lines,arr,position){
    const index=lyricIndex(arr,position);
    const at=Math.max(0,index);
    const prev=arr[at-1]?.text||'';
    const current=arr[at]?.text||'';
    const next=arr[at+1]?.text||'';
    this.put(lines,'  '+trim(prev,100),'muted');
    this.put(lines,'  › '+trim(current,100),'bright');
    this.put(lines,'  '+trim(next,100),'muted');
    this.put(lines,'','base');
  }
  renderList(lines,inner,height){
    const titles={search:'SEARCH  /  '+(this.searchQuery||'Enter a query with /'),
      library:'YOUR LIBRARY  /  LIKED TRACKS',
      playlists:this.playlist?'PLAYLIST  /  '+this.playlist.name:'YOUR PLAYLISTS',
      devices:'SPOTIFY CONNECT  /  DEVICES'};
    this.put(lines,'','base');this.put(lines,'  '+trim(titles[this.tab],inner-4),'bright');
    this.put(lines,'','base');
    if(this.demo){
      this.put(lines,'  Connect Spotify with [c] to browse tracks, playlists and devices.','warning');
      this.put(lines,'  You can still preview the synced-lyrics interface in [1] Now Playing.','muted');return;
    }
    if(this.loadingList){this.put(lines,'  Loading from Spotify…','muted');return;}
    if(!this.items.length){
      this.put(lines,'  '+(this.tab==='search'&&!this.searchQuery?'Press / and type a song, album or artist.':'No results to display.'),'muted');
      return;
    }
    this.put(lines,'  '+(this.offset+1)+'–'+(this.offset+this.items.length)+' of '+this.total+'   ·   ↑↓ navigate    Enter select    PgUp/PgDn pages','muted');
    this.put(lines,'','base');
    const max=Math.max(3,height-lines.length-5);
    const start=Math.min(Math.max(0,this.selected-Math.floor(max/2)),Math.max(0,this.items.length-max));
    this.items.slice(start,start+max).forEach((item,i)=>{
      const selected=this.selected===start+i;
      const label=itemLabel(item);
      const entry=(selected?'  ▶  ':'     ')+String(this.offset+start+i+1).padStart(2,'0')+'   '+trim(label,inner-14);
      this.put(lines,entry,selected?'selected':'base');
    });
    if(this.playlist)this.put(lines,'','base'),this.put(lines,'  Esc: return to playlists  ·  Some playlists may be restricted by Spotify.','muted');
  }
  renderHelp(lines){
    const keys=[
      'KEYBOARD SHORTCUTS','',
      '1 Now playing      2 Search         3 Library',
      '4 Playlists        5 Devices        / Search tracks',
      '↑/↓ or j/k        Enter open/play  PgUp/PgDn browse',
      'SPACE pause/play   n next           p previous',
      '+/- volume        s shuffle        r repeat',
      'f save track      c connect        ? help',
      ': command          Esc go back      q quit','',
      'COMMANDS',
      ':connect  :logout  :demo  :search <text>  :refresh  :help  :quit','',
      'Spotify audio stays in the official Spotify client.',
      'Geekify is a terminal controller, not an audio streaming client.'
    ];
    for(const row of keys)this.put(lines,'  '+row,row==='KEYBOARD SHORTCUTS'||row==='COMMANDS'?'bright':'muted');
  }
  makeRows(){
    const w=Math.max(48,Math.min(stdout.columns||100,220));
    const h=Math.max(16,Math.min(stdout.rows||32,90));
    const inner=w-2;
    const lines=[];
    this.put(lines,'╭'+'─'.repeat(inner)+'╮','violet');
    this.put(lines,'│  ✳  G E E K I F Y .     YOUR MUSIC, REIMAGINED'+ ' '.repeat(Math.max(0,inner-49))+'│','pink');
    this.put(lines,'├'+'─'.repeat(inner)+'┤','violet');
    const labels=tabs.map((name,i)=>(this.tab===name?'['+(i+1)+' '+name.toUpperCase()+']':' '+(i+1)+' '+name+' ')).join('   ');
    this.put(lines,'  '+labels,'bright');
    this.put(lines,'  '+(this.demo?'● DEMO MODE':'● SPOTIFY CONNECTED')+'    '+(this.playing?'▶ PLAYING':'Ⅱ PAUSED')+'     '+(this.busy?'SYNCING…':'READY'),'mint');
    if(this.help)this.renderHelp(lines);
    else if(this.tab==='now')this.renderNow(lines,inner);
    else this.renderList(lines,inner,h);
    const status=(this.message&&Date.now()<this.messageUntil)?this.message:'Press ? for help  ·  / search  ·  c connect  ·  q quit';
    const remaining=Math.max(0,h-lines.length-4);
    for(let i=0;i<remaining;i++)this.put(lines,'','base');
    this.put(lines,'├'+'─'.repeat(inner)+'┤','violet');
    this.put(lines,this.prompt?(this.prompt.mode==='search'?'  SEARCH > ':'  COMMAND :')+this.prompt.text+'_':'  '+trim(status,inner-4),this.prompt?'pink':'warning');
    this.put(lines,'╰'+'─'.repeat(inner)+'╯','violet');
    return lines.slice(0,h).map(({text,color})=>{
      const available=w;
      const shown=pad(text,available);
      return (CODE[color]||CODE.base)+shown+CODE.reset;
    });
  }
  draw(){
    if(!this.running||!stdout.isTTY)return;
    const next=this.makeRows();
    for(let i=0;i<next.length;i++){
      if(this.rows[i]!==next[i])stdout.write(ESC+(i+1)+';1H'+ESC+'2K'+next[i]);
    }
    if(this.rows.length>next.length){
      for(let i=next.length;i<this.rows.length;i++)stdout.write(ESC+(i+1)+';1H'+ESC+'2K');
    }
    this.rows=next;
  }
}
