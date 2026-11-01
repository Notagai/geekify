import { loadConfig } from './auth.mjs';
import { SpotifyApi } from './spotify.mjs';

const safe = value => String(value ?? 'unknown').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,100);
export async function runDoctor() {
  const config=loadConfig();
  console.log('geekify doctor / read-only Spotify diagnostics\n');
  if(!config.clientId || !config.token) {
    console.log('Not connected. Run geekify login.');
    return 1;
  }
  console.log('Session: saved (access tokens are never printed)');
  const scopes=config.token.scope?.split(/\s+/).filter(Boolean);
  if(scopes?.length) {
    console.log('Granted scopes: '+scopes.join(', '));
    console.log('Playback control permission: '+(scopes.includes('user-modify-playback-state')?'GRANTED':'MISSING'));
    if(!scopes.includes('user-modify-playback-state'))console.log('Action: run geekify login to request playback control again.');
  } else {
    console.log('Granted scopes: unknown (older Geekify sessions did not record these).');
    console.log('Action: run geekify login to refresh and record granted scopes.');
  }
  const api=new SpotifyApi();
  let failures=0;
  try{
    const playback=await api.playback();
    console.log('\nGET /me/player: OK'+(playback?'':' (no active playback)'));
    if(playback?.device){
      const d=playback.device;
      console.log('Active device: '+safe(d.name)+' / '+safe(d.type));
      console.log('Restricted remote control: '+(d.is_restricted?'YES':'no'));
      if(d.is_restricted)console.log('Action: switch playback to Spotify Desktop before trying controls.');
    }else console.log('Action: start playing a track in Spotify Desktop, then try controls.');
  }catch(error){
    failures++;
    console.log('\nGET /me/player: '+safe(error.message));
  }
  try{
    const devices=await api.devices();
    const all=devices?.devices||[];
    console.log('\nGET /me/player/devices: OK ('+all.length+' devices)');
    for(const d of all){
      console.log(' - '+safe(d.name)+' ['+safe(d.type)+']'+(d.is_active?' ACTIVE':'')+(d.is_restricted?' RESTRICTED':''));
    }
    if(!all.length)console.log('Action: open Spotify Desktop and begin playback to activate a device.');
  }catch(error){
    failures++;
    console.log('\nGET /me/player/devices: '+safe(error.message));
  }
  console.log('\nThis command only reads playback info. It does NOT send play/pause.');
  console.log('If a control still fails in the Geekify UI, Spotify now displays its exact API error reason.');
  console.log('For 403 errors, verify your Spotify Developer Dashboard allowlist and Premium account.');
  return failures?1:0;
}
