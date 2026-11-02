import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {sceneSvg,hitTest,TABS,WIDTH,HEIGHT} from '../cli/lyrics-scene.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'assets/geekify/manifest.json'),'utf8'));

test('Every modular original Geekify skin is a valid separate PNG',async()=>{
  assert.ok(manifest.assets.length>=35);
  const ids=new Set();
  for(const item of manifest.assets){
    assert.ok(item.file.startsWith('assets/geekify/ui/'));
    assert.ok(!ids.has(item.id),'Duplicate asset '+item.id);
    ids.add(item.id);
    const file=resolve(root,item.file);
    assert.ok(existsSync(file),item.file);
    const meta=await sharp(readFileSync(file)).metadata();
    assert.equal(meta.format,'png');
    assert.equal(meta.width,item.size[0]);
    assert.equal(meta.height,item.size[1]);
  }
  assert.ok(ids.has('paper/lyrics-panel'));
  assert.ok(ids.has('player/progress-knob'));
  assert.ok(ids.has('frame/wood-tile'));
  assert.ok(![...ids].some(id=>/sprite|ren|reina/.test(id)));
});

test('Lyrics-first original art renders independently of sprite data',async()=>{
  const assets={};
  for(const item of manifest.assets){
    assets[item.id]='data:image/png;base64,'+readFileSync(resolve(root,item.file)).toString('base64');
  }
  const svg=sceneSvg({tab:'now',subtab:'lyrics',playing:true,demo:true,
    track:{title:'Song & <Test>',artist:'Artist',durationMs:160000},progressMs:80000,
    lyricsPrev:['previous line'],lyricsCurrent:['CURRENT LYRIC'],lyricsNext:['following line']},assets);
  assert.ok(svg.includes('CURRENT LYRIC'));
  assert.ok(svg.includes('Song &amp; &lt;Test&gt;'));
  assert.ok(svg.includes('data:image/png;base64,'));
  assert.ok(!svg.includes('renSpriteSvg'));
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  const meta=await sharp(png).metadata();
  assert.equal(meta.width,WIDTH);assert.equal(meta.height,HEIGHT);
});

test('Six navigation tabs and image-backed playback control hotspots',()=>{
  assert.deepEqual(TABS,['now','search','library','playlists','devices','settings']);
  assert.deepEqual(hitTest(134,154),{type:'tab',value:'now'});
  assert.deepEqual(hitTest(128,393),{type:'tab',value:'settings'});
  assert.deepEqual(hitTest(880,582),{type:'play'});
  assert.deepEqual(hitTest(360,90),{type:'lyrics'});
  assert.deepEqual(hitTest(525,90),{type:'queue'});
  assert.deepEqual(hitTest(450,245,'library'),{type:'item',index:2});
});

test('Only original Geekify skins are used by the graphical app',()=>{
  const app=readFileSync(resolve(root,'cli/graphics-app.mjs'),'utf8');
  assert.ok(app.includes('assets/geekify/manifest.json'));
  assert.ok(!app.includes('assets/foldered/'));
  assert.ok(!app.includes('renSpriteSvg'));
  assert.ok(!app.includes('reinaSpriteSvg'));
});
