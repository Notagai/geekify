import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSpotifyFailure, trackInfo, playlistTrackItems } from './spotify.mjs';

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
