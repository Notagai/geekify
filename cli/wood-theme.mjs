// Foldered-inspired warm wood and cream-paper ANSI styling.
// This does NOT display Foldered's raster assets or require a terminal image protocol.
const ESC='\x1b[';
export const palette={
  wood:[95,55,34],woodLight:[123,73,43],woodDark:[73,42,28],
  paper:[246,231,205],paperLight:[255,243,221],paperShadow:[210,182,148],
  ink:[69,39,20],brown:[112,56,26],muted:[122,91,67],sage:[65,99,70],
  gold:[160,94,37],highlight:[192,145,94],white:[255,249,232]
};
export const bg=([r,g,b])=>ESC+'48;2;'+r+';'+g+';'+b+'m';
export const fg=([r,g,b])=>ESC+'38;2;'+r+';'+g+';'+b+'m';
export const RESET='\x1b[0m';
export const paperWidth=width=>Math.min(width-4,Math.max(40,Math.floor(width*.88)),112);
const inkFor={base:palette.ink,bright:palette.brown,muted:palette.muted,pink:palette.gold,
  mint:palette.sage,warning:[159,72,45],violet:palette.brown,selected:palette.white};
const cell=text=>Array.from(String(text??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' '));
export function fit(text,w){
  const chars=cell(text);
  if(w<=0)return '';
  if(chars.length>w)return chars.slice(0,Math.max(0,w-1)).join('')+'…';
  return chars.join('')+' '.repeat(w-chars.length);
}
function grainAt(x,y){
  const n=((x*29+y*61+Math.floor(x/17)*17) % 67);
  const streak=(y%5===0 && n<19)||(y%7===0 && n<10);
  return streak?'·':n<2?'˙':' ';
}
function woodStrip(width,row,text=''){
  const tones=[palette.woodDark,palette.wood,palette.woodLight,palette.wood,palette.woodDark];
  let str='',recent=-1;
  for(let x=0;x<width;x++){
    const color=tones[(row+Math.floor(x/25))%tones.length];
    const selected=color.join(',');
    if(selected!==recent){str+=bg(color)+fg(palette.paperShadow);recent=selected;}
    str+=grainAt(x,row);
  }
  if(text){
    const title=fit(text,Math.max(0,width-6));
    const offset=3;
    str=bg(palette.wood)+fg(palette.white)+'   '+title+RESET;
    str+=woodStrip(width-Math.min(width,3+Array.from(title).length),row);
  }
  return str+RESET;
}
function paperSegment(text,width,color='base',emphasis=false){
  const background=color==='selected'?palette.brown:(emphasis?palette.paperLight:palette.paper);
  return bg(background)+fg(inkFor[color]||inkFor.base)+fit(text,width)+RESET;
}
export function renderWoodUI({width,height,tabs,active,connected,playing,lines,status,prompt,help=false}){
  width=Math.max(48,Math.floor(width));
  height=Math.max(16,Math.floor(height));
  const panel=paperWidth(width);
  const left=Math.floor((width-panel)/2),right=width-panel-left;
  const inner=panel-4;
  const outside=(row)=>woodStrip(left,row);
  const after=(row)=>woodStrip(right,row+4);
  const board=(content,row)=>{
    const text=fit(content,inner);
    return outside(row)+bg(palette.woodDark)+fg(palette.paperShadow)+'▐'+
      paperSegment(' '+text+' ',inner+2,'base')+bg(palette.woodDark)+fg(palette.paperShadow)+'▌'+RESET+after(row);
  };
  const contentLine=(line,row)=>{
    if(line?.artRow) {
      const remaining=Math.max(0,inner-2-line.artWidth);
      const rightText=fit(line.right||'',remaining);
      const paper=bg(palette.paper)+fg(palette.ink);
      const body=paper+'  '+line.artRow+paper+fg(inkFor[line.color]||palette.ink)+rightText;
      return outside(row)+bg(palette.woodDark)+fg(palette.paperShadow)+'▐'+paper+' '+body+
        paper+' '.repeat(Math.max(0,inner-2-line.artWidth-Array.from(rightText).length)+1)+
        bg(palette.woodDark)+fg(palette.paperShadow)+'▌'+RESET+after(row);
    }
    if(line?.spriteRow){
      const offset=Math.max(0,Math.min(inner-12,line.spriteOffset||0));
      const paper=bg(palette.paper)+fg(palette.ink);
      const sprite=line.spriteRow;
      const body=paper+' '.repeat(offset)+sprite+paper+' '.repeat(inner-offset-12);
      return outside(row)+bg(palette.woodDark)+fg(palette.paperShadow)+'▐'+paper+' '+body+' '+
        bg(palette.woodDark)+fg(palette.paperShadow)+'▌'+RESET+after(row);
    }
    const content=line?.text||'';
    const shade=line?.color==='selected'?'selected':'base';
    return outside(row)+bg(palette.woodDark)+fg(palette.paperShadow)+'▐'+
      paperSegment(' '+fit(content,inner)+' ',inner+2,line?.color||shade)+bg(palette.woodDark)+fg(palette.paperShadow)+'▌'+RESET+after(row);
  };
  const buffer=[];
  buffer.push(woodStrip(width,0));
  const header='  ◈ geekify.  /  NOW PLAYING ON YOUR DESK';
  const state=(connected?'● SPOTIFY':'◌ DEMO')+'  '+(playing?'▶ PLAYING':'Ⅱ PAUSED');
  buffer.push(board(fit(header,inner-Math.min(inner,26))+state,1));
  const nav = tabs.map((name,i)=>active===name?' ['+(i+1)+' '+name.toUpperCase()+'] ':'  '+(i+1)+' '+name+'  ').join('');
  buffer.push(board(fit(nav,inner),2));
  buffer.push(outside(3)+bg(palette.woodDark)+fg(palette.paperShadow)+'▟'+
    bg(palette.paperShadow)+' '.repeat(panel-2)+
    bg(palette.woodDark)+fg(palette.paperShadow)+'▙'+RESET+after(3));
  const capacity=height-6;
  for(let i=0;i<capacity;i++)buffer.push(contentLine(lines[i],i+4));
  const edge=height-2;
  buffer.push(outside(edge)+bg(palette.woodDark)+fg(palette.paperShadow)+'▜'+bg(palette.paperShadow)+' '.repeat(panel-2)+
    bg(palette.woodDark)+fg(palette.paperShadow)+'▛'+RESET+after(edge));
  const info=prompt ? (prompt.mode==='search'?' SEARCH / ':' COMMAND :')+prompt.text+'_' : status;
  buffer.push(board(fit(info,inner),height-1));
  return buffer;
}
