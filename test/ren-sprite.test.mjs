import test from 'node:test';
import assert from 'node:assert/strict';
import { renRows } from '../cli/ren-sprite.mjs';

test('Ren renders six terminal rows and changes between bob frames',()=>{
  const idle=renRows(0),bob=renRows(1);
  assert.equal(idle.length,6);
  assert.equal(bob.length,6);
  assert.notDeepEqual(idle,bob);
  for(const row of [...idle,...bob]){
    const visible=row.replace(/\x1b\[[0-9;]*m/g,'');
    assert.equal(Array.from(visible).length,12);
  }
});
