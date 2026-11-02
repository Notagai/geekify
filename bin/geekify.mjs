#!/usr/bin/env node
import {createInterface} from 'node:readline/promises';
import {spawn,spawnSync} from 'node:child_process';
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
'First install the VS Code Geekify extension: npm run extension:install\n'+
'The panel uses the official Web Playback SDK when supported; VS Code may\n'+
'lack the DRM required for playback. The Spotify web player is the fallback.\n';
const args=process.argv.slice(2),cmd=args[0];
async function launchPanel(demo=false){
  const uri='vscode://notagai.geekify/open'+(demo?'?demo=1':'');
  // VS Code registers its own URI handler for installed extensions.
  // On Windows, code is usually a code.cmd shim, hence cmd.exe is required.
  const win=process.platform==='win32';
  const child=spawnSync(win?'cmd.exe':'code',
    win?['/d','/s','/c','code','--open-url',uri]:['--open-url',uri],
    {windowsHide:true,encoding:'utf8',timeout:12000});
  if(child.error||child.status!==0){
    throw new Error('Unable to open VS Code. Install the Geekify extension with '+
      'npm run extension:install, then use Command Palette > Geekify: Open Player. '+
      (child.error?.message||child.stderr||'').trim());
  }
  console.log('Requested Geekify panel in VS Code. If nothing opens, run npm run extension:install once.');
}
async function main(){
  if(['--help','-h','help'].includes(cmd)){console.log(help);return;}
  if(['--version','-v'].includes(cmd)){console.log('geekify 0.4.0');return;}
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
