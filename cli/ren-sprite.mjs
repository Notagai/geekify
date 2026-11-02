// Tiny 12x10 ANSI half-block pixel mascot. No images, audio access or API calls.
// Two frames shift Ren's head by one source pixel for a restrained nod.
const COLORS={h:[32,38,43],s:[62,86,63],f:[224,177,139],e:[35,31,34],p:[42,49,47],w:[245,231,205]};
const BASE=[
'    hhhh    ',
'   hhhhhhh  ',
'  hhffffhh  ',
'  hfeffefh  ',
'  hhffffhh  ',
'   hffffh   ',
'   sssssss  ',
'  sssssssss ',
'  sssppssss ',
'   pppppp   ',
'   pp  pp   ',
'   ww  ww   '
];
const rgb=(c,bg)=>'\x1b['+(bg?'48':'38')+';2;'+c.join(';')+'m';
export function renRows(frame=0){
  const shift=frame%2;
  const pixels=BASE.map((row,y)=>y<6&&shift?' '+row.slice(0,-1):row);
  const out=[];
  for(let y=0;y<pixels.length;y+=2){
    let line='';
    for(let x=0;x<12;x++){
      const top=COLORS[pixels[y][x]],bottom=COLORS[pixels[y+1][x]];
      if(!top&&!bottom){line+=' ';continue;}
      if(top&&bottom)line+=rgb(top,false)+rgb(bottom,true)+'▀';
      else if(top)line+=rgb(top,false)+'▀';
      else line+=rgb(bottom,false)+'▄';
      line+='\x1b[0m';
    }
    out.push(line);
  }
  return out;
}
