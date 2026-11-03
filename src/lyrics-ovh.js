// Optional plain-text backup when LRCLIB has no matching record.
// This endpoint does not provide timestamps: never label its result synchronized.
const API='https://api.lyrics.ovh/v1/';
export async function lookupPlainBackup(track,signal){
  if(!track?.title||!track?.primaryArtist)return null;
  const artist=String(track.primaryArtist).trim();
  const title=String(track.title).trim();
  if(!artist||!title)return null;
  const url=API+encodeURIComponent(artist)+'/'+encodeURIComponent(title);
  const timeout=AbortSignal.timeout(6500);
  const abort=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:abort});
    if(!response.ok)return null;
    const data=await response.json();
    const lyricText=typeof data?.lyrics==='string'?data.lyrics.trim():'';
    if(!lyricText||lyricText.length>180000)return null;
    // Reject HTML and common "not found" bodies from third-party responses.
    if(/<[^>]+>/.test(lyricText)||/^no lyrics found/i.test(lyricText))return null;
    const plain=lyricText.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(!plain.length)return null;
    return {lines:[],plain,status:'plain',source:'lyrics.ovh'};
  }catch(error){
    if(signal?.aborted)throw error;
    return null; // Offline, timed out or unavailable: do not break player.
  }
}
