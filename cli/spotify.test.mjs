import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSpotifyFailure, SpotifyApi, trackInfo, playlistTrackItems, playlistEntryShape } from './spotify.mjs';

test('403 errors retain the reason and action-specific diagnosis',()=>{
  const premium=describeSpotifyFailure(403,'PREMIUM_REQUIRED','Player command failed: Premium required','PUT','/me/player/play');
  assert.match(premium,/PREMIUM_REQUIRED/);
  assert.match(premium,/Premium/);
  const restricted=describeSpotifyFailure(403,'RESTRICTION_VIOLATED','Player command failed','PUT','/me/player/pause');
  assert.match(restricted,/blocks remote control/);
  assert.match(restricted,/\/me\/player\/pause/);
});
test('unknown 403 requests inspection rather than presuming user lacks Premium',()=>{
  const text=describeSpotifyFailure(403,'','Forbidden','PUT','/me/player/pause');
  assert.match(text,/geekify doctor/);
});
test('404 suggests an active device',()=>{
  assert.match(describeSpotifyFailure(404,'','Not found','PUT','/me/player/play'),/device/);
});

test('playlist /items returns track objects even when type is omitted',()=>{
  const song={id:'one',uri:'spotify:track:abc',name:'Real song',artists:[{name:'Real artist'}],duration_ms:120000};
  const items=playlistTrackItems({items:[{item:song},{track:{...song,id:'two'}},{item:null},{item:{type:'episode',name:'Podcast',uri:'spotify:episode:x'}}]});
  assert.equal(items.length,2);
  assert.equal(trackInfo(items[0]).title,'Real song');
  assert.equal(trackInfo(items[1]).artist,'Real artist');
});
test('playlist track parsing rejects unavailable and malformed rows',()=>{
  assert.equal(trackInfo({name:'Missing URI',type:'track'}),null);
  assert.equal(trackInfo({type:'episode',name:'Podcast',uri:'spotify:episode:x'}),null);
  assert.equal(trackInfo({type:'track',name:'Local',uri:'spotify:track:abc',is_local:true}),null);
});

test('playlist library loads every page instead of silently cutting off after 25',async()=>{
  const api=new SpotifyApi();
  const seen=[];
  api.playlists=async offset=>{
    seen.push(offset);
    return offset===0
      ?{offset:0,next:'next',items:Array.from({length:50},(_,i)=>({id:'playlist'+i,name:'Playlist '+i}))}
      :{offset:50,next:null,items:[{id:'playlist50',name:'Playlist 50'}]};
  };
  const playlists=await api.allPlaylists();
  assert.equal(playlists.length,51);
  assert.deepEqual(seen,[0,50]);
});
test('playlist API errors are surfaced instead of replaced with empty results',async()=>{
  const api=new SpotifyApi();
  api.playlists=async()=>{throw new Error('Spotify GET /me/playlists returned 403');};
  await assert.rejects(api.allPlaylists(),/403/);
});
test('playlist API invalid responses are not mistaken for empty libraries',async()=>{
  const api=new SpotifyApi();
  api.playlists=async()=>({unexpected:'shape'});
  await assert.rejects(api.allPlaylists(),/invalid playlists response/);
});

test('playlist pagination keeps first page after later page fails',async()=>{
  const api=new SpotifyApi();
  const pages=[];
  api.playlists=async offset=>{
    if(offset===0)return {offset:0,limit:50,next:'more',
      items:[{id:'playlist1',name:'First playlist'}]};
    throw new Error('Spotify offset request returned 403');
  };
  await assert.rejects(
    api.allPlaylists(10,page=>pages.push(page)),
    error=>{
      assert.match(error.message,/403/);
      assert.equal(error.partialItems.length,1);
      assert.equal(error.partialItems[0].name,'First playlist');
      return true;
    }
  );
  assert.equal(pages.length,1);
  assert.equal(pages[0][0].id,'playlist1');
});

test('playlist tracks paginate through every available page',async()=>{
  const api=new SpotifyApi();
  const offsets=[];
  api.playlistItems=async (_id,offset)=>{
    offsets.push(offset);
    return offset===0
      ?{offset:0,limit:50,next:'more',items:[{item:{type:'track',id:'a',name:'First',uri:'spotify:track:aaa'}}]}
      :{offset:50,limit:50,next:null,items:[{track:{type:'track',id:'b',name:'Second',uri:'spotify:track:bbb'}}]};
  };
  const result=await api.allPlaylistItems('123');
  assert.deepEqual(offsets,[0,50]);
  assert.deepEqual(playlistTrackItems(result).map(item=>trackInfo(item).title),['First','Second']);
});
test('playlist tracks preserve fetched rows if a later page fails',async()=>{
  const api=new SpotifyApi();
  api.playlistItems=async (_id,offset)=>{
    if(offset===0)return {offset:0,limit:50,next:'more',items:[{item:{id:'a',name:'Kept',uri:'spotify:track:aaa'}}]};
    const error=new Error('Spotify returned 403');error.status=403;throw error;
  };
  await assert.rejects(api.allPlaylistItems('123'),error=>{
    assert.equal(error.status,403);
    assert.equal(error.partialItems.length,1);
    return true;
  });
});
test('playlist-track pagination rejects malformed responses',async()=>{
  const api=new SpotifyApi();
  api.playlistItems=async()=>null;
  await assert.rejects(api.allPlaylistItems('123'),/invalid playlist tracks response/);
});

test('metadata-only playlist items retry the legacy track endpoint',async()=>{
  const api=new SpotifyApi();
  api.playlistItems=async()=>({items:Array.from({length:12},()=>({item:{type:'track'}})),next:null});
  let legacyCalls=0;
  api.legacyPlaylistItems=async()=>{legacyCalls++;return {items:[{track:{id:'0123456789abcdef',name:'Recovered song',artists:[{name:'Artist'}]}}],next:null};};
  const result=await api.allPlaylistItems('playlist123');
  assert.equal(legacyCalls,1);
  assert.equal(result.source,'tracks');
  assert.equal(playlistTrackItems(result).length,1);
  assert.equal(trackInfo(playlistTrackItems(result)[0]).uri,'spotify:track:0123456789abcdef');
});
test('playlist shape diagnostics contain no names or IDs',()=>{
  const summary=playlistEntryShape({items:[{item:{name:'Private title',id:'private123',uri:'spotify:track:private123'}},{track:{type:'episode'}}]});
  assert.match(summary,/item: 1/);
  assert.match(summary,/track: 1/);
  assert.doesNotMatch(summary,/Private title|private123/);
});

test('playing a playlist from a selected song preserves playlist context',async()=>{
  const api=new SpotifyApi();let captured;
  api.request=async(path,options)=>{captured={path,options};return null;};
  await api.playPlaylist('spotify:playlist:abc123','spotify:track:def456','device123');
  assert.equal(captured.path,'/me/player/play');
  assert.deepEqual(captured.options.body,{context_uri:'spotify:playlist:abc123',offset:{uri:'spotify:track:def456'}});
  assert.equal(captured.options.query.device_id,'device123');
});
