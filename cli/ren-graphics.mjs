// WezTerm image-mode Geekify. An honest terminal application, not a browser window.
// Uses iTerm2 OSC 1337 inline PNGs and SGR mouse tracking; no terminal plugin needed.
import sharp from 'sharp';
import { stdin, stdout } from 'node:process';
import { SpotifyApi, trackInfo } from './spotify.mjs';
import { isConnected } from './auth.mjs';
import { loadSpotifyCover } from './cover.mjs';
import { lookupLyrics, lyricIndex } from '../src/lyrics.js';
import { sceneSvg, hitTest, NAV, SCENE_WIDTH, SCENE_HEIGHT } from './ren-scene.mjs';

const ESC='\x1b[';
const DEMO_TRACK={id:'ren-demo',uri:null,title:'Midnight Frequency',artist:'geekify sessions',
  album:'unreleased transmissions',durationMs:136000};
const DEMO_LINES=[
  {timeMs:0,text:'the city is still awake'},
  {timeMs:10000,text:'somewhere, a radio plays'},
  {timeMs:25000,text:'warm lights through the window'},
  {timeMs:40000,text:'and a midnight skyline'},
  {timeMs:56000,text:'stay with the melody'},
  {timeMs:75000,text:'lost in the static'},
  {timeMs:94000,text:'until the sky turns gold'},
  {timeMs:115000,text:'the night goes on'}
];
const safeError=error=>String(error?.message||error).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,112);
export const supportsInlineImages=(env=process.env)=>Boolean(
  env.WEZTERM_PANE||/wezterm|iterm/i.test(env.TERM_PROGRAM||'')||env.GEEKIFY_FORCE_IMAGES==='1'
);
export function encodeInlineImage(buffer,columns,rows){
  if(!Buffer.isBuffer(buffer))throw new TypeError('Expected a PNG Buffer');
  const w=Math.max(1,Math.min(500,Math.floor(columns)));
  const h=Math.max(1,Math.min(200,Math.floor(rows)));
  return '\x1b]1337;File=inline=1;size='+buffer.length+';width='+w+';height='+h+
    ';preserveAspectRatio=0;doNotMoveCursor=1:'+buffer.toString('base64')+'\x07';
}
export class RenGraphicsApp {
  constructor({demo=false,forceImages=false}={}){
    this.demo=demo||!isConnected();
    this.forceImages=forceImages;
    this.api=new SpotifyApi();
    this.track=this.demo?DEMO_TRACK:null;
    this.playing=false;
    this.tab='now';
    this.playback=null;
    this.playbackAnchor=performance.now();
    this.demoAnchor=performance.now();this.demoOffset=0;
    this.list=[];this.selected=0;this.listOffset=0;this.listTotal=0;
    this.scrollStart=0;this.loading=false;this.playlist=null;
    this.query='';this.searchActive=false;
    this.coverDataUrl='';this.coverAbort=null;this.trackKey='';
    this.lyrics=this.demo?DEMO_LINES:[];this.abortLyrics=null;
    this.running=false;this.drawing=false;this.pending=false;
    this.lastFrame=-1;this.lastRender=0;
    this.renderTimer=null;this.pollTimer=null;
    this.status='Space: play/pause   /: search   1-5: tabs   q: exit';
    this.statusUntil=0;
  }
  position(){
    if(this.demo){
      const elapsed=this.demoOffset+(this.playing?performance.now()-this.demoAnchor:0);
      return Math.max(0,elapsed%(this.track?.durationMs||136000));
    }
    const base=this.playback?.progress_ms||0;
    return Math.min(this.track?.durationMs||Infinity,
      base+(this.playing?performance.now()-this.playbackAnchor:0));
  }
  say(message,seconds=5){
    this.status=safeError(message);
    this.statusUntil=Date.now()+seconds*1000;
    this.draw();
  }
  deviceId(){
    if(!this.playback?.device)throw new Error('Start music in Spotify Desktop first.');
    if(this.playback.device.is_restricted)throw new Error('Spotify is restricting this device.');
    return this.playback.device.id||undefined;
  }
  async run(){
    if(!stdin.isTTY||!stdout.isTTY)throw new Error('Ren graphics mode needs an interactive terminal.');
    if(!this.forceImages&&!supportsInlineImages()){
      throw new Error('High-detail Ren needs WezTerm (or a compatible image terminal). '+
        'Open WezTerm and run geekify --ren. For VS Code with terminal.integrated.enableImages enabled, '+
        'use geekify --ren --force-images. For ANSI fallback use geekify --ren-ansi.');
    }
    this.running=true;
    this.enter();
    this.listener=chunk=>{void this.input(chunk.toString('utf8')).catch(error=>this.say(error));};
    this.resizeListener=()=>this.draw();
    this.signalListener=()=>this.quit();
    stdin.on('data',this.listener);
    stdout.on('resize',this.resizeListener);
    process.on('SIGINT',this.signalListener);
    process.on('SIGTERM',this.signalListener);
    this.renderTimer=setInterval(()=>this.draw(),400);
    this.draw();
    if(!this.demo)void this.pollSpotify();
    await new Promise(resolve=>{this.resolveExit=resolve;});
  }
  enter(){
    stdout.write(ESC+'?1049h'+ESC+'?25l'+ESC+'?1000h'+ESC+'?1003h'+ESC+'?1006h'+ESC+'H'+ESC+'2J');
    stdin.setRawMode(true);
    stdin.resume();
  }
  quit(){
    if(!this.running)return;
    this.running=false;
    clearInterval(this.renderTimer);clearTimeout(this.pollTimer);
    this.abortLyrics?.abort();this.coverAbort?.abort();
    stdin.off('data',this.listener);
    stdout.off('resize',this.resizeListener);
    process.off('SIGINT',this.signalListener);
    process.off('SIGTERM',this.signalListener);
    try{stdin.setRawMode(false);}catch{}
    stdout.write(ESC+'?1006l'+ESC+'?1003l'+ESC+'?1000l'+ESC+'?25h'+ESC+'?1049l'+'\x1b[0m');
    this.resolveExit?.();
  }
  async pollSpotify(){
    if(this.demo||!this.running)return;
    let delay=6000;
    try{
      const playback=await this.api.playback();
      if(!this.running||this.demo)return;
      this.playback=playback;
      this.playbackAnchor=performance.now();
      this.playing=Boolean(playback?.is_playing);
      this.track=trackInfo(playback?.item);
      const key=this.track?.uri||this.track?.id||'none';
      if(key!==this.trackKey){
        this.trackKey=key;this.coverDataUrl='';
        void this.loadArtwork(this.track);
        void this.loadLyrics(this.track);
      }
      this.draw();
    }catch(error){
      delay=error.retryAfter?error.retryAfter*1000:12000;
      this.say(error);
    }finally{
      if(this.running&&!this.demo){clearTimeout(this.pollTimer);this.pollTimer=setTimeout(()=>this.pollSpotify(),delay);}
    }
  }
  async loadArtwork(track){
    this.coverAbort?.abort();
    const controller=new AbortController();this.coverAbort=controller;
    if(!track?.imageUrl){this.coverDataUrl='';return;}
    const key=track.uri||track.id;
    try{
      // Reuse the allowlisted Spotify cover downloader, then draw nearest-neighbour pixels.
      const image=await loadSpotifyCover(track.imageUrl,{signal:controller.signal});
      if(controller.signal.aborted||!this.running||(this.track?.uri||this.track?.id)!==key)return;
      const png=await sharp(Buffer.from(image.data),{raw:{width:image.width,height:image.height,channels:3}}).png().toBuffer();
      this.coverDataUrl='data:image/png;base64,'+png.toString('base64');
      this.draw();
    }catch(error){
      if(!controller.signal.aborted)this.say('Cover could not load: '+safeError(error));
    }
  }
  async loadLyrics(track){
    this.abortLyrics?.abort();this.lyrics=[];
    if(!track)return;
    const controller=new AbortController();this.abortLyrics=controller;
    const key=track.uri||track.id;
    try{
      const results=await lookupLyrics(track,controller.signal);
      if(controller.signal.aborted||!this.running||(this.track?.uri||this.track?.id)!==key)return;
      if(results.status==='synced')this.lyrics=results.lines;
      else if(results.status==='plain')this.lyrics=results.plain.slice(0,3).map((text,i)=>({timeMs:i*5000,text}));
      this.draw();
    }catch{/* Lyrics are optional and failure shouldn't interrupt playback. */}
  }
  async action(task){
    try{await task();if(!this.demo)void this.pollSpotify();}
    catch(error){this.say(error);}
    this.draw();
  }
  async togglePlayback(){
    if(this.demo){
      if(this.playing)this.demoOffset=this.position();
      else this.demoAnchor=performance.now();
      this.playing=!this.playing;this.draw();return;
    }
    await this.action(()=>this.api.playPause(this.playing,this.deviceId()));
  }
  async skip(direction){
    if(this.demo){this.demoOffset=0;this.demoAnchor=performance.now();this.playing=true;this.draw();return;}
    await this.action(()=>direction>0?this.api.next(this.deviceId()):this.api.previous(this.deviceId()));
  }
  async changeTab(tab){
    if(!NAV.includes(tab))return;
    this.tab=tab;this.selected=0;this.listOffset=0;
    this.playlist=null;this.draw();
    if(tab!=='now')await this.loadList();
  }
  async loadList(offset=this.listOffset){
    if(this.demo){this.list=[];this.listTotal=0;this.draw();return;}
    if(this.loading)return;
    this.loading=true;this.listOffset=offset;this.list=[];this.selected=0;this.draw();
    try{
      let response;
      if(this.tab==='search'){
        if(!this.query)return;
        response=(await this.api.search(this.query,offset))?.tracks;
        this.list=response?.items||[];
      }else if(this.tab==='library'){
        response=await this.api.saved(offset);
        this.list=(response?.items||[]).map(x=>x.track).filter(Boolean);
      }else if(this.tab==='playlists'){
        if(this.playlist){
          response=await this.api.playlistItems(this.playlist.id,offset);
          this.list=(response?.items||[]).map(x=>x.item||x.track).filter(Boolean);
        }else{
          response=await this.api.playlists(offset);
          this.list=(response?.items||[]).map(x=>({...x,type:'playlist'}));
        }
      }else if(this.tab==='devices'){
        response=await this.api.devices();
        this.list=(response?.devices||[]).map(x=>({...x,type:'device'}));
      }
      this.listTotal=response?.total??this.list.length;
    }catch(error){this.say(error);}
    finally{this.loading=false;this.draw();}
  }
  async activateItem(index=this.selected){
    if(this.demo)return this.say('Connect with geekify login to browse Spotify.');
    const item=this.list[index];if(!item)return;
    this.selected=index;
    if(item.type==='playlist'){
      this.playlist=item;this.listOffset=0;await this.loadList(0);return;
    }
    if(item.type==='device'){
      await this.action(()=>this.api.transfer(item.id));return;
    }
    const track=trackInfo(item);
    if(track?.uri)await this.action(()=>this.api.playUri(track.uri,this.deviceId()));
  }
  renderState(){
    const progressMs=this.position();
    const index=lyricIndex(this.lyrics,progressMs);
    const current=this.lyrics[Math.max(0,index)]?.text;
    const next=this.lyrics[Math.max(0,index)+1]?.text;
    this.scrollStart=Math.max(0,Math.min(Math.max(0,this.list.length-8),this.selected-3));
    const items=this.list.slice(this.scrollStart,this.scrollStart+8).map(item=>{
      if(item.type==='playlist')return {title:item.name,subtitle:String(item.items?.total??item.tracks?.total??'')+' songs'};
      if(item.type==='device')return {title:item.name,subtitle:item.is_active?'active':item.type};
      const t=trackInfo(item);
      return {title:t?.title||'Unavailable',subtitle:t?.artist||''};
    });
    return {
      track:this.track,playing:this.playing,progressMs,frame:this.playing?Math.floor(performance.now()/440)%2:0,
      blink:Math.floor(Date.now()/230)%41===0,
      coverDataUrl:this.coverDataUrl,connected:!this.demo,tab:this.tab,
      status:Date.now()<this.statusUntil?this.status:'Space play/pause  •  Click Ren  •  1-5 tabs  •  / search  •  q quit',
      lyrics:this.lyrics.length?[current,next]:[],
      items,selected:this.selected-this.scrollStart,offset:this.listOffset+this.scrollStart,
      loading:this.loading,query:this.query,searchActive:this.searchActive,
      playlistName:this.playlist?.name
    };
  }
  async draw(){
    if(!this.running)return;
    if(this.drawing){this.pending=true;return;}
    this.drawing=true;
    try{
      const state=this.renderState();
      const svg=sceneSvg(state);
      const png=await sharp(Buffer.from(svg),{limitInputPixels:2000000})
        .png({compressionLevel:6}).toBuffer();
      if(!this.running)return;
      const cols=Math.max(48,stdout.columns||100),rows=Math.max(16,stdout.rows||32);
      // Replace the entire image in the same cells, without pushing scrollback.
      stdout.write(ESC+'H'+encodeInlineImage(png,cols,rows));
    }catch(error){
      // Do not leave the terminal stuck in mouse/alternate-screen mode.
      this.quit();
      process.stderr.write('\nRen renderer failed: '+safeError(error)+'\n');
    }finally{
      this.drawing=false;
      if(this.pending&&this.running){this.pending=false;void this.draw();}
    }
  }
  async mouse(code,col,row,release){
    if(release)return;
    const x=(col-.5)/(stdout.columns||100)*SCENE_WIDTH;
    const y=(row-.5)/(stdout.rows||32)*SCENE_HEIGHT;
    if((code&32)===32)return; // Mouse movement is not a click.
    if((code&64)===64){
      if(this.tab!=='now'&&this.list.length){
        this.selected=Math.max(0,Math.min(this.list.length-1,this.selected+(code&1?1:-1)));
        this.draw();
      }
      return;
    }
    if((code&3)!==0)return; // left mouse press
    const hit=hitTest(x,y,this.tab);
    if(!hit)return;
    if(hit.type==='tab'){await this.changeTab(hit.value);return;}
    if(hit.type==='ren'){this.say('ren: i am not a button.',3);return;}
    if(hit.type==='playback'){await this.togglePlayback();return;}
    if(hit.type==='previous'||hit.type==='next'){await this.skip(hit.type==='next'?1:-1);return;}
    if(hit.type==='item'){await this.activateItem(this.scrollStart+hit.index);return;}
  }
  async input(raw){
    // SGR mouse events: CSI < button ; column ; row M (press) or m (release).
    const events=[...raw.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g)];
    for(const e of events)await this.mouse(Number(e[1]),Number(e[2]),Number(e[3]),e[4]==='m');
    let input=raw.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g,'');
    if(!input)return;
    if(input.includes('\x03')){this.quit();return;}
    if(this.searchActive){
      for(const key of input){
        if(key==='\x1b'){this.searchActive=false;this.draw();return;}
        if(key==='\r'||key==='\n'){
          this.searchActive=false;this.tab='search';await this.loadList(0);return;
        }
        if(key==='\x7f'||key==='\b')this.query=this.query.slice(0,-1);
        else if(key>=' '&&key!=='\x7f'&&this.query.length<90)this.query+=key;
      }
      this.draw();return;
    }
    if(input.includes('\x1b[A')||input==='k'){this.selected=Math.max(0,this.selected-1);this.draw();return;}
    if(input.includes('\x1b[B')||input==='j'){this.selected=Math.min(this.list.length-1,this.selected+1);this.draw();return;}
    if(input.includes('\x1b[5~')){await this.loadList(Math.max(0,this.listOffset-25));return;}
    if(input.includes('\x1b[6~')){if(this.listOffset+25<this.listTotal)await this.loadList(this.listOffset+25);return;}
    if(input==='\x1b'){
      if(this.playlist){this.playlist=null;await this.loadList(0);}
      else await this.changeTab('now');
      return;
    }
    if(/^[1-5]$/.test(input)){await this.changeTab(NAV[Number(input)-1]);return;}
    if(input==='q'){this.quit();return;}
    if(input==='/'){this.searchActive=true;this.query='';this.draw();return;}
    if(input===' '){await this.togglePlayback();return;}
    if(input==='n'){await this.skip(1);return;}
    if(input==='p'){await this.skip(-1);return;}
    if(input==='\r'||input==='\n'){await this.activateItem();return;}
    if(input==='r'){this.say('ren: rice is a perfectly reasonable breakfast.',4);}
  }
}
