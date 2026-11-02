import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';

const require=createRequire(import.meta.url);
const Module=require('node:module');
const root=resolve(import.meta.dirname,'..');

test('VS Code extension activates and creates a real webview panel from its command',async()=>{
  const commands=new Map();
  let handler=null;
  const panels=[];
  const disposed=[];
  const fake={
    ViewColumn:{One:1},
    Uri:{joinPath:(base,...segments)=>({fsPath:join(base.fsPath,...segments)})},
    commands:{registerCommand:(id,fn)=>{
      commands.set(id,fn);return {dispose:()=>disposed.push(id)};
    }},
    window:{
      registerUriHandler:entry=>{
        handler=entry;return {dispose:()=>disposed.push('uri')};
      },
      createWebviewPanel:(viewType,title,column,opts)=>{
        const panel={
          viewType,title,column,opts,reveal(){},
          webview:{
            html:'',asWebviewUri:uri=>({toString:()=>'vscode-resource:'+uri.fsPath}),
            postMessage:()=>Promise.resolve(true),
            onDidReceiveMessage:()=>({dispose(){}})
          },
          onDidDispose:()=>({dispose(){}}),
          dispose:()=>{}
        };
        panels.push(panel);return panel;
      },
      showErrorMessage:msg=>{throw Error('VS Code error: '+msg);},
      showWarningMessage:msg=>{throw Error('VS Code warning: '+msg);}
    }
  };
  const originalLoad=Module._load;
  let extension;
  Module._load=function(request,...rest){
    if(request==='vscode')return fake;
    return originalLoad.call(this,request,...rest);
  };
  try{
    extension=require('../vscode/extension.cjs');
  }finally{Module._load=originalLoad;}
  const reports=[];
  let bridgeRegistered=false;
  const context={
    subscriptions:[],extensionUri:{fsPath:root}
  };
  await extension.activate(context,{
    startBridge:async open=>{
      bridgeRegistered=typeof open==='function';
      return {close:()=>disposed.push('bridge')};
    },
    status:(phase)=>reports.push(phase)
  });
  assert.deepEqual(reports,['activating','ready']);
  assert.equal(bridgeRegistered,true);
  assert.equal(typeof handler.handleUri,'function');
  assert.equal(typeof commands.get('geekify.open'),'function');
  await commands.get('geekify.open')();
  assert.equal(panels.length,1);
  assert.match(panels[0].webview.html,/id="board"/);
  assert.ok(panels[0].webview.html.includes('vscode-resource:'));
  assert.equal(panels[0].opts.enableScripts,true);
  for(const resource of context.subscriptions)resource.dispose?.();
  assert.ok(disposed.includes('bridge'));
});
