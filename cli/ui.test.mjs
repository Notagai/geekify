import test from 'node:test';
import assert from 'node:assert/strict';
import { GeekifyTui } from './ui.mjs';

test('compact VS Code terminal preserves the lyrics and command/status footer',()=>{
  const original={columns:process.stdout.columns,rows:process.stdout.rows};
  try{
    process.stdout.columns=80;process.stdout.rows=16;
    const ui=new GeekifyTui({demo:true});
    const lines=ui.makeRows().map(line=>line.replace(/\x1b\[[0-9;]*m/g,''));
    assert.equal(lines.length,16);
    assert.ok(lines.some(s=>s.includes('L Y R I C S')));
    assert.ok(lines.some(s=>s.includes('the city is still awake')));
    assert.ok(lines.some(s=>s.includes('Press ? for help')));
    assert.ok(lines.at(-1).startsWith('╰'));
  }finally{
    if(original.columns===undefined)delete process.stdout.columns;else process.stdout.columns=original.columns;
    if(original.rows===undefined)delete process.stdout.rows;else process.stdout.rows=original.rows;
  }
});
