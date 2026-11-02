#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { GeekifyTui } from '../cli/ui.mjs';
import { RenGraphicsApp } from '../cli/ren-graphics.mjs';
import { preferredGraphicsProtocol } from '../cli/terminal-graphics.mjs';
import { runDoctor } from '../cli/doctor.mjs';
import { loadConfig, login, logout, redirectUri } from '../cli/auth.mjs';

const help=`geekify.  /  your music, in the terminal

Usage:
  geekify               Launch the interactive Spotify-style interface
  geekify demo          Launch a no-account demo
  geekify --ren         Launch Ren's graphical app inside VS Code terminal
  geekify demo --ren    Preview graphical Ren without Spotify credentials
  geekify --ren-ansi    Preview original ANSI sprite fallback
  geekify --ren --force-images   Skip terminal image support probe
  geekify login         Connect a Spotify account using OAuth PKCE
  geekify doctor        Check scopes and Spotify Connect devices (read-only)
  geekify logout        Clear the stored Spotify session
  geekify web           Start the browser app (same as npm run dev)
  geekify --help        Show this help
  geekify --version     Show version

Setup (once, from the cloned repo):
  npm install
  npm link

Spotify setup:
  Register http://127.0.0.1:8888/callback as a redirect URI
  in your Spotify developer dashboard.
  Run geekify login and paste your Spotify Client ID.
  Start playback in Spotify Desktop or another device.

Terminal navigation:
  1 Now Playing  2 Search  3 Library  4 Playlists  5 Devices
  / Search       j/k or arrows browse   Enter select
  Space play/pause  n next  p previous  +/- volume
  s shuffle  r repeat  f save  c connect  ? help  q quit

Spotify audio is played by Spotify, not streamed into this terminal.
`;
const args=process.argv.slice(2);
const [command]=args;
const ren=args.includes('--ren');
const ansiRen=args.includes('--ren-ansi');
const forceImages=args.includes('--force-images');
async function main(){
  if(['--help','-h','help'].includes(command)){console.log(help);return;}
  if(['--version','-v'].includes(command)){console.log('geekify 0.3.0');return;}
  if(command==='logout'){logout();console.log('Spotify session cleared.');return;}
  if(command==='doctor'){process.exitCode=await runDoctor();return;}
  if(command==='login'){
    if(!stdin.isTTY)throw new Error('geekify login needs an interactive terminal.');
    const config=loadConfig();
    const rl=createInterface({input:stdin,output:stdout});
    let id=config.clientId||'';
    try{
      const entry=await rl.question(id?'Spotify Client ID [Enter for saved ID]: ':'Spotify Client ID: ');
      id=entry.trim()||id;
    }finally{rl.close();}
    console.log('OAuth callback: '+redirectUri);
    await login(id);
    console.log('Spotify connected! Launch geekify to open the terminal UI.');
    return;
  }
  if(command==='web'){
    const script=fileURLToPath(new URL('../scripts/dev.mjs',import.meta.url));
    const child=spawn(process.execPath,[script],{stdio:'inherit'});
    await new Promise((resolve,reject)=>{
      child.on('error',reject);
      child.on('exit',code=>{if(code && code!==0)process.exitCode=code;resolve();});
    });
    return;
  }
  if(command==='demo'||command===undefined||command==='--ren'||command==='--ren-ansi'){
    const demo=command==='demo';
    if(ren){
      if(!forceImages&&preferredGraphicsProtocol()==='ansi'){
        console.error('geekify: this terminal has no detected image protocol; using Ren ANSI fallback.');
        console.error('For graphical Ren inside VS Code, enable terminal.integrated.enableImages.');
        const app=new GeekifyTui({demo,mascot:'ren'});
        await app.run();
      }else{
        const app=new RenGraphicsApp({demo,forceImages});
        await app.run();
      }
    }else{
      const app=new GeekifyTui({demo,mascot:ansiRen?'ren':null});
      await app.run();
    }
    return;
  }
  throw new Error('Unknown command "'+command+'". Use geekify --help.');
}
main().catch(error=>{console.error('geekify: '+error.message);process.exitCode=1;});
