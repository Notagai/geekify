import { accessToken } from './auth.mjs';
const BASE='https://api.spotify.com/v1';
export class SpotifyApi {
  async request(path,{method='GET',body,query}={}){
    const url=new URL(BASE+path);
    if(query)for(const [k,v] of Object.entries(query)) if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
    const response=await fetch(url,{
      method,headers:{Authorization:'Bearer '+await accessToken(),...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(response.status===204)return null;
    if(response.status===429){
      const delay=Number(response.headers.get('Retry-After')||15);
      const error=new Error('Spotify rate limited requests. Retry later.');
      error.retryAfter=Math.min(120,Math.max(5,Number.isFinite(delay)?delay:15));
      throw error;
    }
    if(response.status===401)throw new Error('Spotify login expired. Run geekify login.');
    if(response.status===403)throw new Error('Spotify denied this request. Check Premium, app access, device and permission scopes.');
    if(response.status===404)throw new Error('Spotify resource missing. Open Spotify on a device and try again.');
    if(!response.ok) {
      const data=await response.json().catch(()=>null);
      throw new Error(data?.error?.message||'Spotify request failed ('+response.status+').');
    }
    if(response.headers.get('content-type')?.includes('application/json'))return response.json();
    return null;
  }
  async playback(){return this.request('/me/player');}
  async search(q,offset=0){return this.request('/search',{query:{q,type:'track',limit:25,offset}});}
  async saved(offset=0){return this.request('/me/tracks',{query:{limit:25,offset}});}
  async playlists(offset=0){return this.request('/me/playlists',{query:{limit:25,offset}});}
  async playlistItems(id,offset=0){return this.request('/playlists/'+encodeURIComponent(id)+'/items',{query:{limit:25,offset}});}
  async devices(){return this.request('/me/player/devices');}
  async playPause(playing){return this.request('/me/player/'+(playing?'pause':'play'),{method:'PUT'});}
  async next(){return this.request('/me/player/next',{method:'POST'});}
  async previous(){return this.request('/me/player/previous',{method:'POST'});}
  async volume(percent){return this.request('/me/player/volume',{method:'PUT',query:{volume_percent:Math.max(0,Math.min(100,Math.round(percent)))}});}
  async shuffle(enabled){return this.request('/me/player/shuffle',{method:'PUT',query:{state:Boolean(enabled)}});}
  async repeat(mode){return this.request('/me/player/repeat',{method:'PUT',query:{state:mode}});}
  async playUri(uri) {
    if(!uri||!/^spotify:(?:track|album|playlist):[A-Za-z0-9]+$/.test(uri))throw new Error('Invalid Spotify URI.');
    return this.request('/me/player/play',{method:'PUT',body:uri.startsWith('spotify:track:')?{uris:[uri]}:{context_uri:uri}});
  }
  async transfer(id) {
    if(!id)throw new Error('This device does not have a transferable ID.');
    return this.request('/me/player',{method:'PUT',body:{device_ids:[id],play:true}});
  }
  async save(uri){return this.request('/me/library',{method:'PUT',query:{uris:uri}});}
}
export function trackInfo(item){
  const song=item?.track||item?.item||item;
  if(!song||song.type!=='track')return null;
  return {id:song.id,uri:song.uri,title:song.name,
    artist:song.artists?.map(a=>a.name).join(', ')||'Unknown artist',
    primaryArtist:song.artists?.[0]?.name||'Unknown artist',
    album:song.album?.name||'',durationMs:song.duration_ms||0};
}
