import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {requestPanelOpen} from '../cli/panel-bridge.mjs';

const require=createRequire(import.meta.url);
const {startPanelBridge}=require('../vscode/bridge.cjs');

test('local VS Code bridge acknowledges an opened panel and forwards demo flag',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'geekify-bridge-'));
  const filePath=join(dir,'panel-bridge.json'),called=[];
  const server=await startPanelBridge(async demo=>{called.push(demo);},{filePath});
  try{
    assert.deepEqual(await requestPanelOpen(true,{filePath}),{opened:true});
    assert.deepEqual(await requestPanelOpen(false,{filePath}),{opened:true});
    assert.deepEqual(called,[true,false]);
    assert.equal(JSON.parse(readFileSync(filePath,'utf8')).port,server.port);
  }finally{server.close();rmSync(dir,{recursive:true,force:true});}
});

test('stale and tampered extension bridge cannot report success',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'geekify-bridge-'));
  const filePath=join(dir,'panel-bridge.json');
  try{
    assert.equal((await requestPanelOpen(false,{filePath})).opened,false);
    const server=await startPanelBridge(async()=>{}, {filePath});
    try{
      const original=JSON.parse(readFileSync(filePath,'utf8'));
      writeFileSync(filePath,JSON.stringify({...original,token:'a'.repeat(64)}));
      const denied=await requestPanelOpen(false,{filePath});
      assert.equal(denied.opened,false);
    }finally{server.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
