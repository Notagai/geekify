import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runExecutable,runVsCode,windowsCommandLine} from '../cli/vscode-command.mjs';

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
    const shim=join(dir,'visual player.cmd');
    writeFileSync(shim,'@echo off\r\necho ARG1=%~1\r\necho ARG2=%~2\r\n');
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
