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
  async addToQueue(uri,deviceId){
    if(!/^spotify:track:[A-Za-z0-9]+$/.test(uri||''))throw new Error('Invalid track URI');
    return this.request('/me/player/queue',{method:'POST',query:{uri,...(deviceId?{device_id:deviceId}:{})}});
  }
  async seek(positionMs,deviceId){
    return this.request('/me/player/seek',{method:'PUT',query:{
      position_ms:Math.max(0,Math.floor(Number(positionMs)||0)),
      ...(deviceId?{device_id:deviceId}:{})
    }});
  }
  async search(q,offset=0){return this.request('/search',{query:{q,type:'track,album,artist,playlist,show,episode',limit:10,offset}});}
  async recent(){return this.request('/me/player/recently-played',{query:{limit:30}});}
  async saved(offset=0){return this.request('/me/tracks',{query:{limit:25,offset}});}
  async playlists(offset=0){return this.request('/me/playlists',{query:{limit:50,offset}});}
  async allPlaylists(maxPages=10,onPage=()=>{}){
    // Each successful page should remain visible even if Spotify rejects a
    // later offset. Do not follow the returned next URL: Spotify has returned
    // obsolete /users/{id}/playlists URLs on this endpoint.
    const all=[];
    let offset=0;
    for(let page=0;page<maxPages;page++){
      let response;
      try{
        response=await this.playlists(offset);
        if(!response||!Array.isArray(response.items))
          throw new Error('Spotify returned an invalid playlists response.');
      }catch(error){
        if(all.length)error.partialItems=all;
        throw error;
      }
      all.push(...response.items.filter(item=>item&&typeof item.id==='string'));
      onPage([...all]);
      const nextOffset=Number(response.offset??offset)+Number(response.limit||50);
      if(!response.next||response.items.length===0||nextOffset<=offset)break;
      offset=nextOffset;
    }
    return all;
  }
  async playlistItems(id,offset=0){
    const path='/playlists/'+encodeURIComponent(id);
    try{return await this.request(path+'/items',{query:{limit:50,offset}});}
    catch(error){
      // Spotify has used both /items and /tracks for playlist entries.
      // Fall back only when the endpoint itself is missing, not on auth errors.
      if(error.status!==404&&error.status!==405)return Promise.reject(error);
      return this.request(path+'/tracks',{query:{limit:50,offset}});
    }
  }
  async legacyPlaylistItems(id,offset=0){
    return this.request('/playlists/'+encodeURIComponent(id)+'/tracks',{query:{limit:50,offset}});
  }
  async allPlaylistItems(id,maxPages=10){
    const all=[];
    let offset=0;
    for(let page=0;page<maxPages;page++){
      let response;
      try{
        response=await this.playlistItems(id,offset);
        if(!response||!Array.isArray(response.items))
          throw new Error('Spotify returned an invalid playlist tracks response.');
      }catch(error){
        if(all.length)error.partialItems=all;
        throw error;
      }
      all.push(...response.items);
      const nextOffset=Number(response.offset??offset)+Number(response.limit||50);
      if(!response.next||!response.items.length||nextOffset<=offset)break;
      offset=nextOffset;
    }
    // Spotify may return a successful /items response with metadata-only
    // entries. Try the older /tracks representation before giving up.
    if(all.length&&!playlistTrackItems({items:all}).length){
      const legacy=[];
      let legacyOffset=0;
      try{
        for(let page=0;page<maxPages;page++){
          const response=await this.legacyPlaylistItems(id,legacyOffset);
          if(!response||!Array.isArray(response.items))break;
          legacy.push(...response.items);
          const nextOffset=Number(response.offset??legacyOffset)+Number(response.limit||50);
          if(!response.next||!response.items.length||nextOffset<=legacyOffset)break;
          legacyOffset=nextOffset;
        }
        if(playlistTrackItems({items:legacy}).length)return {items:legacy,source:'tracks'};
      }catch{/* Keep the original successful response for diagnosis. */}
    }
    return {items:all,source:'items'};
  }
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
  async playPlaylist(contextUri,trackUri,deviceId){
    if(!/^spotify:playlist:[A-Za-z0-9]+$/.test(contextUri))throw new Error('Invalid playlist URI.');
    if(!/^spotify:track:[A-Za-z0-9]+$/.test(trackUri))throw new Error('Invalid track URI.');
    return this.request('/me/player/play',{method:'PUT',
      body:{context_uri:contextUri,offset:{uri:trackUri}},
      query:deviceId?{device_id:deviceId}:undefined});
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
  let song=item;
  for(let depth=0;depth<3&&song&&typeof song==='object';depth++){
    if(song.name||(!song.track&&!song.item))break;
    song=song.track??song.item;
  }
  if(!song || typeof song!=='object' || song.type==='episode' || song.is_local ||
    (song.type && song.type!=='track') || !song.name)return null;
  // Spotify sometimes omits uri from projections while retaining a valid ID.
  const uri=/^spotify:track:[A-Za-z0-9]+$/.test(song.uri||'')?song.uri:
    /^[A-Za-z0-9]{10,}$/.test(song.id||'')?'spotify:track:'+song.id:null;
  if(!uri)return null;
  return {id:song.id,uri,title:song.name,
    artist:song.artists?.map(a=>a.name).join(', ')||'Unknown artist',
    primaryArtist:song.artists?.[0]?.name||'Unknown artist',
    album:song.album?.name||'',durationMs:song.duration_ms||0,
    imageUrl:song.album?.images?.[0]?.url||''};
}

// Shape-only diagnostics. Never include song names, playlist names or IDs.
export function playlistEntryShape(payload){
  const rows=payload?.items||[];
  const counts={item:0,track:0,direct:0,missing:0,uri:0,id:0,name:0,episode:0,local:0};
  for(const row of rows){
    const kind=row?.item?'item':row?.track?'track':row?'direct':'missing';
    counts[kind]++;
    const value=row?.item??row?.track??row;
    if(value?.uri)counts.uri++;
    if(value?.id)counts.id++;
    if(value?.name)counts.name++;
    if(value?.type==='episode')counts.episode++;
    if(value?.is_local)counts.local++;
  }
  return Object.entries(counts).filter(([,value])=>value).map(([key,value])=>key+': '+value).join(', ')||'no entries';
}
