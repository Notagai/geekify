import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

test('responsive player bootstraps and renders state with a mocked VS Code DOM',()=>{
  class Element{
    constructor(tag='div'){
      this.tag=tag;this.children=[];this.attrs={};this.handlers={};
      this.style={setProperty(name,value){this[name]=value;}};
      this.classList={toggle(){},add(){},remove(){}};
      this.textContent='';this.src='';this.value='';this.hidden=false;
    }
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];}
    setAttribute(name,value){this.attrs[name]=value;}
    getAttribute(name){return this.attrs[name]||null;}
    addEventListener(type,fn){this.handlers[type]=fn;}
    getBoundingClientRect(){return {left:0,width:200};}
    blur(){}
  }
  const ids=new Map();
  for(const id of ['assets','board','audioStatus','listenHere','openWeb'])
    ids.set(id,new Element());
  ids.get('assets').textContent=JSON.stringify({
    'frame/wood-tile':'wood.png',
    'paper/lyrics-panel':'paper.png',
    'paper/player-panel':'player.png',
    'sidebar/button-idle':'idle.png',
    'sidebar/button-active':'active.png',
    'decor/flowers':'flowers.png',
    'decor/polaroid':'photo.png',
    'player/default-cover':'cover.png'
  });
  const root=resolve(import.meta.dirname,'..');
  const script=readFileSync(resolve(root,'vscode/panel.js'),'utf8');
  const calls=[],listeners={};
  const context={
    document:{
      getElementById:id=>ids.get(id)||new Element(),
      createElement:tag=>new Element(tag),
      createElementNS:(_ns,tag)=>new Element(tag),
      addEventListener:()=>{},hidden:false
    },
    window:{addEventListener:(event,fn)=>listeners[event]=fn},
    performance:{now:()=>1000},
    setInterval:()=>0,
    acquireVsCodeApi:()=>({postMessage:message=>calls.push(message)})
  };
  assert.doesNotThrow(()=>vm.runInNewContext(script,context,{timeout:3000}));
  assert.equal(calls[0].type,'ready');
  const uiRoot=ids.get('board');
  assert.ok(uiRoot.children.length,'UI should be mounted in the webview');
  assert.equal(typeof listeners.message,'function');
  assert.doesNotThrow(()=>listeners.message({
    data:{
      type:'state',demo:true,track:{
        title:'Midnight Frequency',artist:'geekify sessions',durationMs:136000
      },
      playing:true,progressMs:25000,
      lyricsStatus:'synced',lyrics:[{timeMs:0,text:'Test lyrics line'}],
      items:[],queue:[],browseType:'',canStream:false
    }
  }));
  const walk=(node,fn)=>{
    if(fn(node))return node;
    for(const child of node.children||[]){
      const match=walk(child,fn);if(match)return match;
    }
    return null;
  };
  for(const label of ['Current','Library','Management','Search','Devices','Settings']){
    const item=walk(uiRoot,node=>node.attrs?.['aria-label']===label);
    assert.ok(item,'Missing '+label+' navigation control');
    assert.equal(item.tag,'button');
  }
  const search=walk(uiRoot,node=>node.attrs?.['aria-label']==='Search');
  assert.doesNotThrow(()=>search.handlers.click());
  const controls=walk(uiRoot,node=>node.attrs?.['aria-label']==='Pause');
  assert.ok(controls,'rendered pause control should be accessible');
  assert.equal(controls.tag,'button');
});
