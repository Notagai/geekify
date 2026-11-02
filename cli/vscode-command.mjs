// Shared VS Code CLI invocation for the launcher and extension installer.
// On Windows the VS Code command is a .cmd shim, so execute through a shell.
import {spawnSync} from 'node:child_process';

export function runVsCode(args,options={}){
  const binary=process.env.GEEKIFY_VSCODE_COMMAND||'code';
  return spawnSync(binary,args,{
    windowsHide:true,
    encoding:'utf8',
    shell:process.platform==='win32',
    timeout:12000,
    ...options
  });
}
