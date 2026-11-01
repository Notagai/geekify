import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSpotifyFailure } from './spotify.mjs';

test('403 errors retain the reason and action-specific diagnosis',()=>{
  const premium=describeSpotifyFailure(403,'PREMIUM_REQUIRED','Player command failed: Premium required','PUT','/me/player/play');
  assert.match(premium,/PREMIUM_REQUIRED/);
  assert.match(premium,/Premium/);
  const restricted=describeSpotifyFailure(403,'RESTRICTION_VIOLATED','Player command failed','PUT','/me/player/pause');
  assert.match(restricted,/Spotify Desktop/);
  assert.match(restricted,/\/me\/player\/pause/);
});
test('unknown 403 requests inspection rather than presuming user lacks Premium',()=>{
  const text=describeSpotifyFailure(403,'','Forbidden','PUT','/me/player/pause');
  assert.match(text,/geekify doctor/);
});
test('404 suggests an active device',()=>{
  assert.match(describeSpotifyFailure(404,'','Not found','PUT','/me/player/play'),/device/);
});
