#!/usr/bin/env node
import {createInterface} from 'node:readline/promises';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {runVsCode} from '../cli/vscode-command.mjs';
import {requestPanelOpen} from '../cli/panel-bridge.mjs';
import {fileURLToPath} from 'node:url';
import {stdin,stdout} from 'node:process';
import {loadConfig,login,logout,redirectUri} from '../cli/auth.mjs';
import {runDoctor} from '../cli/doctor.mjs';
import {GeekifyTui} from '../cli/ui.mjs';

const help='geekify.  /  visual music player in VS Code\n\n'+
'  geekify             Open Geekify visual panel in VS Code\n'+
'  geekify demo        Open the panel in demo mode\n'+
'  geekify-fast        Fast terminal-native interface\n'+
'  geekify-fast demo   Terminal-native demo\n'+
'  geekify login       Authorize Spotify (PKCE)\n'+
'  geekify logout      Disconnect Spotify\n'+
'  geekify doctor      Diagnose Spotify permissions and devices\n'+
'  geekify web         Start the existing browser visualizer\n\n'+
'The visual extension is automatically installed/updated when needed.\n'+
'The panel uses the official Web Playback SDK when supported; VS Code may\n'+
'lack the DRM required for playback. The Spotify web player is the fallback.\n';
const args=process.argv.slice(2),cmd=args[0];
const packageRoot=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const installedVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const extensionId='notagai.geekify';

function codeResultFailure(result,label){
  if(result.error)return label+': '+result.error.message;
  return label+' exited '+String(result.status)+(result.stderr?': '+result.stderr.trim().slice(0,500):'');
}
function getExtensionVersion(){
  const result=runVsCode(['--list-extensions','--show-versions']);
  if(result.error||result.status!==0)throw new Error(
    codeResultFailure(result,'VS Code CLI')+
    '. Ensure the "code" command is on PATH. Or use Command Palette > Geekify: Open Player.');
  const match=String(result.stdout||'').split(/\r?\n/).map(line=>line.trim())
    .find(line=>line.toLowerCase().startsWith(extensionId+'@'));
  return match?match.slice(extensionId.length+1):null;
}
function installPanelExtension(){
  console.log('Installing Geekify '+installedVersion+' into VS Code (one-time setup / update)…');
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',
    ['run','extension:install'],{
      cwd:packageRoot,stdio:'inherit',windowsHide:true,
      shell:process.platform==='win32',timeout:180000
    });
  if(result.error||result.status!==0)throw new Error(
    'The VS Code extension could not be installed. From the Geekify repository run '+
    '"npm run extension:install", then reload VS Code. '+
    (result.error?.message||'Installation exited '+String(result.status)));
  const found=getExtensionVersion();
  if(found!==installedVersion)throw new Error(
    'VS Code reported Geekify '+(found||'not installed')+' after installation; expected '+
    installedVersion+'. Check Extensions > Installed and your VS Code profile.');
}
async function launchPanel(demo=false){
  // This gets confirmation from the actual extension host, not just the VS Code CLI.
  const installed=getExtensionVersion();
  if(installed!==installedVersion)installPanelExtension();
  let result=await requestPanelOpen(demo);
  if(result.opened){console.log('Geekify panel opened.');return;}
  // An old or newly installed extension may not have activated yet.
  const uri='vscode://'+extensionId+'/open'+(demo?'?demo=1':'');
  const launched=runVsCode(['--open-url',uri]);
  if(launched.error||launched.status!==0)throw new Error(
    codeResultFailure(launched,'Opening VS Code')+
    '. Try Command Palette > Geekify: Open Player.');
  for(let attempt=0;attempt<10;attempt++){
    await sleep(650);
    result=await requestPanelOpen(demo);
    if(result.opened){console.log('Geekify panel opened in VS Code.');return;}
  }
  throw new Error(
    'VS Code was asked to open Geekify, but the extension did not confirm it. '+
    'Reload the VS Code window (Ctrl+Shift+P > Developer: Reload Window), '+
    'then run geekify again. Alternatively run the Command Palette action '+
    '"Geekify: Open Player". Details: '+(result.reason||'no response')+
    '. Check Output > Log (Extension Host) if it still fails.');
}
async function main(){
  if(['--help','-h','help'].includes(cmd)){console.log(help);return;}
  if(['--version','-v'].includes(cmd)){console.log('geekify '+installedVersion);return;}
  if(cmd==='login'){
    if(!stdin.isTTY)throw new Error('geekify login requires a terminal.');
    const config=loadConfig();
    const rl=createInterface({input:stdin,output:stdout});
    let id=config.clientId||'';
    try{const answer=await rl.question(id?'Spotify Client ID [Enter for saved ID]: ':'Spotify Client ID: ');
      id=answer.trim()||id;}finally{rl.close();}
    console.log('OAuth redirect URI: '+redirectUri);
    await login(id);
    console.log('Spotify connected. Run geekify for the panel or geekify-fast for the terminal.');
    return;
  }
  if(cmd==='logout'){logout();console.log('Spotify session cleared.');return;}
  if(cmd==='doctor'){process.exitCode=await runDoctor();return;}
  if(cmd==='web'){
    const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/dev.mjs',import.meta.url))],{stdio:'inherit'});
    await new Promise((resolve,reject)=>{child.on('error',reject);
      child.on('exit',code=>{process.exitCode=code||0;resolve();});});return;
  }
  if(cmd==='--ansi'){
    await new GeekifyTui({demo:false}).run();return;
  }
  if(cmd==='demo'){await launchPanel(true);return;}
  if(cmd===undefined){await launchPanel();return;}
  throw new Error('Unknown command "'+cmd+'". Run geekify --help.');
}
main().catch(e=>{console.error('geekify: '+e.message);process.exitCode=1;});
