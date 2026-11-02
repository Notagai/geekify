import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sceneSvg, renSpriteSvg, hitTest, SCENE_WIDTH, SCENE_HEIGHT } from '../cli/ren-scene.mjs';
import { encodeInlineImage, supportsInlineImages } from '../cli/ren-graphics.mjs';

test('Ren graphics renders into an actual PNG at detailed resolution',async()=>{
  const svg=sceneSvg({
    playing:true,
    frame:1,
    track:{title:'Test & <Track>',artist:'Ren',album:'Test',durationMs:140000},
    progressMs:70000,
    lyrics:['One','Two'],
    connected:false
  });
  assert.match(svg,/geekify/);
  assert.match(svg,/Test &amp; &lt;Track&gt;/);
  assert.notEqual(renSpriteSvg({frame:0}),renSpriteSvg({frame:1}));
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  const meta=await sharp(png).metadata();
  assert.equal(meta.width,SCENE_WIDTH);
  assert.equal(meta.height,SCENE_HEIGHT);
  assert.equal(meta.format,'png');
});

test('Navigation and Ren click targets resolve to the intended action',()=>{
  assert.deepEqual(hitTest(120,170,'now'),{type:'tab',value:'now'});
  assert.deepEqual(hitTest(120,280,'now'),{type:'tab',value:'library'});
  assert.deepEqual(hitTest(875,306,'now'),{type:'ren'});
  assert.deepEqual(hitTest(675,444,'now'),{type:'playback'});
  assert.deepEqual(hitTest(330,180,'playlists'),{type:'item',index:0});
  assert.equal(hitTest(400,190,'now'),null);
});

test('iTerm2 inline image encoding is bounded and explicitly inline',()=>{
  const payload=Buffer.from('sample');
  const sequence=encodeInlineImage(payload,110,35);
  assert.match(sequence,/\x1b\]1337;File=inline=1;size=6;width=110;height=35;preserveAspectRatio=0;doNotMoveCursor=1:/);
  assert.ok(sequence.endsWith('\x07'));
  assert.equal(supportsInlineImages({TERM_PROGRAM:'WezTerm'}),true);
  assert.equal(supportsInlineImages({WEZTERM_PANE:'3'}),true);
  assert.equal(supportsInlineImages({TERM_PROGRAM:'unknown'}),false);
  assert.equal(supportsInlineImages({GEEKIFY_FORCE_IMAGES:'1'}),true);
});

test('Search and playlist screens render as PNG too',async()=>{
  for(const tab of ['search','library','playlists','devices']){
    const svg=sceneSvg({
      tab,items:[{title:'Sample track',subtitle:'Sample artist'}],
      selected:0,query:'jazz',connected:true
    });
    assert.ok((await sharp(Buffer.from(svg)).png().toBuffer()).length>4000);
  }
});
