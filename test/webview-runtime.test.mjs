import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

test('responsive player bootstraps and renders state with a mocked VS Code DOM',()=>{
  class Element{
    constructor(tag='div'){
      this.tag=tag;this.className='';this.children=[];this.attrs={};this.handlers={};
      this.style={setProperty(name,value){this[name]=value;}};
      this.classList={toggle(){},add(){},remove(){}};
      this.textContent='';this.src='';this.value='';this.hidden=false;this.dataset={};this.scrollTop=0;
    }
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];}
    insertBefore(node,reference){const index=this.children.indexOf(reference);if(index<0)this.children.push(node);else this.children.splice(index,0,node);}
    querySelectorAll(selector){const result=[];const cls=selector.startsWith('.')?selector.slice(1):null;const visit=node=>{for(const child of node.children){if(cls&&child.className?.split(' ').includes(cls))result.push(child);visit(child);}};visit(this);return result;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    setAttribute(name,value){this.attrs[name]=value;}
    getAttribute(name){return this.attrs[name]||null;}
    addEventListener(type,fn){this.handlers[type]=fn;}
    getBoundingClientRect(){return {left:0,right:200,top:20,bottom:54,width:200};}
    remove(){this.removed=true;}
    contains(node){return node===this||this.children.some(child=>child.contains?.(node));}
    blur(){}
  }
  const body=new Element('body');
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
    document:{body,
      getElementById:id=>ids.get(id)||new Element(),
      createElement:tag=>new Element(tag),
      createElementNS:(_ns,tag)=>new Element(tag),
      addEventListener:()=>{},hidden:false
    },
    window:{innerWidth:1024,innerHeight:768,addEventListener:(event,fn)=>listeners[event]=fn},
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
  // Regression: Spotify returned playlists, but a local variable named
  // "button" shadowed the button() helper and crashed on the first Pin action.
  const library=walk(uiRoot,node=>node.attrs?.['aria-label']==='Library');
  library.handlers.click();
  const playlists=Array.from({length:68},(_,i)=>({
    type:'playlist',id:'playlist'+i,title:'My Playlist '+i,
    subtitle:'12 tracks',imageUrl:''
  }));
  assert.doesNotThrow(()=>listeners.message({data:{
    type:'state',demo:false,track:null,playing:false,progressMs:0,
    lyricsStatus:'missing',lyrics:[],items:playlists,
    browseType:'library-playlists',browseLoading:false,browseError:'',
    pinned:[],queue:[],canStream:false
  }}));
  const collect=(node,predicate)=>[
    ...(predicate(node)?[node]:[]),
    ...(node.children||[]).flatMap(child=>collect(child,predicate))
  ];
  assert.equal(collect(uiRoot,node=>node.className==='item-row').length,68);
  assert.equal(collect(uiRoot,node=>node.className==='playlist-more').length,68);
  const menuButton=collect(uiRoot,node=>node.className==='playlist-more')[0];
  menuButton.handlers.click();
  const menuAction=collect(body,node=>node.className.includes('playlist-menu-action'))[0];
  assert.equal(menuAction.textContent,'Pin');
  menuAction.handlers.click();
  assert.ok(calls.some(call=>call.name==='togglePin'&&call.id==='playlist0'));
  // A pinned playlist must require two clicks on Unpin, not an immediate mutation.
  listeners.message({data:{
    type:'state',demo:false,track:null,playing:false,progressMs:0,
    lyricsStatus:'missing',lyrics:[],items:playlists,
    browseType:'library-playlists',browseLoading:false,browseError:'',
    pinned:[{id:'playlist0',title:'My Playlist 0'}],queue:[],canStream:false
  }});
  collect(uiRoot,node=>node.className==='playlist-more')[0].handlers.click();
  const unpin=collect(body,node=>node.className.includes('playlist-menu-action')).at(-1);
  assert.equal(unpin.textContent,'Unpin');
  const before=calls.filter(call=>call.name==='togglePin').length;
  unpin.handlers.click();
  assert.equal(unpin.textContent,'Confirm unpin');
  // Spotify polling must not close the confirmation menu.
  listeners.message({data:{
    type:'state',demo:false,track:null,playing:false,progressMs:900,
    lyricsStatus:'missing',lyrics:[],items:playlists,
    browseType:'library-playlists',browseLoading:false,browseError:'',
    pinned:[{id:'playlist0',title:'My Playlist 0'}],queue:[],canStream:false
  }});
  assert.equal(collect(body,node=>node.className.includes('playlist-menu-action')).at(-1).textContent,'Confirm unpin');
  assert.equal(calls.filter(call=>call.name==='togglePin').length,before);
  collect(body,node=>node.className.includes('playlist-menu-action')).at(-1).handlers.click();
  assert.equal(calls.filter(call=>call.name==='togglePin').length,before+1);
  const firstRow=collect(uiRoot,node=>node.className==='item-row')[0];
  assert.ok(firstRow.children[0].handlers.click,'playlist must be clickable');
  const paper=walk(uiRoot,node=>node.className==='paper-content');
  const list=paper.querySelector('.list');
  const searchInput=paper.querySelector('.playlist-search');
  assert.ok(searchInput,'playlist search field exists');
  paper.scrollTop=320;list.scrollTop=180;
  searchInput.value='My Playlist 42';
  searchInput.handlers.input();
  assert.equal(list.querySelectorAll('.item-row').filter(row=>!row.hidden).length,1);
  assert.equal(list.querySelectorAll('.item-row').filter(row=>!row.hidden)[0].dataset.searchText.includes('42'),true);
  assert.doesNotThrow(()=>listeners.message({data:{
    type:'state',demo:false,track:null,playing:false,progressMs:1500,
    lyricsStatus:'missing',lyrics:[],items:playlists,
    browseType:'library-playlists',browseLoading:false,browseError:'',
    pinned:[],queue:[],canStream:false
  }}));
  assert.equal(paper.scrollTop,320,'paper scroll should survive a playback update');
  assert.equal(paper.querySelector('.list').scrollTop,180,'playlist scroll should survive a playback update');
  assert.equal(paper.querySelector('.playlist-search').value,'My Playlist 42','search persists through playback updates');
  assert.equal(paper.querySelector('.list').querySelectorAll('.item-row').filter(row=>!row.hidden).length,1);

});
