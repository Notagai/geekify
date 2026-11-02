import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { demoCover,coverToAnsiRows,loadSpotifyCover } from './cover.mjs';

test('placeholder album art is a full RGB image',()=>{
  const cover=demoCover();
  assert.equal(cover.data.length,32*32*3);
  const lines=coverToAnsiRows(cover,20,8);
  assert.equal(lines.length,8);
  for(const line of lines){
    assert.equal((line.match(/▀/g)||[]).length,20);
    assert.match(line,/\x1b\[38;2;/);
    assert.match(line,/\x1b\[48;2;/);
  }
});
test('Spotify cover is decoded to a 32x32 RGB image',async()=>{
  const previous=globalThis.fetch;
  const jpeg=await sharp({create:{width:32,height:32,channels:3,background:{r:130,g:80,b:40}}}).jpeg().toBuffer();
  globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers({'content-length':String(jpeg.length)}),arrayBuffer:async()=>jpeg});
  try{
    const picture=await loadSpotifyCover('https://i.scdn.co/image/test-cover');
    assert.equal(picture.data.length,32*32*3);
    assert.ok(picture.data[0]>100);
  }finally{globalThis.fetch=previous;}
});
test('non-Spotify image URLs are refused',async()=>{
  await assert.rejects(()=>loadSpotifyCover('https://invalid.example.com/image.png'),/Untrusted/);
});
