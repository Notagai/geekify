// Run VS Code's Windows .cmd shims through cmd.exe without Node shell:true.
// The outer /s /c quote pair is required for executable/VSIX paths with spaces.
import {spawnSync} from 'node:child_process';

export function windowsCommandLine(executable,args=[]){
  const quote=value=>{
    const text=String(value);
    // Percent expansion can occur even inside cmd.exe quotes. Refuse unsafe
    // arguments instead of silently running an altered command.
    if(!text||/["%\r\n\0]/.test(text))throw new Error('Unsafe Windows command argument.');
    return '"'+text+'"';
  };
  return '"'+[executable,...args].map(quote).join(' ')+'"';
}

export function runExecutable(executable,args=[],options={}){
  const opts={windowsHide:true,encoding:'utf8',timeout:12000,...options};
  if(process.platform!=='win32')return spawnSync(executable,args,opts);
  return spawnSync(process.env.ComSpec||'cmd.exe',
    ['/d','/v:off','/s','/c',windowsCommandLine(executable,args)],{
      ...opts,
      shell:false,
      // Critical: prevent Node from escaping/re-quoting the entire /c payload.
      // Without this cmd.exe treats the whole quoted command as an executable.
      windowsVerbatimArguments:true
    });
}

export function runVsCode(args,options={}){
  return runExecutable(process.env.GEEKIFY_VSCODE_COMMAND||'code',args,options);
}
