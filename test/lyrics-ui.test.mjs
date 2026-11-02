import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { GeekifyGraphicsApp, terminalSceneLayout, terminalPlacement, terminalMouseToScene } from '../cli/graphics-app.mjs';
import { sceneSvg,hitTest,WIDTH,HEIGHT,TABS } from '../cli/lyrics-scene.mjs';

test('Music desk renders original Geekify pixel-art skins, no mascot',async()=>{
  const app=new GeekifyGraphicsApp({demo:true,forceImages:true});
  await app.loadAssets();
  assert.match(app.assets['frame/wood-tile'],/^data:image\/png;base64,/);
  assert.match(app.assets['paper/tab-active'],/^data:image\/png;base64,/);
  assert.match(app.assets['paper/tab-inactive'],/^data:image\/png;base64,/);
  assert.match(app.assets['paper/lyrics-panel'],/^data:image\/png;base64,/);
  const image=sceneSvg(app.renderState(),app.assets);
  assert.ok(image.includes('url(#geekify-wood)'));
  assert.ok(image.includes('Lyrics'));
  assert.ok(image.includes('Midnight Frequency'));
  assert.ok(!image.includes('renSprite'));
  const png=await sharp(Buffer.from(image)).resize(960,540).png().toBuffer();
  const meta=await sharp(png).metadata();
  assert.equal(meta.format,'png');
  assert.equal(meta.width,960);
  assert.equal(meta.height,540);
});

test('Lyrics occupy main panel; track details are in compact bottom player',()=>{
  const svg=sceneSvg({
    tab:'now',subtab:'lyrics',demo:true,
    track:{title:'Track & <>',artist:'Original artist',durationMs:120000},
    lyricsPrev:['A previous line'],
    lyricsCurrent:['THE CURRENT LYRIC'],
    lyricsNext:['A following line'],progressMs:50000
  });
  assert.ok(svg.includes('THE CURRENT LYRIC'));
  assert.ok(svg.includes('A previous line'));
  assert.ok(svg.includes('A following line'));
  assert.ok(svg.includes('Track &amp; &lt;&gt;'));
  assert.ok(!svg.includes('Ren'));
});

test('App interactions map to proper navigation and playback hotspots',()=>{
  assert.deepEqual(TABS,['now','search','library','playlists','devices','settings']);
  assert.deepEqual(hitTest(130,154),{type:'tab',value:'now'});
  assert.deepEqual(hitTest(880,582),{type:'play'});
  assert.deepEqual(hitTest(360,90),{type:'lyrics'});
  assert.deepEqual(hitTest(525,90),{type:'queue'});
  assert.deepEqual(hitTest(390,245,'library'),{type:'item',index:1});
  assert.equal(hitTest(9,9),null);
});

test('16:9 art preserves proportions even in very tall terminal panes',()=>{
  assert.equal(WIDTH/HEIGHT,16/9);
  const layout=terminalSceneLayout(120,74);
  assert.ok(layout.top>0);
  assert.equal(layout.left,0);
  assert.ok(Math.abs(layout.contentWidth/layout.contentHeight-16/9)<0.012);
});

test('Graphical UI stays inset from the terminal edges',()=>{
  const placement=terminalPlacement(120,45);
  assert.deepEqual(placement,{anchorCol:3,anchorRow:2,columns:116,rows:43});
  assert.ok(placement.anchorCol+placement.columns-1<120);
  assert.ok(placement.anchorRow+placement.rows-1<45);
  const tiny=terminalPlacement(4,3);
  assert.ok(tiny.columns>=1&&tiny.rows>=1);
});

test('Mouse mapping matches the inset graphical placement',()=>{
  const placement=terminalPlacement(120,45);
  const layout=terminalSceneLayout(placement.columns,placement.rows);
  assert.equal(terminalMouseToScene(1,1,placement,layout),null);
  assert.equal(terminalMouseToScene(120,45,placement,layout),null);
  const scenePoint={x:880,y:582};
  const col=placement.anchorCol+Math.floor(
    (layout.left+scenePoint.x/WIDTH*layout.contentWidth)/layout.width*placement.columns);
  const row=placement.anchorRow+Math.floor(
    (layout.top+scenePoint.y/HEIGHT*layout.contentHeight)/layout.height*placement.rows);
  const mapped=terminalMouseToScene(col,row,placement,layout);
  assert.ok(mapped);
  assert.deepEqual(hitTest(mapped.x,mapped.y),{type:'play'});
});
