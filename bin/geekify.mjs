#!/usr/bin/env node
import {createInterface} from 'node:readline/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {runVsCode,runExecutable} from '../cli/vscode-command.mjs';
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
'  geekify panel-doctor Diagnose the VS Code extension and launcher\n'+
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
  const result=runExecutable('npm',['run','extension:install'],{
    cwd:packageRoot,stdio:'inherit',timeout:180000
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
const geekifyDir=join(homedir(),'.geekify');
function readExtensionStatus(){
  try{
    const info=JSON.parse(readFileSync(join(geekifyDir,'extension-status.json'),'utf8'));
    if(!info||typeof info.phase!=='string')return null;
    return info;
  }catch{return null;}
}
function launchDiagnostic(result){
  const status=readExtensionStatus();
  const recent=status&&Date.now()-status.updatedAt<120000&&status.updatedAt<=Date.now();
  if(!recent)return 'No recent extension activation recorded. The extension may be disabled, installed in another VS Code profile, or waiting for a window reload.';
  if(status.version!==installedVersion)return 'The active extension is '+status.version+
    ', but the CLI expects '+installedVersion+'. Reload the VS Code window.';
  return 'Extension status: '+status.phase+(status.detail?' ('+status.detail+')':'')+
    '. Bridge: '+(result.reason||'no response');
}
async function panelDoctor(){
  console.log('Geekify CLI:',installedVersion);
  console.log('VS Code extension:',getExtensionVersion()||'not installed in the CLI default profile');
  const status=readExtensionStatus();
  console.log('Extension activation:',status?JSON.stringify(status):'No activation status file found');
  try{
    const entry=JSON.parse(readFileSync(join(geekifyDir,'panel-bridge.json'),'utf8'));
    console.log('Bridge registration:',Number.isInteger(entry.port)?'port '+entry.port:'invalid');
  }catch{console.log('Bridge registration: none');}
  console.log('If the extension is installed but inactive: Ctrl+Shift+P > Developer: Reload Window.');
  console.log('Then check Ctrl+Shift+P > Geekify: Open Player.');
}
async function launchPanel(demo=false){
  const installed=getExtensionVersion();
  if(installed!==installedVersion)installPanelExtension();
  let result=await requestPanelOpen(demo);
  if(result.opened){console.log('Geekify panel opened.');return;}
  // The URI handler provides a one-shot acknowledgement independent of the
  // background bridge. Opening a vscode:// URL can otherwise fail silently.
  const requestId=randomBytes(16).toString('hex');
  const ackFile=join(geekifyDir,'panel-open-'+requestId+'.json');
  const uri='vscode://'+extensionId+'/open?request='+requestId+(demo?'&demo=1':'');
  const launched=runVsCode(['--open-url',uri]);
  if(launched.error||launched.status!==0)throw new Error(
    codeResultFailure(launched,'Opening VS Code')+
    '. Try Command Palette > Geekify: Open Player.');
  try{
    for(let attempt=0;attempt<20;attempt++){
      await sleep(600);
      try{
        const ack=JSON.parse(readFileSync(ackFile,'utf8'));
        if(ack.requestId===requestId&&ack.opened===true){
          console.log('Geekify panel opened in VS Code.');return;
        }
      }catch{}
      result=await requestPanelOpen(demo);
      if(result.opened){console.log('Geekify panel opened in VS Code.');return;}
    }
  }finally{try{rmSync(ackFile,{force:true});}catch{}}
  throw new Error(
    'VS Code did not open Geekify. '+launchDiagnostic(result)+
    ' Open Extensions in the CURRENT VS Code window and check that Geekify is enabled. '+
    'If installed or updated during this session: Ctrl+Shift+P > Developer: Reload Window. '+
    'If VS Code asks permission to open the geekify URI, allow it. '+
    'For details run geekify panel-doctor, then check Output > Log (Extension Host).');
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
  if(cmd==='panel-doctor'){await panelDoctor();return;}
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
