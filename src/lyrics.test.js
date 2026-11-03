import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lyricIndex, scoreMatch, lookupLyrics } from './lyrics.js';
test('parse timed LRC and find current line',()=>{
  const lines=parseLrc('[ar:test]\n[00:01.2] first\n[00:04.500] second\n[01:01] third');
  assert.deepEqual(lines.map(x=>x.timeMs),[1200,4500,61000]);
  assert.equal(lyricIndex(lines,4600),1);
  assert.equal(lyricIndex(lines,0),-1);
  assert.equal(lyricIndex([],4600),-1);
});
test('multiple timestamps and metadata are handled',()=>{
  const lines=parseLrc('[ar:sample]\n[00:02.00][00:03.00] echo\n[00:04.00] ');
  assert.deepEqual(lines.map(x=>x.timeMs),[2000,3000]);
});
test('match rejects wrong artist and implausible duration',()=>{
  const track={title:'Night Drive',primaryArtist:'Artist One',durationMs:200000};
  assert.equal(scoreMatch({trackName:'Night Drive',artistName:'Completely Different',duration:200,syncedLyrics:'yes'},track),-1);
  assert.equal(scoreMatch({trackName:'Night Drive',artistName:'Artist One',duration:260,syncedLyrics:'yes'},track),-1);
  assert.ok(scoreMatch({trackName:'Night Drive',artistName:'Artist One',duration:202,syncedLyrics:'yes'},track)>0);
});
test('exact match fallback: search finds a version with synced lyrics',async()=>{
  const oldFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    if(String(url).includes('/api/get?'))return {ok:false,status:404};
    return {ok:true,status:200,json:async()=>[
      {trackName:'Different Track',artistName:'Artist One',duration:200,syncedLyrics:'[00:01] wrong'},
      {trackName:'Night Drive',artistName:'Artist One',duration:200,syncedLyrics:'[00:01] found\n[00:04] again'}
    ]};
  };
  try{
    const result=await lookupLyrics({title:'Night Drive',primaryArtist:'Artist One',durationMs:200000,album:'Some Album'});
    assert.equal(result.status,'synced');
    assert.deepEqual(result.lines.map(x=>x.text),['found','again']);
    assert.equal(calls.length,2);
  }finally{globalThis.fetch=oldFetch;}
});
test('plain only lyrics are reported as unsynced, not misrepresented as synced',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({trackName:'Plain Only',artistName:'Artist One',duration:200,plainLyrics:'one\ntwo'})});
  try {
    const r=await lookupLyrics({title:'Plain Only',primaryArtist:'Artist One',durationMs:200000});
    assert.equal(r.status,'plain');assert.equal(r.lines.length,0);assert.deepEqual(r.plain,['one','two']);
  }finally{globalThis.fetch=oldFetch;}
});

test('lyrics.ovh backup still runs if LRCLIB returns server errors',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes('lrclib.net')
    ?{ok:false,status:503}
    :{ok:true,status:200,json:async()=>({lyrics:'first line\nsecond line'})};
  try{
    const result=await lookupLyrics({title:'Backup Test Song',primaryArtist:'Backup Test Artist',durationMs:185000});
    assert.equal(result.status,'plain');
    assert.deepEqual(result.plain,['first line','second line']);
  }finally{globalThis.fetch=oldFetch;}
});
test('title-only LRCLIB search finds verified artist when constrained search misses',async()=>{
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const address=String(url);
    if(address.includes('/api/get?'))return {ok:false,status:404};
    return {ok:true,status:200,json:async()=>address.includes('q=')
      ?[{trackName:'Fallback Search Song',artistName:'Fallback Search Artist',duration:190,syncedLyrics:'[00:01] line'}]:[]};
  };
  try{
    const result=await lookupLyrics({title:'Fallback Search Song',primaryArtist:'Fallback Search Artist',durationMs:190000});
    assert.equal(result.status,'synced');
  }finally{globalThis.fetch=oldFetch;}
});

test('Gde Ti matches Cyrillic title and a credited collaborator',()=>{
  const song={title:'Gde Ti',primaryArtist:'Килджо',artist:'Килджо, Immoral Freak',durationMs:110000};
  assert.ok(scoreMatch({trackName:'Где Ты',artistName:'Immoral Freak',duration:110,syncedLyrics:'[00:01] sample'},song)>0);
  assert.equal(scoreMatch({trackName:'Где Ты',artistName:'Unrelated Artist',duration:110},song),-1);
  assert.equal(scoreMatch({trackName:'Где Ты',artistName:'Immoral Freak',duration:180},song),-1);
});
test('Butterflies by Zeli does not match a same-title song by another artist',()=>{
  const song={title:'Butterflies',primaryArtist:'Zeli',artist:'Zeli',durationMs:166000};
  assert.equal(scoreMatch({trackName:'Butterflies',artistName:'Other Singer',duration:166},song),-1);
  assert.ok(scoreMatch({trackName:'Butterflies',artistName:'Zeli',duration:166},song)>0);
});
test('lyrics fallback searches collaborating artist if primary artist has no match',async()=>{
  const oldFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async url=>{
    const u=String(url);calls.push(u);
    if(u.includes('/api/get?'))return {ok:false,status:404};
    if(u.includes('/api/search?'))return {ok:true,status:200,json:async()=>u.includes('Immoral+Freak')?
      [{trackName:'Gde Ti',artistName:'Immoral Freak',duration:110,syncedLyrics:'[00:01] synced'}]:[]};
    return {ok:false,status:404};
  };
  try{
    const result=await lookupLyrics({title:'Gde Ti',primaryArtist:'Килджо',artist:'Килджо, Immoral Freak',durationMs:110000});
    assert.equal(result.status,'synced');
    assert.ok(calls.some(u=>u.includes('Immoral+Freak')));
  }finally{globalThis.fetch=oldFetch;}
});
