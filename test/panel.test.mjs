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

test('Library owns the hierarchy and pixel font is permitted by CSP',()=>{
 const ext=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
 const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
 const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
 const html=readFileSync(resolve(root,'vscode/panel.html'),'utf8');
 assert.ok(!ui.includes("['playlists','Playlists']"));
 assert.ok(ext.includes("type:'folder',id:'liked'"));
 assert.ok(ext.includes("type:'folder',id:'playlists'"));
 assert.ok(ui.includes("send('libraryFolder',{id:item.id})"));
 assert.ok(ui.includes("send('libraryBack')"));
 assert.ok(css.includes('.folder-item'));
 assert.ok(css.includes('.library-breadcrumbs'));
 assert.ok(css.includes("font-family:'Pixelify Sans'"));
 assert.ok(html.includes('fonts.gstatic.com'));
 assert.ok(css.includes('max-width:150px'));
});

test('device status, search shortcuts and expandable art implemented',()=>{
 const ext=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
 const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
 const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
 assert.ok(ext.includes('deviceName,deviceRestricted,deviceId:'));
 assert.ok(ext.includes("type==='recent'"));
 assert.ok(ext.includes("type==='daily'"));
 assert.ok(ui.includes("send(lastSearch?'search':'daily'"));
 assert.ok(ui.includes("send('recent')"));
 assert.ok(ui.includes("Expand playing song cover"));
 assert.ok(css.includes('.album-art-frame.expanded{transform:scale(2)'));
});

test('management, VT323 and stable lyric size are wired',()=>{
 const ext=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
 const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
 const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
 const html=readFileSync(resolve(root,'vscode/panel.html'),'utf8');
 const api=readFileSync(resolve(root,'cli/spotify.mjs'),'utf8');
 assert.ok(ui.includes("['management','Management']"));
 assert.ok(ext.includes("writeFileSync(settingsPath,"));
 assert.ok(ui.includes("renderManagement()"));
 assert.ok(ui.includes("renderSettings()"));
 assert.ok(ext.includes("planned.push("));
 assert.ok(ext.includes("planned.shift()"));
 assert.ok(api.includes("async addToQueue("));
 assert.ok(css.includes('var(--lyric-size,26px)'));
 assert.ok(html.includes('family=VT323'));
 assert.ok(!ui.includes("'Run geekify login to authorize Spotify with streaming access.'"));
});

test('six full-width section tabs are ordered correctly without a second tab bar',()=>{
 const js=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
 const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
 const sequence=["['now','Current']","['library','Library']","['management','Management']",
   "['search','Search']","['devices','Devices']","['settings','Settings']"];
 let previous=-1;
 for(const marker of sequence){const index=js.indexOf(marker);assert.ok(index>previous,'Incorrect tab order: '+marker);previous=index;}
 assert.ok(js.includes("make('nav','section-tabs',workspace)"));
 assert.ok(!js.includes("make('div','paper-tabs',sheet)"));
 assert.ok(!js.includes("make('aside','sidebar',workspace)"));
 assert.ok(js.includes("sheet.setAttribute('role','tabpanel')"));
 assert.ok(css.includes('.workspace{display:flex!important;flex-direction:column'));
 assert.ok(css.includes('.parchment{flex:1 1 auto;'));
});

test('settings file, default lyric size, pinned playlists and scrolling renderer are wired',()=>{
 const ui=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
 const extension=readFileSync(resolve(root,'vscode/extension.cjs'),'utf8');
 const css=readFileSync(resolve(root,'vscode/panel.css'),'utf8');
 assert.ok(extension.includes("'settings.json'"));
 assert.ok(extension.includes('lyricSize:28,pinned:[]'));
 assert.ok(extension.includes("name==='togglePin'"));
 assert.ok(extension.includes("name==='lyricsSize'"));
 assert.ok(extension.includes('...localSettings.pinned.map('));
 assert.ok(ui.includes("current?.scrollIntoView?.("));
 assert.ok(ui.includes("block:'center'"));
 assert.ok(ui.includes("const row=textNode('div','item-row','')"));
 assert.ok(ui.includes("button('pin-playlist',row,"));
 assert.ok(ui.includes("button('queue-add',row,"));
 assert.ok(ui.includes("send(lastSearch?'search':'daily'"));
 assert.ok(ui.includes("player.classList.toggle('cover-expanded'"));
 assert.ok(css.includes('.player-panel.cover-expanded'));
});
