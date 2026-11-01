import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lyricIndex } from './lyrics.js';
test('LRC lines are parsed with minute, second and fractional positions', () => {
  const result=parseLrc('[00:01.20] first\n[00:04.500] second\n[01:01] third');
  assert.deepEqual(result.map(x => x.timeMs), [1200,4500,61000]);
  assert.deepEqual(result.map(x => x.text), ['first','second','third']);
});
test('duplicate timestamps and metadata are handled safely', () => {
  const lines=parseLrc('[ar:sample]\n[00:02.00][00:03.00] echo\n[00:04.00] \n');
  assert.equal(lines.length,2);
  assert.equal(lines[1].timeMs,3000);
});
test('lyricIndex locates current line and handles empty list', () => {
  const lines=parseLrc('[00:01] first\n[00:03] second');
  assert.equal(lyricIndex(lines,0),-1);
  assert.equal(lyricIndex(lines,1100),0);
  assert.equal(lyricIndex(lines,5000),1);
  assert.equal(lyricIndex([],5000),-1);
});
