// Invoke Windows .cmd launchers through cmd.exe directly, without shell:true.
// This avoids Node DEP0190 warnings and preserves quoted paths with spaces.
import {spawnSync} from 'node:child_process';

export function runExecutable(executable,args=[],options={}){
  const opts={windowsHide:true,encoding:'utf8',timeout:12000,...options};
  if(process.platform!=='win32')return spawnSync(executable,args,opts);
  const values=[executable,...args].map(value=>{
    const text=String(value);
    if(/["\r\n]/.test(text))throw new Error('Unsafe executable argument.');
    // Explicit quotes prevent spaces and & in VSIX file paths being parsed as commands.
    return '"'+text.replace(/%/g,'%%')+'"';
  });
  const command='"'+values.join(' ')+'"';
  return spawnSync(process.env.ComSpec||'cmd.exe',
    ['/d','/v:off','/s','/c',command],{...opts,shell:false});
}

export function runVsCode(args,options={}){
  return runExecutable(process.env.GEEKIFY_VSCODE_COMMAND||'code',args,options);
}
