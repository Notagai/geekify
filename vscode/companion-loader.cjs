'use strict';
// Generic user-installed panel companion manifest loader.
// No code or assets from any particular companion live in this repository.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');

const home=path.join(os.homedir(),'.geekify');
const registryPath=path.join(home,'companions.json');
const selectionPath=path.join(home,'selected-companion.json');
const ID=/^[a-z][a-z0-9-]{1,39}$/;
function readJson(file,otherwise){
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return otherwise}
}
function readRegistry(){const r=readJson(registryPath,{});return r&&typeof r==='object'&&!Array.isArray(r)?r:{};}
function readSelection(){const r=readJson(selectionPath,{});return ID.test(r?.id||'')?r.id:null;}
function resolveEntry(root,relative){
  if(typeof relative!=='string'||relative.length>260||path.isAbsolute(relative))throw Error('Invalid companion file');
  const dest=path.resolve(root,relative);
  // Registered packages may reference sibling asset folders inside their private package root.
  const allowed=path.dirname(root)+path.sep;
  if(!dest.startsWith(allowed)||!fs.statSync(dest).isFile())throw Error('Companion file missing or outside package');
  return dest;
}
function resolveSelectedCompanion(){
  const id=readSelection();if(!id)return null;
  const record=readRegistry()[id];
  if(typeof record!=='string')throw Error('Companion not registered: '+id);
  const manifestPath=path.resolve(record);
  const m=readJson(manifestPath,null);
  if(!m||m.protocol!=='panel-companion/v1'||m.id!==id)throw Error('Incompatible companion manifest');
  const root=path.dirname(manifestPath);
  const assets={};
  for(const [name,source] of Object.entries(m.assets||{})){
    if(!/^[a-z][a-z0-9_-]{0,30}$/.test(name))throw Error('Invalid asset identifier');
    assets[name]=resolveEntry(root,source);
  }
  return {id,root,manifestPath,entry:resolveEntry(root,m.entry),client:resolveEntry(root,m.client),
    style:resolveEntry(root,m.style),assets};
}
function installLink(file){
  const manifestPath=path.resolve(file);
  const m=readJson(manifestPath,null);
  if(!m||m.protocol!=='panel-companion/v1'||!ID.test(m.id||''))throw Error('Invalid companion manifest');
  const root=path.dirname(manifestPath);
  resolveEntry(root,m.client);resolveEntry(root,m.entry);resolveEntry(root,m.style);
  Object.values(m.assets||{}).forEach(name=>resolveEntry(root,name));
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  const registry=readRegistry();registry[m.id]=manifestPath;
  fs.writeFileSync(registryPath,JSON.stringify(registry,null,2),{mode:0o600});
  return m.id;
}
function selectCompanion(id=null){
  if(id!==null&&(!ID.test(id)||!Object.hasOwn(readRegistry(),id)))throw Error('Companion not installed: '+id);
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  fs.writeFileSync(selectionPath,JSON.stringify({id}),{mode:0o600});
}
module.exports={readRegistry,readSelection,resolveSelectedCompanion,installLink,selectCompanion,pathToFileURL};
