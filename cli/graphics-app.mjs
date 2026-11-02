// Sprite-free Geekify music desk: render the original modular Geekify artwork in VS Code.
import sharp from 'sharp';
import { stdin, stdout } from 'node:process';
import { readFileSync } from 'node:fs';
import { SpotifyApi, trackInfo } from './spotify.mjs';
import { isConnected } from './auth.mjs';
import { loadSpotifyCover } from './cover.mjs';
import { lookupLyrics, lyricIndex } from '../src/lyrics.js';
import { sceneSvg, hitTest, TABS, WIDTH, HEIGHT } from './lyrics-scene.mjs';
import { preferredGraphicsProtocol, probeKittyGraphics, encodeInlineImage, encodeKittyImage, kittyDeleteImage } from './terminal-graphics.mjs';

const ESC='\x1b[';
const DEMO_TRACK={id:'geekify-demo',uri:null,title:'Midnight Frequency',artist:'geekify sessions',
  album:'unreleased transmissions',durationMs:136000};
const DEMO_LINES=[
  {timeMs:0,text:'another signal lost'},
  {timeMs:22000,text:'in the frequency'},
  {timeMs:60000,text:'maybe tomorrow'},
  {timeMs:88000,text:"we'll be quieter"},
  {timeMs:112000,text:'the city keeps glowing'}
];
const safeError=error=>String(error?.message||error).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,112);
export { encodeInlineImage } from './terminal-graphics.mjs';
export const supportsInlineImages=env=>preferredGraphicsProtocol(env)!=='ansi'||env?.GEEKIFY_FORCE_IMAGES==='1';
// Keep the 16:9 pixel-art scene correctly proportioned inside tall or wide
// terminal panes. Terminal cell dimensions vary; 9x18 is a conservative estimate.
export function terminalSceneLayout(columns,rows){
  const width=Math.min(2300,Math.max(48,columns)*9);
  const height=Math.min(1500,Math.max(16,rows)*18);
  const scale=Math.min(width/WIDTH,height/HEIGHT);
  const contentWidth=Math.max(1,Math.floor(WIDTH*scale));
  const contentHeight=Math.max(1,Math.floor(HEIGHT*scale));
  const left=Math.floor((width-contentWidth)/2);
  const top=Math.floor((height-contentHeight)/2);
  return {width,height,contentWidth,contentHeight,left,top};
}
// Keep a small buffer between the illustrated frame and VS Code's terminal viewport.
// Drawing into the last character row/column can clip the image at pane boundaries.
export const SAFE_MARGIN_COLS=2, SAFE_MARGIN_ROWS=1;
export function terminalPlacement(columns,rows){
  const availableCols=Math.max(1,Math.trunc(Number(columns)||100));
  const availableRows=Math.max(1,Math.trunc(Number(rows)||32));
  const marginCols=Math.min(SAFE_MARGIN_COLS,Math.floor((availableCols-1)/2));
  const marginRows=Math.min(SAFE_MARGIN_ROWS,Math.floor((availableRows-1)/2));
  return {
    anchorCol:marginCols+1,anchorRow:marginRows+1,
    columns:availableCols-2*marginCols,rows:availableRows-2*marginRows
  };
}
// Convert terminal cell coordinates back to 1200×675 illustrated hit-test units.
export function terminalMouseToScene(col,row,placement,layout){
  const localCol=col-placement.anchorCol+1,localRow=row-placement.anchorRow+1;
  if(localCol<1||localCol>placement.columns||localRow<1||localRow>placement.rows)return null;
  const px=(localCol-.5)/placement.columns*layout.width;
  const py=(localRow-.5)/placement.rows*layout.height;
  return {
    x:(px-layout.left)/layout.contentWidth*WIDTH,
    y:(py-layout.top)/layout.contentHeight*HEIGHT
  };
}
export class GeekifyGraphicsApp {
  constructor({demo=false,forceImages=false}={}){
    this.demo=demo||!isConnected();
    this.forceImages=forceImages;
    this.protocol='ansi';this.lastImageId=0;this.frameSequence=0;
    this.imageLayout=null;this.imagePlacement=null;
    this.api=new SpotifyApi();
    this.track=this.demo?DEMO_TRACK:null;
    this.playing=this.demo;
    this.tab='now';this.subtab='lyrics';
    this.assets={};
    this.playback=null;
    this.playbackAnchor=performance.now();
    this.demoAnchor=performance.now();this.demoOffset=this.demo?75000:0;
    this.list=[];this.selected=0;this.listOffset=0;this.listTotal=0;
    this.queue=[];this.queueLoading=false;this.queueNotice='';this.queueRequest=0;
    this.scrollStart=0;this.loading=false;this.playlist=null;
    this.query='';this.searchActive=false;
    this.coverDataUrl='';this.coverAbort=null;this.trackKey='';
    this.lyrics=this.demo?DEMO_LINES:[];this.abortLyrics=null;
    this.lyricsStatus=this.demo?'synced':'missing';this.lyricsLoading=false;
    this.running=false;this.drawing=false;this.pending=false;
    this.lastFrameKey='';
    this.renderTimer=null;this.pollTimer=null;
    this.status='Space: play/pause   /: search   1-6: tabs   q: exit';
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
  async loadAssets(){
    // Each asset is a separate original Geekify pixel-art PNG, not a screenshot.
    // Load all skins once; image rendering then composites them with live lyrics.
    const manifest=JSON.parse(readFileSync(new URL('../assets/geekify/manifest.json',import.meta.url),'utf8'));
    const root=new URL('../',import.meta.url);
    this.assets={};
    for(const item of manifest.assets){
      const bytes=readFileSync(new URL('../'+item.file,import.meta.url));
      this.assets[item.id]='data:image/png;base64,'+bytes.toString('base64');
    }
    if(!this.assets['paper/lyrics-panel']||!this.assets['frame/wood-tile']){
      throw new Error('Geekify artwork pack incomplete. Please reinstall or update the repo.');
    }
  }
  async cycleRepeat(){
    const modes=['off','context','track'];
    const current=modes.indexOf(this.playback?.repeat_state||'off');
    await this.action(()=>this.api.repeat(modes[(current+1)%modes.length],this.deviceId()));
  }
  async loadQueue(){
    if(this.demo){
      this.queue=[];this.queueNotice='Connect Spotify to view your queue.';this.queueLoading=false;
      this.draw();return;
    }
    const request=++this.queueRequest;
    this.queueLoading=true;this.queueNotice='';this.draw();
    try{
      const result=await this.api.queue();
      if(request!==this.queueRequest||!this.running)return;
      this.queue=(result?.queue||[]).slice(0,20).map(trackInfo).filter(Boolean);
      this.queueNotice=this.queue.length?'':'Your Spotify queue is empty.';
    }catch(error){
      if(request!==this.queueRequest||!this.running)return;
      this.queue=[];
      this.queueNotice='Queue unavailable: '+safeError(error);
    }finally{
      if(request===this.queueRequest){this.queueLoading=false;this.draw();}
    }
  }
  async seekTo(ratio){
    if(!this.track?.durationMs)return;
    const position=Math.round(Math.max(0,Math.min(1,Number(ratio)||0))*this.track.durationMs);
    if(this.demo){
      this.demoOffset=position;this.demoAnchor=performance.now();this.draw();return;
    }
    await this.action(()=>this.api.seek(position,this.deviceId()));
  }
  async run(){
    if(!stdin.isTTY||!stdout.isTTY)throw new Error('Geekify graphics need an interactive terminal.');
    await this.loadAssets();
    // Even when VS Code doesn't advertise TERM_PROGRAM, try the supported
    // Kitty query. Guessing "no graphics" from missing env vars caused the
    // silent ANSI UI seen in user testing.
    this.protocol=preferredGraphicsProtocol();
    if(this.protocol==='ansi')this.protocol='kitty';
    if(this.protocol==='kitty'&&!this.forceImages){
      const supported=await probeKittyGraphics({input:stdin,output:stdout});
      if(!supported)throw new Error('VS Code graphics are disabled or unavailable. Set ' +
        'terminal.integrated.enableImages=true and terminal.integrated.gpuAcceleration=auto. ' +
        'On Windows, also set terminal.integrated.windowsUseConptyDll=true. ' +
        'Restart the terminal, then run geekify graphics-check. ' +
        'Use --force-images only to skip the check.');
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
    this.renderTimer=setInterval(()=>this.draw(),650);
    this.draw();
    if(!this.demo)void this.pollSpotify();
    await new Promise(resolve=>{this.resolveExit=resolve;});
  }
  enter(){
    // Clicks and wheel events only. Reporting every mouse movement floods the terminal.
    stdout.write(ESC+'?1049h'+ESC+'?25l'+ESC+'?1000h'+ESC+'?1006h'+ESC+'H'+ESC+'2J');
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
    stdout.write(ESC+'?1006l'+ESC+'?1000l'+ESC+'?25h'+ESC+'?1049l'+'\x1b[0m');
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
        if(this.tab==='now'&&this.subtab==='queue')void this.loadQueue();
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
    this.abortLyrics?.abort();this.lyrics=[];this.lyricsStatus='missing';
    if(!track)return;
    this.lyricsLoading=true;
    const controller=new AbortController();this.abortLyrics=controller;
    const key=track.uri||track.id;
    try{
      const results=await lookupLyrics(track,controller.signal);
      if(controller.signal.aborted||!this.running||(this.track?.uri||this.track?.id)!==key)return;
      this.lyricsStatus=results.status;
      if(results.status==='synced')this.lyrics=results.lines;
      else if(results.status==='plain')this.lyrics=results.plain.slice(0,6).map((text,i)=>({timeMs:i*5000,text}));
      this.draw();
    }catch{/* Lyrics are optional and failure shouldn't interrupt playback. */}
    finally{this.lyricsLoading=false;this.draw();}
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
    if(!TABS.includes(tab))return;
    this.tab=tab;this.selected=0;this.listOffset=0;
    if(tab==='now')this.subtab='lyrics';
    this.playlist=null;this.draw();
    if(tab!=='now'&&tab!=='settings')await this.loadList();
  }
  async changeSubtab(subtab){
    if(!['lyrics','queue','info'].includes(subtab))return;
    this.subtab=subtab;this.draw();
    if(subtab==='queue')await this.loadQueue();
  }
  async loadList(offset=this.listOffset){
    if(this.demo){this.list=[];this.listTotal=0;this.draw();return;}
    if(this.loading)return;
    this.loading=true;this.listOffset=offset;this.list=[];this.selected=0;this.draw();
    try{
      let response;
      if(this.tab==='settings'){return;}
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
    const at=Math.max(0,lyricIndex(this.lyrics,progressMs));
    const prev=this.lyrics.slice(Math.max(0,at-2),at).map(x=>x.text);
    const current=this.lyrics[at]?[this.lyrics[at].text]:[];
    const next=this.lyrics.slice(at+1,at+3).map(x=>x.text);
    // Plain lyrics are unsynced; do not fake time-aware highlighting.
    const plain=this.lyricsStatus==='plain';
    this.scrollStart=Math.max(0,Math.min(Math.max(0,this.list.length-9),this.selected-3));
    const items=this.list.slice(this.scrollStart,this.scrollStart+9).map(item=>{
      if(item.type==='playlist')return {title:item.name,subtitle:String(item.items?.total??item.tracks?.total??'')+' songs'};
      if(item.type==='device')return {title:item.name,subtitle:item.is_active?'active':item.type};
      const track=trackInfo(item);
      return {title:track?.title||'Unavailable',subtitle:track?.artist||''};
    });
    return {
      tab:this.tab,subtab:this.subtab,demo:this.demo,
      track:this.track,playing:this.playing,progressMs,
      coverDataUrl:this.coverDataUrl,
      lyricsPrev:plain?[]:prev,
      lyricsCurrent:plain?this.lyrics.slice(0,4).map(x=>x.text):current,
      lyricsNext:plain?this.lyrics.slice(4,6).map(x=>x.text):next,
      lyricsStatus:this.lyricsStatus,lyricsLoading:this.lyricsLoading,
      status:Date.now()<this.statusUntil?this.status:'',
      items,selected:this.selected-this.scrollStart,
      offset:this.listOffset+this.scrollStart,
      loading:this.loading,query:this.query,searchActive:this.searchActive,
      playlistName:this.playlist?.name,
      queueItems:this.queue.map(item=>({title:item.title,subtitle:item.artist})),
      queueLoading:this.queueLoading,queueNotice:this.queueNotice
    };
  }
  async draw(){
    if(!this.running)return;
    if(this.drawing){this.pending=true;return;}
    this.drawing=true;
    try{
      const state=this.renderState();
      const cols=Math.max(1,stdout.columns||100),rows=Math.max(1,stdout.rows||32);
      const placement=terminalPlacement(cols,rows);
      // Re-encoding the same large image every 650ms is unnecessary, especially paused.
      const frameKey=JSON.stringify({...state,progressMs:Math.floor(state.progressMs/1000),
        coverDataUrl:this.coverDataUrl.length,columns:cols,rows});
      if(frameKey===this.lastFrameKey)return;
      const svg=sceneSvg(state,this.assets);
      // Letterbox the 16:9 illustration within the safe, inset terminal region.
      const layout=terminalSceneLayout(placement.columns,placement.rows);
      this.imageLayout=layout;this.imagePlacement=placement;
      const png=await sharp(Buffer.from(svg),{limitInputPixels:2500000})
        .resize(layout.contentWidth,layout.contentHeight,{fit:'fill',kernel:'nearest'})
        .extend({
          top:layout.top,left:layout.left,
          bottom:layout.height-layout.top-layout.contentHeight,
          right:layout.width-layout.left-layout.contentWidth,
          background:'#553621'
        })
        .png({compressionLevel:6}).toBuffer();
      if(!this.running)return;
      if(this.protocol==='kitty'){
        const imageId=938201+(this.frameSequence++%2);
        const encoded=encodeKittyImage(png,{
          columns:placement.columns,rows:placement.rows,imageId
        });
        const cleanup=this.lastImageId?kittyDeleteImage(this.lastImageId):'';
        this.lastImageId=imageId;
        stdout.write(ESC+placement.anchorRow+';'+placement.anchorCol+'H'+encoded+cleanup);
      }else{
        stdout.write(ESC+placement.anchorRow+';'+placement.anchorCol+'H'+
          encodeInlineImage(png,placement.columns,placement.rows));
      }
      this.lastFrameKey=frameKey;
    }catch(error){
      // Do not leave the terminal stuck in mouse/alternate-screen mode.
      this.quit();
      process.stderr.write('\nGeekify graphics renderer failed: '+safeError(error)+'\n');
    }finally{
      this.drawing=false;
      if(this.pending&&this.running){this.pending=false;void this.draw();}
    }
  }
  async mouse(code,col,row,release){
    if(release)return;
    const placement=this.imagePlacement||terminalPlacement(stdout.columns||100,stdout.rows||32);
    const layout=this.imageLayout||terminalSceneLayout(placement.columns,placement.rows);
    const point=terminalMouseToScene(col,row,placement,layout);
    if((code&32)===32)return; // Mouse movement is not a click.
    if((code&64)===64){
      if(this.tab!=='now'&&this.list.length){
        this.selected=Math.max(0,Math.min(this.list.length-1,this.selected+(code&1?1:-1)));
        this.draw();
      }
      return;
    }
    if((code&3)!==0||!point)return; // left mouse press inside the inset image
    const hit=hitTest(point.x,point.y,this.tab);
    if(!hit)return;
    if(hit.type==='tab'){await this.changeTab(hit.value);return;}
    if(hit.type==='play'){await this.togglePlayback();return;}
    if(hit.type==='seek'){await this.seekTo(hit.ratio);return;}
    if(['lyrics','queue','info'].includes(hit.type)){await this.changeSubtab(hit.type);return;}
    if(hit.type==='shuffle'&&!this.demo){await this.action(()=>this.api.shuffle(!this.playback?.shuffle_state,this.deviceId()));return;}
    if(hit.type==='repeat'&&!this.demo){await this.cycleRepeat();return;}
    if(hit.type==='heart'&&!this.demo&&this.track?.uri){await this.action(()=>this.api.save(this.track.uri));return;}
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
    if(/^[1-6]$/.test(input)){await this.changeTab(TABS[Number(input)-1]);return;}
    if(input==='q'){this.quit();return;}
    if(input==='\t'&&this.tab==='now'){
      const views=['lyrics','queue','info'];
      await this.changeSubtab(views[(views.indexOf(this.subtab)+1)%views.length]);return;
    }
    if(input==='u'&&this.tab==='now'&&this.subtab==='queue'){await this.loadQueue();return;}
    if(input==='/'){this.searchActive=true;this.query='';this.draw();return;}
    if(input===' '){await this.togglePlayback();return;}
    if(input==='n'){await this.skip(1);return;}
    if(input==='p'){await this.skip(-1);return;}
    if(input==='\r'||input==='\n'){await this.activateItem();return;}
    if(input==='r'&&!this.demo){await this.cycleRepeat();return;}
    if(input==='s'&&!this.demo){await this.action(()=>this.api.shuffle(!this.playback?.shuffle_state,this.deviceId()));return;}
    if(input==='f'&&!this.demo&&this.track?.uri){await this.action(()=>this.api.save(this.track.uri));return;}
    if(input==='?')this.say('1-6 tabs • Tab lyrics/queue/info • U queue refresh • / search • Space play • n/p skip • q quit',8);
  }
}
