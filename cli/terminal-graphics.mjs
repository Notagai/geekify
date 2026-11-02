// Terminal graphics backends for the Geekify music desk.
// In VS Code 1.110+, Kitty graphics can render PNGs directly in the existing terminal.
// These functions never open a window, browser, or external terminal process.
import { stdin, stdout } from 'node:process';

const APC='\x1b_G';
const ST='\x1b\\';
const esc='\x1b[';
const clamp=(n,min,max)=>Math.min(max,Math.max(min,Math.trunc(Number(n)||0)));

export function preferredGraphicsProtocol(env=process.env){
  const override=String(env.GEEKIFY_GRAPHICS||'').toLowerCase();
  if(override==='kitty'||override==='iterm'||override==='ansi')return override;
  const name=String(env.TERM_PROGRAM||'').toLowerCase();
  if(name.includes('vscode')||env.VSCODE_PID||env.KITTY_WINDOW_ID||name.includes('ghostty'))return 'kitty';
  if(name.includes('iterm')||name.includes('wezterm')||env.WEZTERM_PANE)return 'iterm';
  return 'ansi';
}

// A query probe avoids emitting hundreds of kilobytes of invisible escapes when
// the VS Code setting terminal.integrated.enableImages is disabled.
// Some terminals answer the device-attributes query before responding to Kitty.
// Continue to wait briefly so an early DA response cannot mask working graphics.
export async function probeKittyGraphics({input=stdin,output=stdout,timeoutMs=950}={}){
  if(!input.isTTY||!output.isTTY||typeof input.setRawMode!=='function')return false;
  const wasRaw=Boolean(input.isRaw);
  const probeId=739031;
  let collected='';
  if(!wasRaw)input.setRawMode(true);
  input.resume();
  return new Promise(resolve=>{
    let complete=false;
    let timeout;
    const finish=ok=>{
      if(complete)return;
      complete=true;
      clearTimeout(timeout);
      input.off('data',onData);
      if(!wasRaw){try{input.setRawMode(false);}catch{}}
      resolve(ok);
    };
    const onData=chunk=>{
      collected+=chunk.toString('utf8');
      if(collected.length>5000)collected=collected.slice(-5000);
      if(collected.includes(APC+'i='+probeId+';OK'+ST)){finish(true);return;}
      if(collected.includes(APC+'i='+probeId+';ERR')){finish(false);return;}
      // Do not treat an early CSI c device-attributes reply as a graphics failure.
      // Kitty replies can arrive asynchronously after that reply.
    };
    input.on('data',onData);
    timeout=setTimeout(()=>finish(false),clamp(timeoutMs,100,5000));
    // Query a 1x1 24-bit RGB pixel, then request primary device attributes.
    output.write(APC+'i='+probeId+',s=1,v=1,a=q,t=d,f=24;AAAA'+ST+esc+'c');
  });
}

// iTerm2 IIP remains a targeted fallback for terminals that support it.
export function encodeInlineImage(png,columns,rows){
  if(!Buffer.isBuffer(png))throw new TypeError('Expected a PNG buffer.');
  const c=clamp(columns,1,500),r=clamp(rows,1,200);
  return '\x1b]1337;File=inline=1;size='+png.length+';width='+c+
    ';height='+r+';preserveAspectRatio=0;doNotMoveCursor=1:'+png.toString('base64')+'\x07';
}

// Kitty requires base64 chunks <= 4096 bytes. Two image IDs are alternated by
// the application, deleting the previous placement only after the replacement
// has been transmitted. This avoids accumulating full-screen frame images.
export function encodeKittyImage(png,{columns,rows,imageId=938201,placementId=1}={}){
  if(!Buffer.isBuffer(png))throw new TypeError('Expected a PNG buffer.');
  const c=clamp(columns,1,500),r=clamp(rows,1,200);
  const id=clamp(imageId,1,4294967295),placement=clamp(placementId,1,4294967295);
  const base64=png.toString('base64');
  const parts=[];
  const count=Math.max(1,Math.ceil(base64.length/4096));
  for(let i=0;i<count;i++){
    const more=i<count-1?1:0;
    const params=i===0?
      'a=T,f=100,t=d,i='+id+',p='+placement+',c='+c+',r='+r+',C=1,q=2,m='+more
      :'m='+more;
    parts.push(APC+params+';'+base64.slice(i*4096,(i+1)*4096)+ST);
  }
  return parts.join('');
}
export function kittyDeleteImage(imageId){
  const id=clamp(imageId,1,4294967295);
  return APC+'a=d,d=I,i='+id+',q=2;'+ST;
}
