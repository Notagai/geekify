import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=file=>readFileSync(resolve(root,file),'utf8');

test('all six tabs fit equal slots and collapse to icons on narrow panels',()=>{
  const css=read('vscode/panel.css');
  const ui=read('vscode/panel.js');
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/@container \(max-width: 800px\)/);
  assert.match(css,/\.section-tab \.nav-text\{display:none!important;/);
  assert.match(ui,/management:\[/);
  assert.match(ui,/\['now','Current'\]/);
});

test('unsynced lyrics remain scrollable with all text',()=>{
  const css=read('vscode/panel.css');
  const ui=read('vscode/panel.js');
  assert.match(css,/\.paper-content\.unsynced-lyrics\{overflow-y:auto/);
  assert.match(ui,/holder\.classList\.add\('plain-lyrics'\)/);
  assert.match(ui,/paper\.classList\.add\('unsynced-lyrics'\)/);
});

test('playback refresh is faster and does not impose a cooldown',()=>{
  const ext=read('vscode/extension.cjs');
  assert.match(ext,/let nextDelay=2500;/);
  assert.doesNotMatch(ext,/blockedUntil/);
  assert.match(ext,/deviceRestricted=Boolean\(state\?\.device\?\.is_restricted\)/);
  assert.match(ext,/if\(polling\)pollAgain=true/);
  assert.match(ext,/lyrics=\[\];lyricsStatus='missing';/);
});
