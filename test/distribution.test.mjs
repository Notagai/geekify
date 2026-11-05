import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(join(root,path),'utf8');

test('installer uses a public-only VSIX and requires VS Code',()=>{
 const setup=read('installer/Geekify.iss');
 const build=read('scripts/build-installer.ps1');
 assert.match(setup,/install-extension/);
 assert.match(setup,/FindCodeCLI/);
 assert.match(build,/Private companion data in VSIX/);
 assert.match(build,/extension\/vscode\/spotify-client\.json/);
 assert.doesNotMatch(setup,/dynamic-char-integration|reina/i);
});
test('Spotify can be linked from the VS Code panel',()=>{
 const extension=read('vscode/extension.cjs');
 const webview=read('vscode/panel.html');
 const client=read('vscode/panel.js');
 assert.match(webview,/id="spotify-connect-form"/);
 assert.match(client,/type:'connect-spotify'/);
 assert.match(extension,/message\.type==='connect-spotify'/);
 assert.match(extension,/auth\.login\(id\)/);
 const defaults=JSON.parse(read('vscode/spotify-client.json'));
 assert.equal(defaults.clientId,'');
});
test('no private companion character is committed to public runtime assets',()=>{
 const assetNames=[];
 function scan(dir){
   for(const item of readdirSync(dir,{withFileTypes:true})){
     if(item.isDirectory())scan(join(dir,item.name));
     else assetNames.push(item.name.toLowerCase());
   }
 }
 scan(join(root,'assets'));
 assert.ok(assetNames.length>0);
 assert.equal(assetNames.some(name=>/reina|dynamic-char/.test(name)),false);
 assert.match(read('.vscodeignore'),/installer\/\*\*/);
 assert.match(read('.vscodeignore'),/release\/\*\*/);
});
