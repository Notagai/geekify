import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
test('Distinct visual and terminal-native Geekify entrypoints',()=>{
  assert.equal(pkg.bin.geekify,'./bin/geekify.mjs');
  assert.equal(pkg.bin['geekify-fast'],'./bin/geekify-fast.mjs');
  assert.equal(pkg.main,'./vscode/extension.cjs');
  assert.equal(pkg.contributes.commands[0].command,'geekify.open');
  assert.ok(pkg.activationEvents.includes('onUri'));
  assert.ok(pkg.engines.vscode);
});
test('VS Code extension uses a real Webview with local static images',()=>{
  const source=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
  const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
  assert.ok(source.includes('createWebviewPanel'));
  assert.ok(source.includes('registerUriHandler'));
  assert.ok(ui.includes('ResizeObserver'));
  assert.ok(ui.includes('onSpotifyWebPlaybackSDKReady'));
  assert.ok(!ui.includes('sharp('));
  for(const path of ['vscode/panel.html','vscode/panel.css','vscode/panel.js'])
    assert.ok(existsSync(resolve(root,path)));
});
test('Both command help paths run without VS Code or Spotify',()=>{
  for(const cmd of ['geekify','geekify-fast']){
    const result=spawnSync(process.execPath,[resolve(root,'bin',cmd+'.mjs'),'--help'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Spotify|spotify/);
  }
});
test('Extension files have valid JavaScript syntax',()=>{
  for(const file of ['vscode/extension.cjs','vscode/panel.js','bin/geekify.mjs','bin/geekify-fast.mjs']){
    const result=spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
});
