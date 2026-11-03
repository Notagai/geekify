import {lookupPlainBackup} from './lyrics-ovh.js';
// Public LRCLIB lookup: exact match first, then a carefully scored search fallback.
// Never display another song's lyrics merely because its title looks similar.
const cache = new Map();
const BASE = 'https://lrclib.net/api';
const NORMAL = /[^\p{L}\p{N}]+/gu;
const normalize = text => String(text || '').toLocaleLowerCase().normalize('NFKC').replace(NORMAL, ' ').trim();
// Normalize Cyrillic/Latin spellings without treating an unrelated song as a match.
const CYRILLIC={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
const phonetic = value => normalize(String(value||'').toLocaleLowerCase().replace(/[а-яё]/g,c=>CYRILLIC[c]||c)).replace(/y/g,'i');
const artists = value => String(value||'').split(/\\s*(?:,|\\s[&+]\\s|\\s(?:feat\\.?|ft\\.?|featuring)\\s)\\s*/i).map(x=>x.trim()).filter(Boolean);
const distinct = values => [...new Set(values.filter(Boolean))];
const sameTitle=(a,b)=>{const x=phonetic(cleanTitle(a)),y=phonetic(cleanTitle(b));return Boolean(x&&y&&(x===y||(x.length>=9&&y.length>=9&&(x.includes(y)||y.includes(x)))));};
const sameArtist=(a,b)=>{
  const x=distinct(artists(a).map(phonetic)),y=distinct(artists(b).map(phonetic));
  return x.some(p=>y.some(q=>p===q||(p.length>=7&&q.length>=7&&(p.includes(q)||q.includes(p)))));
};
const cleanTitle = title => String(title || '')
  .replace(/\s*[\(\[]\s*(?:feat\.?|ft\.?|featuring)\b[^\)\]]*[\)\]]/ig, '')
  .replace(/\s*[\(\[]\s*(?:remaster(?:ed)?|radio edit|single version|album version|explicit|clean)\b[^\)\]]*[\)\]]/ig, '')
  .replace(/\s*[-–]\s*(?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?$/ig,'')
  .replace(/\s*\((?:feat\.?|ft\.?)[^)]*\)/ig,'').trim();

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
  const want=phonetic(cleanTitle(track.title)), got=phonetic(cleanTitle(record.trackName||record.name));
  const artist=phonetic(track.primaryArtist),foundArtist=phonetic(record.artistName);
  if(!sameTitle(track.title,record.trackName||record.name)||!sameArtist(track.artist||track.primaryArtist,record.artistName))return -1;
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
  const key=[track.title,track.primaryArtist,track.artist,track.album,track.durationMs].join('|');
  const cached=cache.get(key);
  if(cached&&cached.until>Date.now())return cached.value;
  const exact={track_name:track.title,artist_name:track.primaryArtist};
  if(track.album)exact.album_name=track.album;
  if(track.durationMs)exact.duration=String(Math.round(track.durationMs/1000));
  // A provider outage should not prevent the independent backup from working.
  let candidate=null;
  let providerError=null;
  try{candidate=await getJson('/get',exact,signal);}
  catch(error){if(signal?.aborted)throw error;providerError=error;}
  if(scoreMatch(candidate,track)<0 || !candidate?.syncedLyrics) {
    const variants=distinct([track.title,cleanTitle(track.title)]);
    const names=distinct([track.primaryArtist,...artists(track.artist||track.primaryArtist)]);
    // Search all credited artists: many releases are indexed under a
    // collaborator, not the first Spotify artist.
    const searches=[...variants.flatMap(title=>names.map(name=>({track_name:title,artist_name:name}))),
      ...variants.map(title=>({q:title})),...variants.map(title=>({q:title+' '+track.primaryArtist}))];
    for(const params of searches){
      let results;
      try{results=await getJson('/search',params,signal);}
      catch(error){if(signal?.aborted)throw error;providerError=error;continue;}
      if(!Array.isArray(results))continue;
      const scored=results.map(r=>({item:r,score:scoreMatch(r,track)})).filter(x=>x.score>=0)
        .sort((a,b)=>b.score-a.score);
      if(scored.length&&(scoreMatch(candidate,track)<0||scored[0].score>scoreMatch(candidate,track)))candidate=scored[0].item;
      if(candidate?.syncedLyrics)break;
    }
  }
  // Two-pass priority: prefer synchronized lyrics from every configured
  // provider before settling for plain lyrics. Currently LRCLIB is the only
  // authorized timed provider; lyrics.ovh is the plain-text backup.
  let value={lines:[],plain:[],status:'missing'};
  if(scoreMatch(candidate,track)>=0){
    const lines=parseLrc(candidate.syncedLyrics);
    const plain=String(candidate.plainLyrics||'').split(/\r?\n/).filter(Boolean);
    value={lines,plain,status:lines.length?'synced':plain.length?'plain':'missing',source:'LRCLIB'};
  }
  if(value.status!=='synced'&&value.status!=='plain'){
    const variants=distinct([track.title,cleanTitle(track.title)]);
    const names=distinct([track.primaryArtist,...artists(track.artist||track.primaryArtist)]);
    for(const title of variants){
      for(const primaryArtist of names){
        value=await lookupPlainBackup({...track,title,primaryArtist},signal)||value;
        if(value.status!=='missing')break;
      }
      if(value.status!=='missing')break;
    }
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
