import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const DIR=join(homedir(),'.geekify');
const PATH=join(DIR,'config.json');
const CALLBACK='http://127.0.0.1:8888/callback';
const SCOPE='user-read-playback-state user-modify-playback-state user-library-read user-library-modify playlist-read-private playlist-read-collaborative';
export const redirectUri=CALLBACK;
export function loadConfig(){
  try{return JSON.parse(readFileSync(PATH,'utf8'))||{};}catch{return {};}
}
export function saveConfig(config){
  mkdirSync(DIR,{recursive:true,mode:0o700});
  writeFileSync(PATH,JSON.stringify(config,null,2),{encoding:'utf8',mode:0o600});
  try {chmodSync(PATH,0o600);}catch{}
}
export function logout(){
  const cfg=loadConfig();
  delete cfg.token;
  saveConfig(cfg);
}
function b64url(bytes){return Buffer.from(bytes).toString('base64url');}
function openBrowser(url){
  const platform=process.platform;
  let command, args;
  if(platform==='win32'){command='rundll32.exe';args=['url.dll,FileProtocolHandler',url];}
  else if(platform==='darwin'){command='open';args=[url];}
  else{command='xdg-open';args=[url];}
  try{
    const child=spawn(command,args,{detached:true,stdio:'ignore'});
    child.on('error',()=>{});
    child.unref();
  }catch{}
}
async function tokenRequest(params) {
  const response=await fetch('https://accounts.spotify.com/api/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(params)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error_description||data.error||'Spotify authorization failed ('+response.status+').');
  return data;
}
function persistToken(result,clientId){
  const config=loadConfig();
  config.clientId=clientId;
  config.token={
    access_token:result.access_token,
    refresh_token:result.refresh_token||config.token?.refresh_token,
    expires_at:Date.now()+Math.max(20,Number(result.expires_in||3600)-60)*1000
  };
  saveConfig(config);
}
export function isConnected(){const c=loadConfig();return Boolean(c.clientId&&c.token?.refresh_token);}
export async function accessToken(){
  const config=loadConfig();
  if(!config.clientId||!config.token)throw new Error('Not connected. Run "geekify login" first.');
  if(config.token.access_token&&Date.now()<config.token.expires_at)return config.token.access_token;
  if(!config.token.refresh_token)throw new Error('Session expired. Run "geekify login" again.');
  const data=await tokenRequest({grant_type:'refresh_token',refresh_token:config.token.refresh_token,client_id:config.clientId});
  persistToken(data,config.clientId);
  return data.access_token;
}
export async function login(clientId){
  if(!/^[a-f\d]{32}$/i.test(clientId||''))throw new Error('Spotify Client ID should be 32 hexadecimal characters.');
  // PKCE is required: never request or save the Spotify client secret.
  const verifier=b64url(randomBytes(48));
  const challenge=b64url(createHash('sha256').update(verifier).digest());
  const state=b64url(randomBytes(24));
  const parameters=new URLSearchParams({
    response_type:'code',client_id:clientId,redirect_uri:CALLBACK,
    scope:SCOPE,code_challenge_method:'S256',code_challenge:challenge,state
  });
  const authorizeUrl='https://accounts.spotify.com/authorize?'+parameters;
  let server,timeout,settled=false;
  const code=await new Promise((resolve,reject)=>{
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timeout);
      try{server?.close();}catch{}
      if(error)reject(error);else resolve(value);
    };
    server=createServer((request,response)=>{
      const url=new URL(request.url||'/',CALLBACK);
      if(url.pathname!=='/callback'){response.writeHead(404);response.end('Not found');return;}
      const ok=url.searchParams.get('state')===state && Boolean(url.searchParams.get('code'));
      const error=url.searchParams.get('error');
      response.writeHead(ok?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      response.end('<!doctype html><html><body style="font:18px system-ui;background:#101225;color:#fafafa;padding:50px"><h2>'+
        (ok?'Spotify connected to Geekify':'Spotify authorization failed')+
        '</h2><p>You can close this tab and return to the terminal.</p></body></html>');
      if(!ok)finish(new Error(error||'Spotify authorization rejected or state mismatch.'));
      else finish(null,url.searchParams.get('code'));
    });
    server.on('error',error=>finish(new Error('Cannot open callback port 8888: '+error.message)));
    server.listen(8888,'127.0.0.1',()=>{
      process.stdout.write('\nOpening Spotify authorization in your browser.\nIf it does not open, visit:\n'+authorizeUrl+'\n\n');
      openBrowser(authorizeUrl);
    });
    timeout=setTimeout(()=>finish(new Error('Spotify authorization timed out. Run geekify login again.')),120000);
  });
  const token=await tokenRequest({
    grant_type:'authorization_code',code,redirect_uri:CALLBACK,
    client_id:clientId,code_verifier:verifier
  });
  persistToken(token,clientId);
}
