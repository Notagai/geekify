import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSpotifyFailure, SpotifyApi, trackInfo, playlistTrackItems } from './spotify.mjs';

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
