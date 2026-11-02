// Album-cover renderer for normal ANSI true-colour terminals.
// Each ▀ character represents two RGB pixels; no image-protocol support is required.
const SIZE = 32;
const MAX_BYTES = 4 * 1024 * 1024;
const cache = new Map();
const rgb = (r,g,b,background=false) => '\x1b['+(background?'48':'38')+';2;'+r+';'+g+';'+b+'m';
const clamp = v => Math.max(0,Math.min(255,Math.round(v)));

export function demoCover() {
  const data=new Uint8Array(SIZE*SIZE*3);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const at=(y*SIZE+x)*3;
    const sky=y<15, sun=(x-21)**2+(y-12)**2<56;
    let r,g,b;
    if(sun){[r,g,b]=[248,205,145];}
    else if(sky){[r,g,b]=[86+y*5,66+y*2,104+y*2];}
    else if(y<25){[r,g,b]=[156+(y-15)*4,78+(y-15)*3,99+(y-15)*3];}
    else {[r,g,b]=[48+(x%4)*4,38+(y%4)*4,59];}
    if(y>=24 && x>3 && x<10){r=35;g=33;b=52;}
    if(y>=20 && x>12 && x<19){r=38;g=34;b=52;}
    data[at]=clamp(r);data[at+1]=clamp(g);data[at+2]=clamp(b);
  }
  return {width:SIZE,height:SIZE,data};
}

export function coverToAnsiRows(art, width=18, rows=8) {
  width=Math.max(2,Math.min(30,Math.floor(width)));
  rows=Math.max(2,Math.min(15,Math.floor(rows)));
  const source=art?.data?.length===art?.width*art?.height*3?art:demoCover();
  const px=(x,y)=>{
    const sx=Math.min(source.width-1,Math.floor((x+.5)*source.width/width));
    const sy=Math.min(source.height-1,Math.floor((y+.5)*source.height/(rows*2)));
    const i=(sy*source.width+sx)*3;
    return [source.data[i],source.data[i+1],source.data[i+2]];
  };
  const output=[];
  for(let y=0;y<rows;y++){
    let row='';
    for(let x=0;x<width;x++){
      const upper=px(x,y*2),lower=px(x,y*2+1);
      row+=rgb(...upper)+rgb(...lower,true)+'▀';
    }
    output.push(row+'\x1b[0m');
  }
  return output;
}

export async function loadSpotifyCover(url,{signal}={}) {
  if(typeof url!=='string'||!url) return null;
  const parsed=new URL(url);
  // Spotify album covers are served over HTTPS from Spotify image hosts.
  if(parsed.protocol!=='https:' || !/(^|\.)scdn\.co$|(^|\.)spotifycdn\.com$|(^|\.)spotify\.com$/.test(parsed.hostname)) {
    throw new Error('Untrusted album-cover host.');
  }
  const fromCache=cache.get(url);
  if(fromCache)return fromCache;
  // sharp decodes common Spotify JPEG / PNG images cross-platform.
  let sharp;
  try {sharp=(await import('sharp')).default;}
  catch {throw new Error('Install image support with npm install (sharp is optional).');}
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error('Album-cover HTTP '+response.status);
  const size=Number(response.headers.get('content-length')||0);
  if(size>MAX_BYTES)throw new Error('Album cover exceeds size limit.');
  const body=await response.arrayBuffer();
  if(body.byteLength>MAX_BYTES)throw new Error('Album cover exceeds size limit.');
  const decoded=await sharp(Buffer.from(body),{limitInputPixels:2000000})
    .resize(SIZE,SIZE,{fit:'cover'}).removeAlpha().toColourspace('srgb')
    .raw().toBuffer({resolveWithObject:true});
  if(decoded.info.channels!==3)throw new Error('Unsupported album image format.');
  const result={width:SIZE,height:SIZE,data:new Uint8Array(decoded.data)};
  cache.set(url,result);
  if(cache.size>24)cache.delete(cache.keys().next().value);
  return result;
}
