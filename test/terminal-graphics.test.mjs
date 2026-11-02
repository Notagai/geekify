import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  preferredGraphicsProtocol,encodeKittyImage,kittyDeleteImage,probeKittyGraphics
} from '../cli/terminal-graphics.mjs';

test('VS Code terminals choose Kitty graphics without an external terminal',()=>{
  assert.equal(preferredGraphicsProtocol({TERM_PROGRAM:'vscode'}),'kitty');
  assert.equal(preferredGraphicsProtocol({VSCODE_PID:'4512'}),'kitty');
  assert.equal(preferredGraphicsProtocol({TERM_PROGRAM:'xterm',GEEKIFY_GRAPHICS:'kitty'}),'kitty');
  assert.equal(preferredGraphicsProtocol({TERM_PROGRAM:'Apple_Terminal'}),'ansi');
  assert.equal(preferredGraphicsProtocol({TERM_PROGRAM:'iTerm.app'}),'iterm');
});

test('Kitty PNG frames use direct mode, fixed cell placement and 4096-char base64 chunks',()=>{
  const png=Buffer.alloc(10500,0x69);
  const out=encodeKittyImage(png,{columns:150,rows:35,imageId:93911});
  const chunks=[...out.matchAll(/\x1b_G([^;]+);([A-Za-z0-9+/=]*)\x1b\\/g)];
  assert.equal(chunks.length,Math.ceil(png.toString('base64').length/4096));
  assert.match(chunks[0][1],/a=T,f=100,t=d,i=93911,p=1,c=150,r=35,C=1,q=2,m=1/);
  assert.ok(chunks.every((chunk)=>chunk[2].length<=4096));
  assert.equal(chunks.at(-1)[1],'m=0');
  assert.equal(chunks.map(c=>c[2]).join(''),png.toString('base64'));
  assert.equal(kittyDeleteImage(93911),'\x1b_Ga=d,d=I,i=93911,q=2;\x1b\\');
});

function fakeTerminal(reply){
  const input=new EventEmitter();
  input.isTTY=true;input.isRaw=false;
  input.setRawMode=value=>{input.isRaw=value;};
  input.resume=()=>{};
  const output={isTTY:true,write:payload=>{
    assert.match(payload,/a=q,t=d,f=24;AAAA/);
    setImmediate(()=>input.emit('data',Buffer.from(reply)));
    return true;
  }};
  return {input,output};
}
test('Kitty probe recognizes a supported VS Code terminal and restores raw input',async()=>{
  const {input,output}=fakeTerminal('\x1b_Gi=739031;OK\x1b\\');
  assert.equal(await probeKittyGraphics({input,output,timeoutMs:250}),true);
  assert.equal(input.isRaw,false);
  assert.equal(input.listenerCount('data'),0);
});
test('Kitty probe fails safely when image rendering is unavailable',async()=>{
  const {input,output}=fakeTerminal('\x1b[?1;2c');
  assert.equal(await probeKittyGraphics({input,output,timeoutMs:250}),false);
  assert.equal(input.isRaw,false);
  assert.equal(input.listenerCount('data'),0);
});
