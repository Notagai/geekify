import test from 'node:test';
import assert from 'node:assert/strict';
import { GeekifyTui } from './ui.mjs';
import { paperWidth } from './wood-theme.mjs';

const stripAnsi=text=>text.replace(/\x1b\[[\d;]*m/g,'');
function withTerminal(columns,rows,fn){
  const old={columns:process.stdout.columns,rows:process.stdout.rows};
  try{
    process.stdout.columns=columns;process.stdout.rows=rows;
    fn();
  }finally{
    if(old.columns===undefined)delete process.stdout.columns;else process.stdout.columns=old.columns;
    if(old.rows===undefined)delete process.stdout.rows;else process.stdout.rows=old.rows;
  }
}

test('compact VS Code terminal shows album art, lyrics and command footer',()=>{
  withTerminal(80,16,()=>{
    const ui=new GeekifyTui({demo:true});
    const rendered=ui.makeRows().map(stripAnsi);
    assert.equal(rendered.length,16);
    assert.ok(rendered.some(s=>s.includes('L Y R I C S')));
    assert.ok(rendered.some(s=>s.includes('the city is still awake')));
    assert.ok(rendered.some(s=>s.includes('▀')));
    assert.ok(rendered.some(s=>s.includes('[?] Help')));
    assert.ok(rendered.some(s=>s.includes('geekify.')));
    assert.ok(rendered.some(s=>s.includes('NOW')));
    for(const row of rendered)assert.equal(Array.from(row).length,80);
  });
});
test('larger terminal retains album cover, full track context, keyboard hints',()=>{
  withTerminal(120,34,()=>{
    const ui=new GeekifyTui({demo:true});
    const rendered=ui.makeRows().map(stripAnsi);
    assert.equal(rendered.length,34);
    assert.ok(rendered.some(s=>s.includes('Midnight Frequency')));
    assert.ok(rendered.some(s=>s.includes('original demo audio')));
    assert.ok(rendered.some(s=>s.includes('L Y R I C S')));
    assert.ok(rendered.some(s=>s.includes('Press')||s.includes('[?] Help')));
    for(const row of rendered)assert.equal(Array.from(row).length,120);
  });
});
test('paper panel leaves wood-grain margins around the content',()=>{
  assert.ok(paperWidth(100)<95);
  assert.ok(paperWidth(100)>60);
  assert.ok(paperWidth(48)<48);
});
