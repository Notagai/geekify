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
  assert.ok(pkg.activationEvents.includes('onStartupFinished'));
  assert.deepEqual(pkg.extensionKind,['ui']);
  assert.ok(pkg.engines.vscode);
});
test('VS Code extension uses a real Webview with local static images',()=>{
  const source=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
  const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
  assert.ok(source.includes('createWebviewPanel'));
  assert.ok(source.includes('vscode.window.registerUriHandler'), 'URI handlers must be registered through vscode.window');
  assert.ok(!source.includes('vscode.commands.registerUriHandler'));
  assert.ok(source.includes('startPanelBridge'));
  assert.ok(ui.includes("createElementNS(NS,'svg')"),'icons should render as complete SVGs');
  assert.ok(ui.includes("const workspace=make('div','workspace',frame)"),'responsive sections should use DOM layout');
  const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
  assert.ok(css.includes('@media(max-width:690px)'),'narrow editor has a stacked layout');
  assert.ok(!css.includes('width:1200px'),'no fixed 1200px board');
  for(const sprite of ['shuffle','previous','pause','next','repeat','progress-empty','progress-fill','progress-knob']){
    assert.ok(!ui.includes("'player/"+sprite+"'"),'broken '+sprite+' PNG must not be used as a UI control');
  }
  assert.ok(css.includes('background-image:var(--flowers-image)'));
  assert.ok(css.includes('background-image:var(--polaroid-image)'));
  assert.ok(ui.includes("progress.setAttribute('role','slider')"));
  assert.ok(ui.includes("transportButtons.pause.replaceChildren(icon("));
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
  for(const file of ['vscode/extension.cjs','vscode/panel.js','bin/geekify.mjs','bin/geekify-fast.mjs','cli/panel-bridge.mjs','cli/vscode-command.mjs','vscode/bridge.cjs','scripts/install-extension.mjs']){
    const result=spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
});

test('wood-and-ivy branding and all navigation icons use complete pixel sprites',()=>{
  const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
  const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
  const manifest=JSON.parse(readFileSync(resolve(root,'assets/geekify/manifest.json'),'utf8'));
  const ivy=manifest.assets.find(item=>item.id==='branding/ivy-corner');
  assert.ok(ivy,'Wooden logo ivy sprite must be registered');
  assert.ok(existsSync(resolve(root,ivy.file)),'Ivy SVG must exist in extension assets');
  assert.ok(ui.includes("make('span','brand-vine',brand)"));
  assert.ok(ui.includes("make('div','brand-badge',brand)"));
  assert.ok(ui.includes("brandBadge.append(icon('brand'))"));
  assert.ok(css.includes('background-image:var(--brand-vine-image)'));
  assert.ok(css.includes('background-image:linear-gradient(180deg,#b2734380,#4a230e90),var(--wood-image)'));
  assert.ok(css.includes('grid-template-columns:20px minmax(0,1fr)'));
  assert.ok(css.includes('.nav-item.selected .pixel-icon'));
  assert.ok(!css.includes('background-image:var(--active-image)'),'cropped selector skin must not be used');
  const start=ui.indexOf('const pixelGlyphs=');
  const end=ui.indexOf('function icon(',start);
  assert.ok(start!==-1&&end>start);
  const rows=[...ui.slice(start,end).matchAll(/'([.#]+)'/g)].map(m=>m[1]);
  assert.ok(rows.length>=100,'Expected pixel-grid sprites for icons and controls');
  assert.ok(rows.every(r=>r.length===16),'Pixel glyph rows must be exactly 16 pixels wide');
  assert.ok(ui.includes("pixel.setAttribute('width',String(end-x))"));
  assert.ok(css.includes('shape-rendering:crispEdges'));
});

test('Spotify playlist images are forwarded and rendered with safe album-art fallbacks',()=>{
  const extension=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
  const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
  const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
  const html=readFileSync(resolve(root,'vscode/panel.html'),'utf8');
  assert.ok(extension.includes("imageUrl:item.images?.[0]?.url||''"));
  assert.ok(extension.includes("imageUrl:t.imageUrl||''"));
  assert.ok(extension.includes("playlistImageUrl:playlist?.imageUrl||''"));
  assert.ok(ui.includes("coverImage(item.imageUrl,'playlist-row-cover'"));
  assert.ok(ui.includes("coverImage(state.playlistImageUrl,'playlist-hero-cover'"));
  assert.ok(ui.includes("img.src=spotifyImage(url)||assets['player/default-cover']"));
  assert.ok(css.includes('.playlist-hero-cover'));
  assert.ok(css.includes('.playlist-row-cover'));
  assert.ok(html.includes('https://*.spotifycdn.com'));
});
