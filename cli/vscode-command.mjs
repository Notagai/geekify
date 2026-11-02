// Always resolve the actual installed VS Code launcher, not a shadowed "code"
// command in the current directory. In a standard Windows installation,
// bin/code.cmd expects ../Code.exe to exist next to its own bin directory.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';

export function windowsCommandLine(executable,args=[]){
  const quote=value=>{
    const text=String(value);
    if(!text||/["%\r\n\0]/.test(text))throw new Error('Unsafe Windows command argument.');
    return '"'+text+'"';
  };
  return '"'+[executable,...args].map(quote).join(' ')+'"';
}

function isRealVSCodeLauncher(candidate){
  if(!candidate||!isAbsolute(candidate))return false;
  const name=basename(candidate).toLowerCase();
  if(name!=='code.cmd'&&name!=='code-insiders.cmd')return false;
  const parent=resolve(dirname(candidate),'..');
  const app=name==='code-insiders.cmd'?'Code - Insiders.exe':'Code.exe';
  return existsSync(candidate)&&existsSync(join(parent,app))&&
    existsSync(join(parent,'resources','app','out','cli.js'));
}

export function resolveVsCodeCommand({env=process.env,whereOutput=null}={}){
  if(process.platform!=='win32')return env.GEEKIFY_VSCODE_COMMAND||'code';

  const override=String(env.GEEKIFY_VSCODE_COMMAND||'').trim();
  if(override){
    if(isRealVSCodeLauncher(override))return override;
    throw new Error('GEEKIFY_VSCODE_COMMAND must be the full path to a valid '+
      'VS Code bin\\code.cmd. Received: '+override);
  }

  const candidates=[];
  function add(path){if(path&&!candidates.includes(path))candidates.push(path);}
  // Prefer a known actual installation, not an accidentally shadowed PATH entry.
  const roots=[
    env.LOCALAPPDATA&&join(env.LOCALAPPDATA,'Programs','Microsoft VS Code'),
    env.ProgramFiles&&join(env.ProgramFiles,'Microsoft VS Code'),
    env['ProgramFiles(x86)']&&join(env['ProgramFiles(x86)'],'Microsoft VS Code'),
    env.ProgramW6432&&join(env.ProgramW6432,'Microsoft VS Code'),
    env.USERPROFILE&&join(env.USERPROFILE,'AppData','Local','Programs','Microsoft VS Code')
  ];
  for(const root of roots)if(root)add(join(root,'bin','code.cmd'));

  let discovered=whereOutput;
  if(discovered===null){
    const lookup=spawnSync('where.exe',['code'],{
      windowsHide:true,encoding:'utf8',timeout:3000,env
    });
    discovered=lookup.status===0?lookup.stdout||'':'';
  }
  for(const line of String(discovered||'').split(/\r?\n/)){
    const item=line.trim();
    if(item)add(item);
  }
  for(const item of candidates)if(isRealVSCodeLauncher(item))return item;
  throw new Error(
    'Could not find a working VS Code installation. The "code" command on PATH '+
    'may be a broken launcher (where.exe code: '+
    String(discovered||'none').trim().replace(/\s+/g,' ').slice(0,300)+
    '). Set GEEKIFY_VSCODE_COMMAND to the absolute path of a valid '+
    'VS Code bin\\code.cmd, or reinstall VS Code with Add to PATH enabled.'
  );
}

export function runExecutable(executable,args=[],options={}){
  const opts={windowsHide:true,encoding:'utf8',timeout:12000,...options};
  if(process.platform!=='win32')return spawnSync(executable,args,opts);
  // Directly execute .exe programs when possible; use cmd only for .cmd files.
  if(/\.exe$/i.test(executable))return spawnSync(executable,args,{...opts,shell:false});
  return spawnSync(process.env.ComSpec||'cmd.exe',
    ['/d','/v:off','/s','/c',windowsCommandLine(executable,args)],{
      ...opts,shell:false,windowsVerbatimArguments:true
    });
}

export function runVsCode(args,options={}){
  return runExecutable(resolveVsCodeCommand(),args,options);
}

export function runNpm(args,options={}){
  if(process.platform==='win32'){
    // Node's own npm entrypoint bypasses any shadowed/broken npm.cmd on PATH.
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
