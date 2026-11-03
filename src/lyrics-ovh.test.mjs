import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupPlainBackup} from './lyrics-ovh.js';

test('lyrics.ovh fallback returns plain lyrics without invented timestamps',async()=>{
  const original=globalThis.fetch;
  let seen='';
  globalThis.fetch=async url=>{
    seen=String(url);
    return {ok:true,json:async()=>({lyrics:'Invented first line\nInvented second line'})};
  };
  try{
    const result=await lookupPlainBackup({primaryArtist:'Artist & Name',title:'Original Song'});
    assert.match(seen,/Artist%20%26%20Name\/Original%20Song/);
    assert.equal(result.status,'plain');
    assert.equal(result.source,'lyrics.ovh');
    assert.deepEqual(result.lines,[]);
    assert.deepEqual(result.plain,['Invented first line','Invented second line']);
  }finally{globalThis.fetch=original;}
});

test('lyrics.ovh fallback ignores 404 and unavailable responses',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:404});
  try{
    assert.equal(await lookupPlainBackup({primaryArtist:'Nobody',title:'Unavailable'}),null);
  }finally{globalThis.fetch=original;}
});
