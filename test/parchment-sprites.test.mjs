import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'assets/geekify/manifest.json'),'utf8'));
const sprites={
  'paper/grain-tile':[256,256],
  'paper/torn-top':[256,36],
  'paper/torn-bottom':[256,34],
  'paper/worn-left':[24,256],
  'paper/worn-right':[18,256],
  'paper/forest-edge':[384,130]
};

test('parchment asset pack contains six valid individual SVG sprites',()=>{
  for(const [id,size] of Object.entries(sprites)){
    const asset=manifest.assets.find(item=>item.id===id);
    assert.ok(asset,id+' missing from manifest');
    assert.deepEqual(asset.size,size);
    assert.ok(existsSync(resolve(root,asset.file)));
    const data=readFileSync(resolve(root,asset.file),'utf8');
    assert.ok(data.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(data.includes('viewBox="0 0 '+size.join(' ')+'"'));
    assert.ok(data.includes('shape-rendering="crispEdges"'));
    assert.ok(data.includes('</svg>'));
    assert.ok(!/<script|<foreignObject|<image/i.test(data),'no embedded scripts or external images');
  }
});

test('the webview tiles parchment rather than stretching a 16:9 sprite',()=>{
  const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
  const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
  assert.ok(css.includes('background-repeat:repeat;background-position:0 0;background-size:256px 256px'));
  assert.ok(css.includes('background-repeat:repeat-x,repeat-y,repeat-y,repeat-x,repeat-x'));
  assert.ok(css.includes('384px 130px,256px 34px'),'forest border has a stable tile width');
  assert.ok(!css.includes('background-size:100% calc(100% + 52px)'),'old stretched parchment forbidden');
  for(const id of Object.keys(sprites))assert.ok(ui.includes("assets['"+id+"']"),id+' unused');
});

test('repeating forest tiles close at the same mountain height at both edges',()=>{
  const forest=readFileSync(resolve(root,'assets/geekify/ui/paper/forest-edge.svg'),'utf8');
  assert.match(forest,/0,91/);
  assert.match(forest,/384,91/);
});
