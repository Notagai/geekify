#!/usr/bin/env node
import {GeekifyTui} from '../cli/ui.mjs';
const cmd=process.argv[2];
if(['--help','-h','help'].includes(cmd)){
  console.log('geekify-fast [demo] - Terminal-native Spotify interface. Run geekify login to authorize.\n'+
    'Space pause/play | n/p skip | 1-5 tabs | / search | j/k browse | q quit');
}else if(cmd==='--version'){
  console.log('geekify-fast 0.4.0');
}else if(!cmd||cmd==='demo'){
  new GeekifyTui({demo:cmd==='demo'}).run().catch(error=>{
    console.error('geekify-fast: '+error.message);process.exitCode=1;
  });
}else{
  console.error('Unknown option. Use geekify-fast --help.');process.exitCode=1;
}
