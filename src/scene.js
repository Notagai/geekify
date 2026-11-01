const W = 640, H = 360;
const themes = {
  city: { sky: ['#0a102d','#111936','#222044','#4b2c5b','#ae597d'], haze: '#eb84aa', dark: '#14172f', far: '#262748', light: '#e3a0b8', bright: '#ffe3b7', spark: '#8ce9ea' },
  dusk: { sky: ['#262747','#624269','#a45f86','#dd8394','#f5b28c'], haze: '#f7a67e', dark: '#2c2c4c', far: '#565072', light: '#f9a7a9', bright: '#ffe4bd', spark: '#f8cda6' },
  orbit: { sky: ['#050b20','#0b1230','#161b45','#202552','#42365b'], haze: '#9c92fb', dark: '#080c22', far: '#23264e', light: '#b5a9f6', bright: '#fff1db', spark: '#9de9ec' }
};
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const random = seeded(11031);
const stars = Array.from({ length: 150 }, () => ({ x: random()*W, y: random()*230, size: random()>.89?2:1, phase: random()*6.28 }));
const drops = Array.from({ length: 135 }, () => ({ x: random()*W, y: random()*H, length: 4+random()*14, speed: 22+random()*60 }));
function buildings(seed, base, minHeight, maxHeight, minWidth, maxWidth) {
  const rnd = seeded(seed); let x = -10; const out = [];
  while(x < 660) { const width = Math.floor(minWidth+rnd()*(maxWidth-minWidth)); const height=Math.floor(minHeight+rnd()*(maxHeight-minHeight)); out.push({x,width,height,lit:rnd()}); x += width+Math.floor(rnd()*5); }
  return out;
}
const farBuildings=buildings(619,273,38,100,12,31);
const nearBuildings=buildings(823,317,44,136,18,42);

export class PixelScene {
  constructor(canvas) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:false});
    canvas.width=W; canvas.height=H;
    this.ctx.imageSmoothingEnabled=false;
    this.last=-1;
  }
  draw(ms, scene='city', intensity=.65, paused=false, reduceMotion=false) {
    // Low-resolution render remains cheap even on 4K displays.
    if (!reduceMotion && ms-this.last < 32) return;
    if (reduceMotion && this.last!==-1) return;
    this.last=ms;
    const ctx=this.ctx, t=reduceMotion?0:ms/1000, p=themes[scene]||themes.city;
    const energy = paused ? .2 : .5+.5*Math.sin(t*2.1);
    ctx.clearRect(0,0,W,H);
    this.sky(ctx,p);
    this.stars(ctx,p,t,scene);
    if (scene==='city') this.city(ctx,p,t,intensity,energy);
    if (scene==='dusk') this.dusk(ctx,p,t,intensity);
    if (scene==='orbit') this.orbit(ctx,p,t,intensity,energy);
    this.speckles(ctx,t,intensity,p);
  }
  sky(ctx,p) {
    const bands=p.sky.length;
    for(let y=0;y<H;y+=3){
      const n=Math.min(bands-1,Math.floor((y/H)*bands));
      ctx.fillStyle=p.sky[n];ctx.fillRect(0,y,W,3);
    }
    const g=ctx.createLinearGradient(0,135,0,320);
    g.addColorStop(0,'#00000000');g.addColorStop(1,p.haze+'45');
    ctx.fillStyle=g;ctx.fillRect(0,135,W,185);
  }
  stars(ctx,p,t,scene) {
    for(const s of stars){
      if(scene==='dusk'&&s.y>95)continue;
      const glint=.55+.45*Math.sin(t*.8+s.phase);
      ctx.globalAlpha=.24+glint*.62;ctx.fillStyle=p.bright;ctx.fillRect(Math.round(s.x),Math.round(s.y),s.size,s.size);
    }ctx.globalAlpha=1;
  }
  city(ctx,p,t,intensity,energy) {
    const moonX=478, moonY=79;
    ctx.fillStyle='#eed5d0';ctx.beginPath();ctx.arc(moonX,moonY,30,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.sky[1];ctx.beginPath();ctx.arc(moonX+10,moonY-7,28,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.12;ctx.fillStyle='#fac8cc';for(let i=0;i<5;i++)ctx.fillRect(450-i*9,103+i*2,80+i*16,1);ctx.globalAlpha=1;
    ctx.fillStyle='#805078';ctx.fillRect(0,237,W,2);
    this.cityLayer(ctx,farBuildings,275,p.far,'#bc759e',.38,t);
    // Glowing distant signage.
    ctx.fillStyle='#d888aa';ctx.fillRect(140,183,32,3);ctx.fillStyle='#92c4d8';ctx.fillRect(391,216,23,2);
    this.cityLayer(ctx,nearBuildings,326,p.dark,p.light,.75,t);
    // Rooftop silhouette and windows beyond the main panel.
    ctx.fillStyle='#111529';ctx.fillRect(0,320,W,40);
    ctx.fillStyle='#242039';ctx.fillRect(0,320,W,2);
    ctx.fillStyle='#ffb4c0';ctx.globalAlpha=.5;ctx.fillRect(0,321,W,1);ctx.globalAlpha=1;
    ctx.fillStyle='#1c1b2e';ctx.fillRect(0,333,W,27);
    for(let x=0;x<W;x+=20){ctx.fillStyle=x%40===0?'#47405c':'#302b48';ctx.fillRect(x,333,2,27);}
    ctx.globalAlpha=.28+energy*.19*intensity;ctx.fillStyle=p.haze;ctx.fillRect(0,308,W,8);ctx.globalAlpha=1;
    // Thin rain lines, moving across a fixed pixel grid.
    ctx.fillStyle='#b7c9f0';
    for(let i=0;i<drops.length*intensity;i++){
      const d=drops[i],y=((d.y+t*d.speed)%H);
      ctx.globalAlpha=.10+(i%4)*.045;
      ctx.fillRect(Math.round((d.x+t*7)%W),Math.round(y),1,Math.round(d.length*.56));
    }ctx.globalAlpha=1;
    // Tiny passing meteor.
    let shoot=(t*12)%900-120;
    ctx.fillStyle=p.spark;ctx.globalAlpha=.6;ctx.fillRect(Math.round(shoot),46,20,1);ctx.fillRect(Math.round(shoot+20),45,2,2);ctx.globalAlpha=1;
  }
  cityLayer(ctx,layer,ground,color,windowColor,opacity,t){
    for(const b of layer){
      const top=ground-b.height;
      ctx.fillStyle=color;ctx.fillRect(b.x,top,b.width,b.height);
      ctx.fillStyle=windowColor;
      for(let y=top+8;y<ground-4;y+=10){
        for(let x=b.x+5;x<b.x+b.width-4;x+=8){
          const lit=((x*7+y*13+b.height)%19)>10;
          if(!lit)continue;
          ctx.globalAlpha=opacity*(.8+.2*Math.sin(t*.5+x));
          ctx.fillRect(x,y,3,4);
        }
      }ctx.globalAlpha=1;
      if(b.lit>.8){ctx.fillStyle='#dd9ab1';ctx.fillRect(b.x+2,top-3,b.width-5,2);}
      ctx.fillStyle=color;ctx.fillRect(b.x+Math.floor(b.width/2)-1,top-6,2,6);
    }
  }
  dusk(ctx,p,t,intensity) {
    ctx.globalAlpha=.75;ctx.fillStyle='#ffe0ad';ctx.beginPath();ctx.arc(392,177,53,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    for(let y=177;y<245;y+=9){ctx.fillStyle=p.sky[3];ctx.fillRect(338,y,110,2);}
    this.mountain(ctx,'#7d5a83',218,[0,30,70,55,128,90,193,64,265,105,344,45,430,112,518,52,640,75]);
    this.mountain(ctx,'#524868',259,[0,45,75,18,170,67,255,37,335,92,420,44,520,76,640,35]);
    this.mountain(ctx,'#292b4a',310,[0,40,55,13,134,42,236,2,324,32,434,15,541,41,640,17]);
    ctx.fillStyle='#141a34';ctx.fillRect(0,315,W,45);
    // Pine tree silhouettes.
    for(let i=0;i<44;i++){
      const x=i*16+((i*11)%13)-5, h=18+((i*29)%48), y=317;
      ctx.fillStyle=i%3===0?'#181e36':'#10172d';
      ctx.beginPath();ctx.moveTo(x,y-h);ctx.lineTo(x-11,y);ctx.lineTo(x+11,y);ctx.fill();
      ctx.fillRect(x-1,y-5,3,17);
    }
    ctx.globalAlpha=.22;ctx.fillStyle=p.bright;for(let i=0;i<10;i++){let x=(i*73+t*intensity*9)%W,y=90+(i*41)%175;ctx.fillRect(x,y,2,2);}ctx.globalAlpha=1;
  }
  mountain(ctx,color,ground,positions){
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,ground);
    for(let i=0;i<positions.length;i+=2)ctx.lineTo(positions[i],ground-positions[i+1]);
    ctx.lineTo(W,ground);ctx.closePath();ctx.fill();
  }
  orbit(ctx,p,t,intensity,energy){
    const cx=447,cy=172;
    ctx.globalAlpha=.14;ctx.fillStyle=p.haze;ctx.beginPath();ctx.arc(cx,cy,104,0,7);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle='#585690';ctx.beginPath();ctx.ellipse(cx,cy,71,70,0,0,7);ctx.fill();
    ctx.fillStyle='#a79fd6';ctx.beginPath();ctx.arc(cx-9,cy-10,55,0,7);ctx.fill();
    ctx.fillStyle='#c2bde2';ctx.globalAlpha=.7;ctx.fillRect(cx-31,cy-19,47,5);ctx.fillRect(cx-34,cy+1,68,8);ctx.fillRect(cx-26,cy+22,35,3);ctx.globalAlpha=1;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(-.28);
    ctx.strokeStyle='#f1bfc9';ctx.lineWidth=9;ctx.globalAlpha=.85;ctx.beginPath();ctx.ellipse(0,0,112,35,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.restore();
    ctx.fillStyle='#b4dcf2';ctx.fillRect(100+Math.sin(t*.3)*20,104+Math.cos(t*.3)*8,14,4);ctx.fillStyle=p.bright;ctx.fillRect(104+Math.sin(t*.3)*20,101+Math.cos(t*.3)*8,5,3);
    // Low foreground horizon keeps the copy readable.
    ctx.fillStyle='#0b1029';ctx.beginPath();ctx.moveTo(0,310);ctx.lineTo(120,281);ctx.lineTo(258,311);ctx.lineTo(394,295);ctx.lineTo(522,320);ctx.lineTo(640,300);ctx.lineTo(640,360);ctx.lineTo(0,360);ctx.fill();
    ctx.globalAlpha=.15+energy*.15*intensity;ctx.fillStyle=p.spark;ctx.fillRect(0,315,W,2);ctx.globalAlpha=1;
  }
  speckles(ctx,t,intensity,p){
    ctx.globalAlpha=.18;ctx.fillStyle=p.bright;
    for(let i=0;i<45;i++){
      const x=(i*97+11)%W, y=(i*51+13)%H;
      if((i+Math.floor(t*intensity))%9===0)ctx.fillRect(x,y,1,1);
    }ctx.globalAlpha=1;
  }
}
