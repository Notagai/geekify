// Resolve a working VS Code CLI rather than assuming a particular install layout.
// The Windows installer may place "code" (POSIX shell script) and "code.cmd"
// together; always execute the explicit .cmd path, never the extensionless script.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {basename,dirname,isAbsolute,join} from 'node:path';

export function windowsCommandLine(executable,args=[]){
  const quote=value=>{
    const text=String(value);
    if(!text||/["%\r\n\0]/.test(text))throw new Error('Unsafe Windows command argument.');
    return '"'+text+'"';
  };
  return '"'+[executable,...args].map(quote).join(' ')+'"';
}

export function runExecutable(executable,args=[],options={}){
  const opts={windowsHide:true,encoding:'utf8',timeout:12000,...options};
  if(process.platform!=='win32')return spawnSync(executable,args,opts);
  if(/\.exe$/i.test(executable))return spawnSync(executable,args,{...opts,shell:false});
  return spawnSync(process.env.ComSpec||'cmd.exe',
    ['/d','/v:off','/s','/c',windowsCommandLine(executable,args)],{
      ...opts,shell:false,windowsVerbatimArguments:true
    });
}

function isCandidate(path){
  return isAbsolute(path)&&
    /^(code|code-insiders)\.cmd$/i.test(basename(path))&&existsSync(path);
}

function probeVersion(path){
  const result=runExecutable(path,['--version'],{timeout:6000});
  const output=String(result.stdout||'');
  return {
    ok:!result.error&&result.status===0&&/\b\d+\.\d+\.\d+\b/.test(output),
    error:result.error?.message||String(result.stderr||result.stdout||'Exit '+result.status).trim().slice(0,200)
  };
}

export function resolveVsCodeCommand({env=process.env,whereOutput=null}={}){
  if(process.platform!=='win32')return env.GEEKIFY_VSCODE_COMMAND||'code';

  const override=String(env.GEEKIFY_VSCODE_COMMAND||'').trim();
  if(override){
    if(!isCandidate(override))throw new Error(
      'GEEKIFY_VSCODE_COMMAND must point to an existing absolute code.cmd path: '+override);
    const result=probeVersion(override);
    if(result.ok)return override;
    throw new Error('VS Code launcher at '+override+' did not pass --version: '+result.error);
  }

  let discovered=whereOutput;
  if(discovered===null){
    const lookup=spawnSync('where.exe',['code'],{
      windowsHide:true,encoding:'utf8',timeout:3000,env
    });
    discovered=lookup.status===0?lookup.stdout||'':'';
  }
  const candidates=[];
  const add=path=>{if(path&&!candidates.includes(path))candidates.push(path);};
  // Known installation directories are a preference, not a proof that the
  // corresponding Code.exe or cli.js lives at a hard-coded relative path.
  for(const root of [
    env.LOCALAPPDATA&&join(env.LOCALAPPDATA,'Programs','Microsoft VS Code'),
    env.ProgramFiles&&join(env.ProgramFiles,'Microsoft VS Code'),
    env['ProgramFiles(x86)']&&join(env['ProgramFiles(x86)'],'Microsoft VS Code'),
    env.ProgramW6432&&join(env.ProgramW6432,'Microsoft VS Code'),
    env.USERPROFILE&&join(env.USERPROFILE,'AppData','Local','Programs','Microsoft VS Code')
  ])if(root)add(join(root,'bin','code.cmd'));
  for(const line of String(discovered||'').split(/\r?\n/)){
    const path=line.trim();
    if(!path)continue;
    // If "where code" returns the extensionless POSIX wrapper first, prefer
    // code.cmd beside it instead of invoking the POSIX wrapper via cmd.exe.
    add(/\\code$/i.test(path)?path+'.cmd':path);
  }

  const failures=[];
  for(const candidate of candidates){
    if(!isCandidate(candidate))continue;
    const result=probeVersion(candidate);
    if(result.ok)return candidate;
    failures.push(candidate+': '+result.error);
  }
  throw new Error(
    'No working VS Code code.cmd launcher found. '+
    (failures.length?'--version failed: '+failures.slice(0,2).join(' | '):
      'Checked installation directories and where.exe code, but found no code.cmd.')+
    ' PATH results: '+String(discovered||'none').trim().replace(/\s+/g,' ').slice(0,300)+
    '. In PowerShell, try & "C:\\Users\\'+(env.USERNAME||'YOU')+
    '\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd" --version.'
  );
}

export function runVsCode(args,options={}){
  return runExecutable(resolveVsCodeCommand(),args,options);
}

export function runNpm(args,options={}){
  if(process.platform==='win32'){
    const npmCli=join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
    if(existsSync(npmCli)){
      return spawnSync(process.execPath,[npmCli,...args],{
        windowsHide:true,encoding:'utf8',timeout:180000,
        ...options,shell:false
      });
    }
  }
  return runExecutable(process.platform==='win32'?'npm.cmd':'npm',args,options);
}
