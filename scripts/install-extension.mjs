import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const vsix=resolve(root,pkg.name+'-'+pkg.version+'.vsix');
if(!existsSync(vsix)){
  console.error('Missing '+vsix+'. Run npm run extension:package first.');
  process.exitCode=1;
}else{
  const win=process.platform==='win32';
  const result=spawnSync(win?'cmd.exe':'code',
    win?['/d','/s','/c','code','--install-extension',vsix,'--force']:
      ['--install-extension',vsix,'--force'],
    {stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0){
    console.error('VS Code CLI failed. In VS Code select Extensions > ... > Install from VSIX, then choose '+vsix);
    if(result.error)console.error(result.error.message);
    process.exitCode=1;
  }else{
    console.log('Geekify extension installed. Reload VS Code, then run geekify.');
  }
}
