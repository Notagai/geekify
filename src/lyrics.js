// Public LRCLIB lookup: exact match first, then a carefully scored search fallback.
// Never display another song's lyrics merely because its title looks similar.
const cache = new Map();
const BASE = 'https://lrclib.net/api';
const NORMAL = /[^\p{L}\p{N}]+/gu;
const normalize = text => String(text || '').toLocaleLowerCase().normalize('NFKC').replace(NORMAL, ' ').trim();
const cleanTitle = title => String(title || '')
  .replace(/\s*[\(\[]\s*(?:feat\.?|ft\.?|featuring)\b[^\)\]]*[\)\]]/ig, '')
  .replace(/\s*[\(\[]\s*(?:remaster(?:ed)?|radio edit|single version|album version|explicit|clean)\b[^\)\]]*[\)\]]/ig, '').trim();

export function parseLrc(source) {
  if (typeof source !== 'string') return [];
  const entries = [];
  for(const raw of source.split(/\r?\n/)) {
    const stamps=[...raw.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    if(!stamps.length)continue;
    const text=raw.replace(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g,'').trim();
    if(!text)continue;
    for(const m of stamps) {
      entries.push({timeMs: Math.round((Number(m[1])*60 + Number(m[2]) + Number('0.'+(m[3]||'0')))*1000),text});
    }
  }
  return entries.sort((a,b)=>a.timeMs-b.timeMs);
}
export function lyricIndex(lines,elapsedMs) {
  let low=0,high=lines.length-1,last=-1;
  while(low<=high){
    const m=(low+high)>>1;
    if(lines[m].timeMs<=elapsedMs){last=m;low=m+1;} else high=m-1;
  }
  return last;
}
export function scoreMatch(record,track) {
  if(!record || record.instrumental)return -1;
  const want=normalize(cleanTitle(track.title)), got=normalize(cleanTitle(record.trackName||record.name));
  const artist=normalize(track.primaryArtist), foundArtist=normalize(record.artistName);
  if(!want || !got || !artist || !foundArtist)return -1;
  // Require recognizable song AND main artist. Reject unrelated covers.
  if(want!==got && !(want.length>=8 && (got.includes(want)||want.includes(got))))return -1;
  if(artist!==foundArtist && !(artist.length>=5 && (foundArtist.includes(artist)||artist.includes(foundArtist))))return -1;
  const seconds=track.durationMs ? Math.round(track.durationMs/1000):0;
  const difference=seconds&&record.duration?Math.abs(seconds-record.duration):0;
  if(seconds&&record.duration&&difference>12)return -1;
  let score=want===got?50:25;
  score+=artist===foundArtist?30:15;
  score+=record.syncedLyrics?30:0;
  score+=record.plainLyrics?4:0;
  score+=Math.max(0,10-difference);
  return score;
}
async function getJson(path,params,signal) {
  const response=await fetch(BASE+path+'?'+new URLSearchParams(params),{
    headers:{'Accept':'application/json'},signal
  });
  if(response.status===404)return null;
  if(response.status===429){
    const err=new Error('LRCLIB rate limit reached.');
    err.retryAfter=Number(response.headers.get('Retry-After')||10);
    throw err;
  }
  if(!response.ok)throw new Error('Lyrics service returned '+response.status);
  return response.json();
}
export async function lookupLyrics(track,signal) {
  if(!track?.title||!track?.primaryArtist)return {lines:[],plain:[],status:'missing'};
  const key=[track.title,track.primaryArtist,track.album,track.durationMs].join('|');
  const cached=cache.get(key);
  if(cached&&cached.until>Date.now())return cached.value;
  const exact={track_name:track.title,artist_name:track.primaryArtist};
  if(track.album)exact.album_name=track.album;
  if(track.durationMs)exact.duration=String(Math.round(track.durationMs/1000));
  let candidate=await getJson('/get',exact,signal);
  if(scoreMatch(candidate,track)<0 || !candidate?.syncedLyrics) {
    // Drop album/duration constraints for the search fallback, which catches single/remaster releases.
    const variants=[track.title,cleanTitle(track.title)].filter((v,i,a)=>v&&a.indexOf(v)===i);
    for(const title of variants) {
      const results=await getJson('/search',{track_name:title,artist_name:track.primaryArtist},signal);
      if(!Array.isArray(results))continue;
      const scored=results.map(r=>({item:r,score:scoreMatch(r,track)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
      if(scored.length && (scoreMatch(candidate,track)<0 || scored[0].score>scoreMatch(candidate,track))) candidate=scored[0].item;
      if(candidate?.syncedLyrics)break;
    }
  }
  let value;
  if(scoreMatch(candidate,track)<0) value={lines:[],plain:[],status:'missing'};
  else {
    const lines=parseLrc(candidate.syncedLyrics);
    const plain=String(candidate.plainLyrics||'').split(/\r?\n/).filter(Boolean);
    value={lines,plain,status:lines.length?'synced':plain.length?'plain':'missing'};
  }
  // Cache misses briefly, since provider coverage changes.
  cache.set(key,{value,until:Date.now()+(value.status==='missing'?60000:3600000)});
  return value;
}
// Backward compatible return type for the existing web renderer.
export async function fetchLyrics(track,signal) {
  const result=await lookupLyrics(track,signal);
  return result.lines.length?result.lines:null;
}
