import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {runVsCode} from '../cli/vscode-command.mjs';

const root=resolve(import.meta.dirname,'..');
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const vsix=resolve(root,pkg.name+'-'+pkg.version+'.vsix');
if(!existsSync(vsix)){
  console.error('Missing '+vsix+'. Run npm run extension:package first.');
  process.exitCode=1;
}else{
  const installed=runVsCode(['--install-extension',vsix,'--force'],{
    stdio:'inherit',timeout:30000
  });
  if(installed.error||installed.status!==0){
    console.error('VS Code extension installation failed. '+
      'Use Extensions > ... > Install from VSIX and select '+vsix);
    if(installed.error)console.error(installed.error.message);
    process.exitCode=1;
  }else{
    const probe=runVsCode(['--list-extensions','--show-versions']);
    const expected=(pkg.publisher+'.'+pkg.name+'@'+pkg.version).toLowerCase();
    const found=String(probe.stdout||'').split(/\r?\n/)
      .some(line=>line.trim().toLowerCase()===expected);
    if(probe.error||probe.status!==0||!found){
      console.error('VS Code did not report the installed Geekify extension ('+
        expected+'). Check which VS Code profile or edition is in use.');
      process.exitCode=1;
    }else{
      console.log('Geekify '+pkg.version+' installed. Reload VS Code and run geekify.');
    }
  }
}
