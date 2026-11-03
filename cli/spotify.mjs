import { accessToken } from './auth.mjs';
const BASE='https://api.spotify.com/v1';

// Preserve Spotify's API reason; a 403 may have several distinct causes.
export function describeSpotifyFailure(status, reason='', detail='', method='GET', pathname='') {
  const code=String(reason||'').toUpperCase();
  const userDetail=String(detail||'').slice(0,220);
  let hint='';
  if(status===401)hint='Reauthorize with geekify login.';
  else if(status===404)hint='Open Spotify Desktop, start a track and retry, or choose a device in tab 5.';
  else if(status===403) {
    if(code.includes('RESTRICTION')||userDetail.toLowerCase().includes('restriction violated'))hint='This device blocks remote control. Select another device or use Spotify directly.';
    else if(code.includes('PREMIUM'))hint='Spotify did not recognize Premium for this request. Check the authenticated account and app owner.';
    else if(code.includes('RESTRICTION'))hint='The selected Spotify device restricts remote control. Try Spotify Desktop.';
    else if(code.includes('SCOPE')||code.includes('PERMISSION'))hint='Playback-control permission is missing. Run geekify login again.';
    else hint='Run geekify doctor to inspect granted scopes, app access and the active device.';
  } else if(status===429)hint='Respect Retry-After and retry later.';
  return 'Spotify '+method+' '+pathname+' returned '+status+(code?' ['+code+']':'')+
    (userDetail?': '+userDetail:'')+(hint?'  '+hint:'');
}
export class SpotifyApi {
  async request(path,{method='GET',body,query}={}){
    const url=new URL(BASE+path);
    if(query)for(const [k,v] of Object.entries(query))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
    const response=await fetch(url,{
      method,headers:{Authorization:'Bearer '+await accessToken(),...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(response.status===204)return null;
    if(!response.ok){
      let payload=null;
      try{payload=await response.json();}catch{}
      const spotifyError=payload?.error;
      const reason=spotifyError?.reason||payload?.reason||'';
      const detail=spotifyError?.message||payload?.error_description||(typeof spotifyError==='string'?spotifyError:'');
      const error=new Error(describeSpotifyFailure(response.status,reason,detail,method,path));
      error.status=response.status;
      error.reason=reason;
      error.endpoint=method+' '+path;
      if(response.status===429){
        const delay=Number(response.headers.get('Retry-After')||15);
        error.retryAfter=Math.min(120,Math.max(5,Number.isFinite(delay)?delay:15));
      }
      throw error;
    }
    if(response.headers.get('content-type')?.includes('application/json'))return response.json();
    return null;
  }
  async playback(){return this.request('/me/player');}
  async queue(){return this.request('/me/player/queue');}
  async seek(positionMs,deviceId){
    return this.request('/me/player/seek',{method:'PUT',query:{
      position_ms:Math.max(0,Math.floor(Number(positionMs)||0)),
      ...(deviceId?{device_id:deviceId}:{})
    }});
  }
  async search(q,offset=0){return this.request('/search',{query:{q,type:'track,album,artist,playlist,show,episode',limit:10,offset}});}
  async recent(){return this.request('/me/player/recently-played',{query:{limit:30}});}
  async saved(offset=0){return this.request('/me/tracks',{query:{limit:25,offset}});}
  async playlists(offset=0){return this.request('/me/playlists',{query:{limit:25,offset}});}
  async playlistItems(id,offset=0){return this.request('/playlists/'+encodeURIComponent(id)+'/items',{query:{limit:25,offset}});}
  async devices(){return this.request('/me/player/devices');}
  async playPause(playing,deviceId){return this.request('/me/player/'+(playing?'pause':'play'),{method:'PUT',query:deviceId?{device_id:deviceId}:undefined});}
  async next(deviceId){return this.request('/me/player/next',{method:'POST',query:deviceId?{device_id:deviceId}:undefined});}
  async previous(deviceId){return this.request('/me/player/previous',{method:'POST',query:deviceId?{device_id:deviceId}:undefined});}
  async volume(percent,deviceId){return this.request('/me/player/volume',{method:'PUT',query:{volume_percent:Math.max(0,Math.min(100,Math.round(percent))),...(deviceId?{device_id:deviceId}:{})}});}
  async shuffle(enabled,deviceId){return this.request('/me/player/shuffle',{method:'PUT',query:{state:Boolean(enabled),...(deviceId?{device_id:deviceId}:{})}});}
  async repeat(mode,deviceId){return this.request('/me/player/repeat',{method:'PUT',query:{state:mode,...(deviceId?{device_id:deviceId}:{})}});}
  async playUri(uri,deviceId) {
    if(!uri||!/^spotify:(?:track|album|playlist):[A-Za-z0-9]+$/.test(uri))throw new Error('Invalid Spotify URI.');
    return this.request('/me/player/play',{method:'PUT',body:uri.startsWith('spotify:track:')?{uris:[uri]}:{context_uri:uri},query:deviceId?{device_id:deviceId}:undefined});
  }
  async transfer(id) {
    if(!id)throw new Error('This device does not have a transferable ID.');
    return this.request('/me/player',{method:'PUT',body:{device_ids:[id],play:true}});
  }
  async save(uri){return this.request('/me/library',{method:'PUT',query:{uris:uri}});}
}
export function playlistTrackItems(payload){
  // The /items endpoint returns rows shaped as {item: track}; older endpoints use {track: track}.
  // Preserve only actual playable tracks; never turn metadata or removed tracks into dummy rows.
  return (payload?.items||[]).map(row=>row?.item??row?.track??row)
    .filter(song=>trackInfo(song)!==null);
}

export function trackInfo(item){
  const song=item?.track||item?.item||item;
  if(!song || typeof song!=='object' || song.type==='episode' || song.is_local ||
    (song.type && song.type!=='track') || !song.name || !song.uri?.startsWith('spotify:track:'))return null;
  return {id:song.id,uri:song.uri,title:song.name,
    artist:song.artists?.map(a=>a.name).join(', ')||'Unknown artist',
    primaryArtist:song.artists?.[0]?.name||'Unknown artist',
    album:song.album?.name||'',durationMs:song.duration_ms||0,
    imageUrl:song.album?.images?.[0]?.url||''};
}
