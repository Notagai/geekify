// Local-only communication between the global Geekify CLI and the VS Code UI extension.
// A successful code --open-url process exit does not prove a webview opened.
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const bridgeFile=()=>join(homedir(),'.geekify','panel-bridge.json');

export async function requestPanelOpen(demo=false,{filePath=bridgeFile(),timeoutMs=1400}={}){
  let entry;
  try{entry=JSON.parse(readFileSync(filePath,'utf8'));}
  catch{return {opened:false,reason:'no bridge registered'};}
  if(!Number.isInteger(entry.port)||entry.port<1||entry.port>65535||
     !/^[a-f0-9]{64}$/i.test(entry.token||'')){
    return {opened:false,reason:'invalid bridge registration'};
  }
  try{
    const response=await fetch('http://127.0.0.1:'+entry.port+'/open',{
      method:'POST',
      headers:{Authorization:'Bearer '+entry.token,'Content-Type':'application/json'},
      body:JSON.stringify({demo:Boolean(demo)}),
      signal:AbortSignal.timeout(timeoutMs)
    });
    const result=await response.json().catch(()=>null);
    if(response.ok&&result?.opened===true)return {opened:true};
    return {opened:false,reason:result?.error||'VS Code rejected panel request ('+response.status+')'};
  }catch(error){
    return {opened:false,reason:error?.name==='TimeoutError'?'panel timed out':'extension bridge not responding'};
  }
}
