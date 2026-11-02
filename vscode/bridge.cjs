'use strict';
// Only this VS Code extension host serves the loopback endpoint. No remote access.
const {createServer}=require('node:http');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {readFileSync,writeFileSync,mkdirSync,unlinkSync,chmodSync}=require('node:fs');
const {dirname,join}=require('node:path');
const {homedir}=require('node:os');

const defaultBridgeFile=()=>join(homedir(),'.geekify','panel-bridge.json');
function validToken(candidate,secret){
  if(typeof candidate!=='string'||candidate.length!==secret.length)return false;
  return timingSafeEqual(Buffer.from(candidate),Buffer.from(secret));
}
function clearOwnedRegistration(filePath,token){
  try{
    const entry=JSON.parse(readFileSync(filePath,'utf8'));
    if(entry?.token===token)unlinkSync(filePath);
  }catch{}
}
async function startPanelBridge(open,{filePath=defaultBridgeFile()}={}){
  if(typeof open!=='function')throw new TypeError('Panel open callback required.');
  const token=randomBytes(32).toString('hex');
  const server=createServer(async(req,res)=>{
    const respond=(code,payload)=>{
      res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(payload));
    };
    if(req.method!=='POST'||req.url!=='/open'){respond(404,{error:'Not found'});return;}
    if(req.headers.origin){respond(403,{error:'Origin not allowed'});return;}
    const host='127.0.0.1:'+server.address()?.port;
    if(req.headers.host!==host){respond(403,{error:'Invalid host'});return;}
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')||!validToken(auth.slice(7),token)){
      respond(403,{error:'Unauthorized'});return;
    }
    let bytes=0,parts=[];
    for await(const chunk of req){
      bytes+=chunk.length;
      if(bytes>1024){respond(413,{error:'Request too large'});return;}
      parts.push(chunk);
    }
    let message;
    try{message=JSON.parse(Buffer.concat(parts).toString('utf8'));}
    catch{respond(400,{error:'Invalid request'});return;}
    if(typeof message.demo!=='boolean'){respond(400,{error:'Invalid demo flag'});return;}
    try{
      await open(message.demo);
      respond(200,{opened:true});
    }catch(error){
      respond(500,{error:String(error?.message||error).slice(0,180)});
    }
  });
  server.on('clientError',(_error,socket)=>socket.destroy());
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>{
        server.off('error',reject);resolve();
      });
    });
    mkdirSync(dirname(filePath),{recursive:true,mode:0o700});
    writeFileSync(filePath,JSON.stringify({
      port:server.address().port,token,pid:process.pid
    }),{encoding:'utf8',mode:0o600});
    try{chmodSync(filePath,0o600);}catch{}
  }catch(error){
    server.close();throw error;
  }
  return {
    port:server.address().port,
    close(){
      clearOwnedRegistration(filePath,token);
      server.close();
    }
  };
}
module.exports={startPanelBridge};
