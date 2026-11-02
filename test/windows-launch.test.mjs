import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {runExecutable,runVsCode,windowsCommandLine,resolveVsCodeCommand,runNpm} from '../cli/vscode-command.mjs';

test('cmd /s /c command is enclosed once and preserves individual argument quotes',()=>{
  assert.equal(
    windowsCommandLine('code',['--list-extensions','--show-versions']),
    '""code" "--list-extensions" "--show-versions""'
  );
  assert.equal(
    windowsCommandLine('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
      ['--install-extension','C:\\Dev\\my project\\geekify-0.4.3.vsix']),
    '""C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd" "--install-extension" "C:\\Dev\\my project\\geekify-0.4.3.vsix""'
  );
  assert.throws(()=>windowsCommandLine('code',['foo" & echo danger']),/Unsafe/);
  assert.throws(()=>windowsCommandLine('code',['%COMSPEC%']),/Unsafe/);
});

test('Windows: spawn real .cmd shim with spaces and pass VSIX path as one argument',
  {skip:process.platform!=='win32'},()=>{
    const dir=mkdtempSync(join(tmpdir(),'geekify windows CLI spaces '));
    const root=join(dir,'VS Code');
    const bin=join(root,'bin');
    mkdirSync(bin,{recursive:true});
    const shim=join(bin,'code.cmd');
    // The CLI must work even if VS Code's internal exe/cli.js layout changes.
    writeFileSync(shim,'@echo off\r\nif /I "%~1"=="--version" (\r\n  echo 1.122.0\r\n  exit /b 0\r\n)\r\necho ARG1=%~1\r\necho ARG2=%~2\r\n');
    const badShadow=join(dir,'code.cmd');
    writeFileSync(badShadow,'@echo off\r\nexit /b 9009\r\n');
    assert.equal(resolveVsCodeCommand({
      env:{LOCALAPPDATA:join(dir,'none')},
      whereOutput:[badShadow,shim].join('\r\n')
    }),shim,'ignore shadowed/broken code.cmd and use actual VS Code install');
    assert.equal(resolveVsCodeCommand({env:{GEEKIFY_VSCODE_COMMAND:shim}}),shim);
    assert.equal(resolveVsCodeCommand({
      env:{LOCALAPPDATA:join(dir,'none')},
      // The stock Windows install contains both an extensionless code shell
      // wrapper and code.cmd, and where.exe prints the extensionless one first.
      whereOutput:[join(bin,'code'),shim].join('\r\n')
    }),shim);
    assert.throws(()=>resolveVsCodeCommand({
      env:{GEEKIFY_VSCODE_COMMAND:badShadow}
    }),/did not pass --version/);
    const local=join(dir,'local app');
    const standardRoot=join(local,'Programs','Microsoft VS Code');
    const standardBin=join(standardRoot,'bin');
    mkdirSync(standardBin,{recursive:true});
    const standardShim=join(standardBin,'code.cmd');
    writeFileSync(standardShim,'@echo off\r\nif /I "%~1"=="--version" (\r\n echo 1.122.0\r\n exit /b 0\r\n)\r\nexit /b 2\r\n');
    assert.equal(resolveVsCodeCommand({
      env:{LOCALAPPDATA:local},
      whereOutput:badShadow
    }),standardShim,'standard VS Code install takes priority over broken PATH');
    try{
      const version=runExecutable(shim,['--list-extensions','--show-versions']);
      assert.equal(version.status,0,JSON.stringify(version));
      assert.match(version.stdout,/ARG1=--list-extensions/);
      assert.match(version.stdout,/ARG2=--show-versions/);
      const vsix=join(dir,'geekify test extension.vsix');
      const install=runExecutable(shim,['--install-extension',vsix,'--force']);
      assert.equal(install.status,0,JSON.stringify(install));
      assert.match(install.stdout,/ARG1=--install-extension/);
      assert.ok(install.stdout.includes('ARG2='+vsix));
      const previous=process.env.GEEKIFY_VSCODE_COMMAND;
      process.env.GEEKIFY_VSCODE_COMMAND=shim;
      try{
        const open=runVsCode(['--open-url','vscode://notagai.geekify/open?request=0123']);
        assert.equal(open.status,0,JSON.stringify(open));
        assert.match(open.stdout,/ARG1=--open-url/);
        assert.match(open.stdout,/ARG2=vscode:\/\/notagai\.geekify\/open\?request=0123/);
      }finally{
        if(previous===undefined)delete process.env.GEEKIFY_VSCODE_COMMAND;
        else process.env.GEEKIFY_VSCODE_COMMAND=previous;
      }
    }finally{
      rmSync(dir,{recursive:true,force:true});
    }
  });

test('Windows: npm commands work without resolving an npm.cmd in the working directory',
  {skip:process.platform!=='win32'||!existsSync(join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'))},()=>{
    const result=runNpm(['--version']);
    assert.equal(result.status,0,result.stderr||String(result.error||''));
    assert.match(result.stdout,/^\d+\.\d+\.\d+/);
  });
