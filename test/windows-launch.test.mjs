import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runExecutable,runVsCode,windowsCommandLine,resolveVsCodeCommand} from '../cli/vscode-command.mjs';

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
    const resource=join(root,'resources','app','out');
    mkdirSync(bin,{recursive:true});mkdirSync(resource,{recursive:true});
    writeFileSync(join(root,'Code.exe'),'fixture');
    writeFileSync(join(resource,'cli.js'),'fixture');
    const shim=join(bin,'code.cmd');
    writeFileSync(shim,'@echo off\r\necho ARG1=%~1\r\necho ARG2=%~2\r\n');
    const badShadow=join(dir,'code.cmd');
    writeFileSync(badShadow,'@echo off\r\nexit /b 9009\r\n');
    assert.equal(resolveVsCodeCommand({
      env:{LOCALAPPDATA:join(dir,'none')},
      whereOutput:[badShadow,shim].join('\r\n')
    }),shim,'ignore shadowed/broken code.cmd and use actual VS Code install');
    assert.equal(resolveVsCodeCommand({env:{GEEKIFY_VSCODE_COMMAND:shim}}),shim);
    assert.throws(()=>resolveVsCodeCommand({
      env:{GEEKIFY_VSCODE_COMMAND:badShadow}
    }),/valid VS Code/);
    const local=join(dir,'local app');
    const standardRoot=join(local,'Programs','Microsoft VS Code');
    const standardBin=join(standardRoot,'bin');
    mkdirSync(join(standardRoot,'resources','app','out'),{recursive:true});
    mkdirSync(standardBin,{recursive:true});
    const standardShim=join(standardBin,'code.cmd');
    writeFileSync(join(standardRoot,'Code.exe'),'fixture');
    writeFileSync(join(standardRoot,'resources','app','out','cli.js'),'fixture');
    writeFileSync(standardShim,'@echo off\r\n');
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
