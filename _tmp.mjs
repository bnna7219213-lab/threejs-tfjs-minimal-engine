
import * as THREE from 'three';

// ---------- 内联核心算法（seed / noise / terrain / grammar） ----------
// 与 src/seed.js 完全一致（demo 不需要 build step）
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function splitSeed(seed, index){let x=(seed>>>0)+0x9E3779B1+(index>>>0);x=(x^(x>>>16))*0x45D9F3B;x=(x^(x>>>16))*0x45D9F3B;return(x^(x>>>16))>>>0;}
const BIOMES=[
  {id:'forest',name:'森林',tokens:'森·林·绿·叶',heightMul:1.0},
  {id:'tundra',name:'雪原',tokens:'霜·雪·白·寒',heightMul:0.7},
  {id:'volcano',name:'熔焰',tokens:'熔·焰·红·岩',heightMul:1.4},
  {id:'ruins',name:'遗迹',tokens:'石·纹·古·尘',heightMul:0.9},
  {id:'underdark',name:'幽暝',tokens:'幽·暝·石·暗',heightMul:0.8},
];
function biomeFromSeed(seed){const idx=((seed%BIOMES.length)+BIOMES.length)%BIOMES.length;return BIOMES[idx];}
function terrainSeedFromMaster(s){return splitSeed(s,1);}
function descSeedFromMaster(s){return splitSeed(s,3);}
function scatterSeedFromMaster(s){return splitSeed(s,2);}

function makeNoise2D(seed){
  const rand=mulberry32(seed),p=new Uint8Array(256),perm=new Uint8Array(512);
  for(let i=0;i<256;i++)p[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(rand()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
  for(let i=0;i<512;i++)perm[i]=p[i&255];
  const GRAD=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const fade=t=>t*t*t*(t*(t*6-15)+10),lerp=(a,b,t)=>a+(b-a)*t,
        gDot=(h,x,y)=>{const g=GRAD[h&7];return g[0]*x+g[1]*y;};
  function noise2D(x,y){
    const X=Math.floor(x)&255,Y=Math.floor(y)&255,xf=x-Math.floor(x),yf=y-Math.floor(y);
    const u=fade(xf),v=fade(yf),aa=perm[X+perm[Y]],ab=perm[X+perm[Y+1]],
          ba=perm[X+1+perm[Y]],bb=perm[X+1+perm[Y+1]];
    return lerp(lerp(gDot(aa,xf,yf),gDot(ba,xf-1,yf),u),
                lerp(gDot(ab,xf,yf-1),gDot(bb,xf-1,yf-1),u),v)*1.4142135623730951;
  }
  function fbm(x,y,{octaves=6,persistence=0.5,lacunarity=2.0}={}){
    let amp=1,freq=1,sum=0,maxAmp=0;
    for(let o=0;o<octaves;o++){sum+=noise2D(x*freq,y*freq)*amp;maxAmp+=amp;amp*=persistence;freq*=lacunarity;}
    return sum/maxAmp;
  }
  return{fbm};
}

const GLOSSARY={
  forest:{adjectives:['古老','青翠','幽深','静谧','潮湿'],nouns:['林','苔','藤蔓','溪流','鹿影']},
  tundra:{adjectives:['苍白','冰冷','坚硬','沉默','辽阔'],nouns:['霜','雪','冰原','冻土','孤鹰']},
  volcano:{adjectives:['灼热','猩红','滚烫','焦黑','脉动'],nouns:['熔岩','火山','灰烬','硫气','流火']},
  ruins:{adjectives:['破碎','古老','蒙尘','沉默','残破'],nouns:['遗迹','石碑','废墟','尘缘','裂痕']},
  underdark:{adjectives:['幽暗','潮湿','冰冷','回音','神秘'],nouns:['石廊','暗流','幽光','菌菇','回声']},
};
const DEFAULT_RULES={desc:'<adjective><noun>，<adjective><noun>。',};
function defaultFill(w,b,rand){const g=GLOSSARY[b]||GLOSSARY.forest;const pool=g[w]||g.adjectives;return pool[Math.floor(rand()*pool.length)];}
function expand(rules,start,fill,biomeId,rand,depth=0,maxDepth=6){
  if(depth>maxDepth)return `[DEPTH:${start}]`;
  let rule=rules[start];if(typeof rule==='string')rule=rule.split('|');
  if(!Array.isArray(rule))return start;
  const tmpl=rule[Math.floor(rand()*rule.length)];
  let out='';const re=/<\/?([^>]+)>/g;let m,last=0;
  while((m=re.exec(tmpl))){out+=tmpl.slice(last,m.index);
    if(!m[0].startsWith('</')){
      const sub=rules[m[1]];
      if(typeof sub==='string'||Array.isArray(sub)) out+=expand(rules,m[1],fill,biomeId,rand,depth+1,maxDepth);
      else out+=fill(m[1],biomeId,rand);
    }
    last=m.index+m[0].length;
  }
  return out+tmpl.slice(last);
}
function generateDesc({rules=DEFAULT_RULES,biomeId='forest',rand}){
  return expand(rules,'desc',defaultFill,biomeId,rand,0,6);
}

// ---------- Three.js 渲染 ----------
const canvas=document.getElementById('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0a0d12);scene.fog=new THREE.FogExp2(0x0a0d12,0.008);
const camera=new THREE.PerspectiveCamera(55,1,0.1,2000);
const ambient=new THREE.HemisphereLight(0x8fb3e8,0x33291f,0.7);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xfff1d6,1.15);sun.position.set(60,80,40);scene.add(sun);
let terrainMesh=null,waterMesh=null;

function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);
setTimeout(resize,30);

// 相机轨道
const cam={theta:0.9,phi:1.05,radius:100,target:new THREE.Vector3(0,0,0),dragging:false,lastX:0,lastY:0};
function updateCam(){
  const sp=Math.sin(cam.phi);
  camera.position.set(cam.target.x+cam.radius*sp*Math.sin(cam.theta),
                      cam.target.y+cam.radius*Math.cos(cam.phi),
                      cam.target.z+cam.radius*sp*Math.cos(cam.theta));
  camera.lookAt(cam.target);
}
canvas.addEventListener('pointerdown',e=>{cam.dragging=true;cam.lastX=e.clientX;cam.lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',()=>cam.dragging=false);
canvas.addEventListener('pointerleave',()=>cam.dragging=false);
canvas.addEventListener('pointermove',e=>{if(!cam.dragging)return;if(xFormMode==='move'||xFormMode==='rotate')return;
  cam.theta-=(e.clientX-cam.lastX)*0.005;
  cam.phi=Math.max(0.2,Math.min(1.5,cam.phi-(e.clientY-cam.lastY)*0.005));
  cam.lastX=e.clientX;cam.lastY=e.clientY;updateCam();});
canvas.addEventListener('wheel',e=>{e.preventDefault();cam.radius=Math.max(20,Math.min(250,cam.radius*(1+e.deltaY*0.001)));updateCam();},{passive:false});

// ---------- 地形生成（Three.js 版） ----------
let activeTerrain='fbm',activeChar='none',charGroup=null;
let terrainHeights=null, vegetationIM=null;
const TERRAIN_GENERATORS={
  fbm({fbm,size,hs,biome,res}){
    const HALF=size*0.5;
    const heights=new Float32Array(res*res);
    const scale=0.02;
    for(let i=0;i<heights.length;i++){
      const x=-HALF+(i%res)/(res-1)*size;
      const z=-HALF+Math.floor(i/res)/(res-1)*size;
      heights[i]=fbm(x*scale,z*scale,{octaves:6})*hs*biome.heightMul;
    }
    return heights;
  },
  voronoi({rand,size,hs,biome,res}){
    const HALF=size*0.5,N=18;
    // 生成 N 个散点
    const pts=[];
    for(let i=0;i<N;i++){pts.push({x:(rand()-0.5)*size*0.9,z:(rand()-0.5)*size*0.9,
      h:(rand()*2-1)*hs*biome.heightMul*0.9});}
    const heights=new Float32Array(res*res);
    for(let i=0;i<heights.length;i++){
      const x=-HALF+(i%res)/(res-1)*size;
      const z=-HALF+Math.floor(i/res)/(res-1)*size;
      let dMin=1e9,d2=1e9,hMin=0;
      for(let k=0;k<pts.length;k++){const pt=pts[k];
        const dx=x-pt.x,dz=z-pt.z,d=Math.hypot(dx,dz);
        if(d<dMin){d2=dMin;hMin=pt.h;dMin=d;}else if(d<d2){d2=d;}
      }
      const blend=Math.min(1,d2/(dMin+0.01));
      heights[i]=hMin*(1-blend*0.6)+hs*biome.heightMul*0.3*blend;
    }
    return heights;
  },
  diamond({rand,size,hs,biome,res}){
    const HALF=size*0.5;
    // 选择 2^n 网格，确保 res+1 是 2 的幂
    let n=res;
    const heights=new Float32Array((res+1)*(res+1));
    // 菱形多边形填充
    const step=Math.log2(res);
    if(step%1!==0){heights.fill(0);return heights;}
    const side=res+1;
    // 四角随机
    heights[0]=rand()*hs*biome.heightMul*2-hs*biome.heightMul;
    heights[res]=rand()*hs*biome.heightMul*2-hs*biome.heightMul;
    heights[res*side]=rand()*hs*biome.heightMul*2-hs*biome.heightMul;
    heights[res*side+res]=rand()*hs*biome.heightMul*2-hs*biome.heightMul;
    let span=res,sl=1;
    while(span>1){
      const half=span>>1,rng=sl*hs*biome.heightMul*0.5;
      // 中心点（菱形）
      for(let z=half;z<side;z+=span){
        for(let x=half;x<side;x+=span){
          const i=z*side+x;
          const avg=(heights[(z-half)*side+x]+heights[(z+half)*side+x]
            +heights[z*side+(x-half)]+heights[z*side+(x+half)])/4;
          heights[i]=avg+(rand()*2-1)*rng;
        }
      }
      // 中点（方形）
      for(let z=0;z<side;z+=half){
        const zOff=(z+half)%span;
        for(let x=0;x<side;x+=half){
          const xOff=(x+half)%span;
          const i=(z+zOff)*side+(x+xOff);
          if((zOff+z)%span!==0||span===0)continue;
          const zz=(z+zOff),xx=(x+xOff);
          if(zz>=side||xx>=side)continue;
          const idx=zz*side+xx;
          const up=zz-half>=0?heights[(zz-half)*side+xx]:heights[idx];
          const dn=zz+half<side?heights[(zz+half)*side+xx]:heights[idx];
          const lt=xx-half>=0?heights[zz*side+(xx-half)]:heights[idx];
          const rt=xx+half<side?heights[zz*side+(xx+half)]:heights[idx];
          const avg=(up+dn+lt+rt)/4;
          heights[idx]=avg+(rand()*2-1)*rng;
        }
      }
      span=half;sl*=0.5;
    }
    // 重映射到 res*res
    const out=new Float32Array(res*res);
    for(let i=0;i<res*res;i++){out[i]=heights[i];}
    return out;
  },
  sine({rand,size,hs,biome,res}){
    const HALF=size*0.5,seed=mulberry32(rand());
    const k1=seed()*6+2,k2=seed()*8+3,ph=seed()*6.28;
    const heights=new Float32Array(res*res);
    for(let i=0;i<heights.length;i++){
      const x=-HALF+(i%res)/(res-1)*size;
      const z=-HALF+Math.floor(i/res)/(res-1)*size;
      const h=sin(x*k1+ph)+Math.sin(z*k2+ph*1.3)+Math.sin((x+z)*0.5*k1);
      heights[i]=(h/3)*hs*biome.heightMul*0.8;
    }
    return heights;
  },
};
function sin(x){return Math.sin(x);}

// ---------- 地形二级 Style 修饰器 ----------
let decorGroup=null;
function clearDecor(){if(decorGroup){while(decorGroup.children.length)decorGroup.remove(decorGroup.children[0]);scene.remove(decorGroup);decorGroup=null;}}

function applyTerrainStyle(heights, style, density, intensity, rand, size, res, biome, hs){
  const half=size*0.5,styleMul=density*intensity;
  if(style==='desert'){
    // 沙漠：抬高整体基座，峰值加暖色沙色
    for(let i=0;i<heights.length;i++){
      const x=-half+(i%res)/(res-1)*size;
      const z=-half+Math.floor(i/res)/(res-1)*size;
      const d=Math.hypot(x,z);
      const ripple=Math.sin(d*0.08+rand()*6.28)*hs*0.15*styleMul;
      heights[i]+=ripple+hs*0.5*styleMul;
    }
  }else if(style==='river'){
    // 溪流：在 x 方向挖出正弦河道
    const amp=hs*0.4*intensity,depth=hs*0.8*intensity;
    const k=0.03+rand()*0.02;
    for(let i=0;i<heights.length;i++){
      const x=-half+(i%res)/(res-1)*size;
      const zx=Math.floor(i/res);
      const riverZ=Math.sin(x*k)*half*0.8;
      const realZ=-half+zx/(res-1)*size;
      const dist=Math.abs(realZ-riverZ);
      if(dist<amp){
        const t=1-dist/amp;
        heights[i]-=depth*t*styleMul*0.6;
      }
    }
  }else if(style==='volcanic'){
    // 火山：峰值更高更尖
    for(let i=0;i<heights.length;i++){
      const x=-half+(i%res)/(res-1)*size;
      const z=-half+Math.floor(i/res)/(res-1)*size;
      const d=Math.hypot(x,z);
      const peak=Math.max(0,hs*biome.heightMul*1.5-d*0.05)*Math.sin(rand()*6.28);
      if(heights[i]>hs*0.5)heights[i]+=peak*intensity*0.3;
    }
  }else if(style==='ice'){
    // 冰雪：峰值加白，谷底加深
    for(let i=0;i<heights.length;i++){
      const h=heights[i]/hs;
      if(h>0.5)heights[i]*=1+intensity*0.2;
    }
  }
  return heights;
}

function buildDecor(style, density, intensity, rand, size, res, biome, heights){
  if(decorGroup){while(decorGroup.children.length)decorGroup.remove(decorGroup.children[0]);scene.remove(decorGroup);}
  if(style==='none')return;
  decorGroup=new THREE.Group();
  const half=size*0.5;
  const count=Math.floor(20*density*intensity);
  const r2=mulberry32(rand());
  const isFlat=(i)=>heights&&Math.abs(heights[i])<hs*0.15;
  for(let n=0;n<count;n++){
    const x=-half+r2()*size;
    const z=-half+r2()*size;
    const i=Math.floor(z+half)/size*(res-1)*res+(Math.floor(x+half)/size*(res-1));
    const flat=heights?heights[Math.min(heights.length-1,Math.max(0,i))]:0;
    const y=(flat||0)+0.3;
    if(style==='lush'){
      // 树：树干+树冠
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.25,1.2,5),
        new THREE.MeshStandardMaterial({color:0x4a3520,roughness:0.95}));
      trunk.position.set(x,y+0.6,z);decorGroup.add(trunk);
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(0.9,1.8,6),
        new THREE.MeshStandardMaterial({color:0x2d7a27,roughness:0.9}));
      canopy.position.set(x,y+1.9,z);decorGroup.add(canopy);
    }else if(style==='desert'){
      // 仙人掌
      if(r2()<0.5){
        const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,1.5,6),
          new THREE.MeshStandardMaterial({color:0x2a6a3a,roughness:0.9}));
        stem.position.set(x,y+0.75,z);decorGroup.add(stem);
        const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.5,5),
          new THREE.MeshStandardMaterial({color:0x2a6a3a,roughness:0.9}));
        arm.position.set(x+0.3,y+1.2,z);arm.rotation.z=-1.2;decorGroup.add(arm);
      }else{
        // 沙石
        const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(0.4,0),
          new THREE.MeshStandardMaterial({color:0xc4a060,roughness:0.95}));
        rock.position.set(x,y+0.2,z);rock.rotation.set(r2()*6,r2()*6,0);decorGroup.add(rock);
      }
    }else if(style==='river'){
      // 水波面（沿河道）
      const k=0.03+r2()*0.02;
      const riverZ=Math.sin(x*k)*half*0.8;
      const wx=Math.floor(x+half),realZ=-half+Math.floor(z+half)/(size/1)*size;
      if(Math.abs(realZ-riverZ)<hs*0.4){
        const wave=new THREE.Mesh(new THREE.SphereGeometry(0.3,6,4),
          new THREE.MeshStandardMaterial({color:0x1c5b7a,transparent:true,opacity:0.7}));
        wave.position.set(x,y-0.5,z);wave.scale.y=0.3;decorGroup.add(wave);
      }
    }else if(style==='volcanic'){
      // 岩浆块
      const lava=new THREE.Mesh(new THREE.DodecahedronGeometry(0.5,0),
        new THREE.MeshStandardMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.5,roughness:0.8}));
      lava.position.set(x,y+0.3,z);decorGroup.add(lava);
    }else if(style==='ice'){
      // 冰晶
      const ice=new THREE.Mesh(new THREE.OctahedronGeometry(0.5,0),
        new THREE.MeshStandardMaterial({color:0x88ccff,transparent:true,opacity:0.7,roughness:0.3,metalness:0.4}));
      ice.position.set(x,y+0.4,z);ice.rotation.set(r2()*6,r2()*6,0);decorGroup.add(ice);
    }
  }
  scene.add(decorGroup);
}

// ---------- 人物色泽调色板 ----------
const CHAR_PALETTES={
  warrior:['#8b4513','#654321','#b87333','#2a1a0a','#4a3728'],
  beast:['#4a3728','#6b4e35','#2a1a0f','#8a7355','#3a2a1a'],
  robot:['#666677','#445566','#224433','#553355','#776655'],
  elf:['#2d5a27','#1a3a18','#3a5a2a','#4a3a2a','#2a4a3a'],
  golem:['#555555','#6a5a4a','#5a3a2a','#4a5a4a','#5a4a5a'],
};
let activeCharColor=0;
function renderCharSwatches(charType){
  const el=document.getElementById('char-colors');
  el.innerHTML='';
  const pal=CHAR_PALETTES[charType]||['#888'];
  pal.forEach((c,i)=>{
    const s=document.createElement('span');
    s.className='swatch'+(i===activeCharColor?' active':'');
    s.style.background=c;
    s.dataset.idx=i;
    s.addEventListener('click',()=>{
      el.querySelectorAll('.swatch').forEach(b=>b.classList.remove('active'));
      s.classList.add('active');activeCharColor=i;
      if(activeChar!=='none')spawnCharacter(activeChar,activeCharColor);
    });
    el.appendChild(s);
  });
}

function buildTerrain(masterSeed,res,hs){
  if(terrainMesh){scene.remove(terrainMesh);terrainMesh.geometry.dispose();terrainMesh.material.dispose();}
  if(waterMesh){scene.remove(waterMesh);waterMesh.geometry.dispose();waterMesh.material.dispose();}

  const size=150;
  const seed=terrainSeedFromMaster(masterSeed);
  const biome=biomeFromSeed(masterSeed);
  const {fbm}=makeNoise2D(seed);
  const rand=mulberry32(seed+97);
  const HALF=size*0.5;

  const heights=TERRAIN_GENERATORS[activeTerrain]({
    fbm,size,hs,biome,res,rand,HALF
  });

  const tStyle=document.getElementById('t-terrain').value;
  const tDensity=parseFloat(document.getElementById('t-density').value)||1;
  const tIntensity=parseFloat(document.getElementById('t-intensity').value)||1;
  applyTerrainStyle(heights,tStyle,tDensity,tIntensity,rand,size,res,biome,hs);

  const geo=new THREE.PlaneGeometry(size,size,res,res);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count && i<heights.length;i++){
    pos.setY(i,heights[i]);
  }
  geo.computeVertexNormals();
  const colors=new Float32Array(pos.count*3);
  const normal=geo.attributes.normal;
  const BANDS={
    forest:[[-1,[.55,.5,.35]],[-.05,[.30,.45,.20]],[.45,[.35,.33,.28]],[.75,[.92,.92,.95]]],
    tundra:[[-1,[.6,.68,.75]],[-.05,[.55,.6,.65]],[.45,[.75,.78,.8]],[.75,[.95,.97,.98]]],
    volcano:[[-1,[.2,.15,.1]],[0,[.4,.2,.1]],[.5,[.7,.25,.05]],[.8,[.95,.45,.1]]],
    ruins:[[-1,[.4,.38,.32]],[0,[.55,.52,.45]],[.45,[.65,.6,.5]],[.8,[.75,.7,.6]]],
    underdark:[[-1,[.1,.1,.12]],[0,[.2,.2,.24]],[.45,[.3,.28,.34]],[.8,[.4,.35,.45]]],
  }[biome.id];
  const NORM=(t)=>{for(let i=BANDS.length-1;i>=0;i--){
    const cur=BANDS[i],nxt=BANDS[i+1];
    if(t>=cur[0]){if(!nxt)return cur[1];const f=Math.min(1,Math.max(0,(t-cur[0])/(nxt[0]-cur[0])));
      return[cur[1][0]+(nxt[1][0]-cur[1][0])*f,cur[1][1]+(nxt[1][1]-cur[1][1])*f,cur[1][2]+(nxt[1][2]-cur[1][2])*f];}}return BANDS[0][1];};
  for(let i=0;i<pos.count;i++){
    const slope=1-Math.abs(normal.getY(i));
    let base=NORM((heights[i]||0)/hs);
    // 沙漠风格：沙色覆盖
    if(tStyle==='desert'){
      const h=(heights[i]||0)/hs;
      const sand=[.78+.05*h,.65+.05*h,.42+.03*h];
      base=sand;
    }else if(tStyle==='ice'){
      const h=(heights[i]||0)/hs;
      if(h>0.5){const ice=[.8+.1*h,.85+.05*h,.9+.05*h];base=ice;}
    }else if(tStyle==='volcanic'){
      const h=(heights[i]||0)/hs;
      if(h>0.7){const lava=[.9+.1*h,.3+.05*h,.05];base=lava;}
    }
    const rockMix=Math.min(1,Math.max(0,(slope-0.35)/0.4));
    colors[i*3]   =base[0]+(.32-base[0])*rockMix;
    colors[i*3+1] =base[1]+(.30-base[1])*rockMix;
    colors[i*3+2] =base[2]+(.27-base[2])*rockMix;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,metalness:0.02});
  terrainMesh=new THREE.Mesh(geo,mat);terrainMesh.receiveShadow=true;scene.add(terrainMesh);

  // 沙漠无水面，溪流水面降低
  let waterY=-8;
  if(tStyle==='desert'){waterY=-100;}
  else if(tStyle==='river'){waterY=-5;}
  else if(tStyle==='ice'){waterY=-100;}
  const wg=new THREE.PlaneGeometry(size*1.5,size*1.5);wg.rotateX(-Math.PI/2);
  const waterColor=(tStyle==='volcanic')?0x331a0a:0x1c5b7a;
  waterMesh=new THREE.Mesh(wg,new THREE.MeshStandardMaterial({color:waterColor,transparent:true,opacity:0.72}));
  waterMesh.position.y=waterY;scene.add(waterMesh);

  buildDecor(tStyle,tDensity,tIntensity,rand,size,res,biome,heights);
  terrainHeights = heights;

  const fogBase=BANDS[Math.floor(BANDS.length/2)][1];
  const fc=new THREE.Color(fogBase[0]*0.2+0.05,fogBase[1]*0.2+0.05,fogBase[2]*0.2+0.08);
  scene.fog.color.copy(fc);scene.background.copy(fc);
}

// ---------- LOD 系统 ----------
const LOD = {
  FAR:   { dist: 80, detail: 1, label: 'LOD0 · 80面' },
  MID:   { dist: 45, detail: 2, label: 'LOD1 · 320面' },
  CLOSE: { dist: 20, detail: 3, label: 'LOD2 · 1,280面' },
};
let currentLOD=null, lastLODLevel=null;

function calcLOD(dist){
  if(dist>=LOD.FAR.dist)return LOD.FAR;
  if(dist>=LOD.MID.dist)return LOD.MID;
  return LOD.CLOSE;
}

function applyNoiseDisplacement(geo, intensity, seed){
  const rand=mulberry32(seed);
  const pos=geo.attributes.position;
  geo.computeVertexNormals();
  const norm=geo.attributes.normal;
  for(let i=0;i<pos.count;i++){
    const nx=norm.getX(i),ny=norm.getY(i),nz=norm.getZ(i);
    // 高频微扰：多层正弦叠加
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const n1=Math.sin(x*3+rand()*6.28)*Math.cos(y*2+rand()*6.28);
    const n2=Math.sin(z*4+rand()*6.28)*Math.cos(x*3+rand()*6.28);
    const n3=Math.sin((x+y+z)*5+rand()*6.28);
    const disp=(n1*0.4+n2*0.3+n3*0.3)*intensity;
    pos.setXYZ(i,
      x+nx*disp,
      y+ny*disp,
      z+nz*disp
    );
  }
  geo.computeVertexNormals();
}

function countVerts(obj){
  if(!obj)return 0;
  let total=0;
  obj.traverse(child=>{
    if(child.isMesh && child.geometry){
      const pos=child.geometry.attributes.position;
      total+=pos?pos.count:0;
    }
  });
  return total;
}

// ---------- 人物模型生成（LOD + 组件树） ----------
const CHARS={
  none(){return null;},

  // ==== Warrior ====
  warrior:{
    lod0(seed){
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x8b4513,roughness:0.8,flatShading:true});
      const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),mat);
      m.scale.set(1,1.6,0.8);m.position.y=2.2;
      g.add(m);g.userData.meshes=[m];
      return g;
    },
    lod1(seed){
      const g=new THREE.Group();
      const detail=2;
      const bodyM=new THREE.MeshStandardMaterial({color:0x8b4513,roughness:0.7});
      const metalM=new THREE.MeshStandardMaterial({color:0xb87333,roughness:0.4,metalness:0.6});
      const skinM=new THREE.MeshStandardMaterial({color:0xddaa77,roughness:0.8});

      // 身体组件
      const torso=new THREE.Group();
      const torsoGeo=new THREE.IcosahedronGeometry(0.9,detail);
      const torsoMesh=new THREE.Mesh(torsoGeo,bodyM);torsoMesh.position.y=2.1;torsoMesh.scale.set(1.0,1.4,0.7);
      torso.add(torsoMesh);
      const chestGeo=new THREE.IcosahedronGeometry(0.85,detail);
      const chestMesh=new THREE.Mesh(chestGeo,metalM);chestMesh.position.y=2.3;chestMesh.scale.set(1.0,0.7,0.7);
      torso.add(chestMesh);
      torso.position.y=0;
      g.add(torso);

      // 头部组件
      const head=new THREE.Group();
      const headGeo=new THREE.IcosahedronGeometry(0.5,detail);
      const headMesh=new THREE.Mesh(headGeo,skinM);headMesh.position.y=3.4;
      head.add(headMesh);
      const helmGeo=new THREE.IcosahedronGeometry(0.55,detail);
      const helmMesh=new THREE.Mesh(helmGeo,metalM);helmMesh.position.y=3.5;helmMesh.scale.set(1,0.7,1);
      head.add(helmMesh);
      g.add(head);

      // 手臂组件
      const armL=new THREE.Group();
      const armGeo=new THREE.IcosahedronGeometry(0.3,detail);
      const armLMesh=new THREE.Mesh(armGeo,bodyM);armLMesh.position.set(-1.0,2.2,0);armLMesh.scale.set(0.6,1.4,0.6);
      armL.add(armLMesh);g.add(armL);

      const armR=new THREE.Group();
      const armRMesh=new THREE.Mesh(armGeo.clone(),bodyM);armRMesh.position.set(1.0,2.2,0.4);armRMesh.scale.set(0.6,1.4,0.6);
      armRMesh.rotation.z=-0.3;
      armR.add(armRMesh);g.add(armR);

      // 剑
      const bladeGeo=new THREE.IcosahedronGeometry(0.08,detail);
      const blade=new THREE.Mesh(bladeGeo,new THREE.MeshStandardMaterial({color:0xcccccc,metalness:0.9,roughness:0.2}));
      blade.position.set(1.4,3.2,0.7);blade.scale.set(1,3.5,1);g.add(blade);

      // 腿组件
      const legGeo=new THREE.IcosahedronGeometry(0.3,detail);
      const legL=new THREE.Mesh(legGeo,bodyM);legL.position.set(-0.4,0.6,0);legL.scale.set(0.8,1.6,0.8);g.add(legL);
      const legR=new THREE.Mesh(legGeo.clone(),bodyM);legR.position.set(0.4,0.6,0);legR.scale.set(0.8,1.6,0.8);g.add(legR);

      g.userData.meshes=[torsoMesh,chestMesh,headMesh,helmMesh,armLMesh,armRMesh,blade,legL,legR];
      return g;
    },
    lod2(seed,colorIdx){
      const g=this.lod1(seed);
      const detail=3;
      const pal=CHAR_PALETTES.warrior;
      const targetColor=new THREE.Color(pal[colorIdx]||pal[0]);
      // 对 LOD1 的所有 mesh 做细分替换 + 位移
      g.userData.meshes.forEach(m=>{
        if(m.geometry.type==='IcosahedronGeometry'){
          const newGeo=new THREE.IcosahedronGeometry(m.geometry.parameters.radius,detail);
          applyNoiseDisplacement(newGeo,0.04,seed+1);
          m.geometry.dispose();
          m.geometry=newGeo;
          m.material=cloneMat(m.material,targetColor,0.5);
        }
      });
      return g;
    },
  },

  // ==== Beast ====
  beast:{
    lod0(seed){
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x4a3728,roughness:0.95,flatShading:true});
      const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),mat);
      m.scale.set(1.5,1,1);m.position.y=1.5;
      g.add(m);g.userData.meshes=[m];
      return g;
    },
    lod1(seed){
      const g=new THREE.Group();
      const detail=2;
      const furM=new THREE.MeshStandardMaterial({color:0x4a3728,roughness:0.95});
      const darkM=new THREE.MeshStandardMaterial({color:0x2a1a0f,roughness:0.9});
      const whiteM=new THREE.MeshStandardMaterial({color:0xeeeecc,roughness:0.8});

      const body=new THREE.Mesh(new THREE.IcosahedronGeometry(1.0,detail),furM);
      body.scale.set(1.5,0.8,0.8);body.position.y=1.4;g.add(body);

      const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.6,detail),furM);
      head.position.set(1.4,1.8,0);head.scale.set(1.2,1,1);g.add(head);

      const snout=new THREE.Mesh(new THREE.IcosahedronGeometry(0.3,detail),darkM);
      snout.position.set(1.9,1.6,0);snout.scale.set(1.2,0.7,0.8);g.add(snout);

      const eyeL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.06,detail),whiteM);eyeL.position.set(1.6,2.0,0.25);g.add(eyeL);
      const eyeR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.06,detail),whiteM);eyeR.position.set(1.6,2.0,-0.25);g.add(eyeR);

      const earL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12,detail),darkM);earL.position.set(1.3,2.3,0.25);g.add(earL);
      const earR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12,detail),darkM);earR.position.set(1.3,2.3,-0.25);g.add(earR);

      const legGeo=new THREE.IcosahedronGeometry(0.2,detail);
      [[0.6,0.3,0.4],[0.6,0.3,-0.4],[-0.7,0.3,0.4],[-0.7,0.3,-0.4]].forEach(p=>{
        const l=new THREE.Mesh(legGeo,furM);l.position.set(...p);l.scale.set(0.6,1,0.6);g.add(l);});

      const tail=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12,detail),darkM);
      tail.position.set(-1.4,1.5,0);tail.scale.set(1.5,0.5,0.5);tail.rotation.z=0.5;g.add(tail);

      g.userData.meshes=[body,head,snout,eyeL,eyeR,earL,earR,tail];
      return g;
    },
    lod2(seed,colorIdx){
      const g=this.lod1(seed);
      const pal=CHAR_PALETTES.beast;
      const targetColor=new THREE.Color(pal[colorIdx]||pal[0]);
      g.userData.meshes.forEach(m=>{
        if(m.geometry.type==='IcosahedronGeometry'){
          const newGeo=new THREE.IcosahedronGeometry(m.geometry.parameters.radius,3);
          applyNoiseDisplacement(newGeo,0.05,seed+2);
          m.geometry.dispose();m.geometry=newGeo;
          m.material=cloneMat(m.material,targetColor,0.5);
        }
      });
      return g;
    },
  },

  // ==== Robot ====
  robot:{
    lod0(seed){
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x666677,roughness:0.5,metalness:0.8,flatShading:true});
      const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),mat);
      m.scale.set(1,1.6,0.8);m.position.y=2.2;
      g.add(m);g.userData.meshes=[m];
      return g;
    },
    lod1(seed){
      const g=new THREE.Group();
      const detail=2;
      const grayM=new THREE.MeshStandardMaterial({color:0x666677,roughness:0.5,metalness:0.8});
      const darkM=new THREE.MeshStandardMaterial({color:0x333344,roughness:0.6,metalness:0.7});
      const glowM=new THREE.MeshStandardMaterial({color:0x00ff88,emissive:0x00ff44,emissiveIntensity:1.5,roughness:0.3});

      const torso=new THREE.Mesh(new THREE.IcosahedronGeometry(0.8,detail),grayM);
      torso.scale.set(1.0,1.2,0.7);torso.position.y=2.0;g.add(torso);

      const chestP=new THREE.Mesh(new THREE.IcosahedronGeometry(0.4,detail),glowM);
      chestP.position.set(0,2.2,0.45);g.add(chestP);

      const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.5,detail),darkM);
      head.position.y=3.2;g.add(head);

      const eyeL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.1,detail),glowM);eyeL.position.set(-0.2,3.3,0.45);g.add(eyeL);
      const eyeR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.1,detail),glowM);eyeR.position.set(0.2,3.3,0.45);g.add(eyeR);

      const ant=new THREE.Mesh(new THREE.IcosahedronGeometry(0.06,detail),grayM);
      ant.scale.set(0.3,3,0.3);ant.position.set(0,4.0,0);g.add(ant);

      const armL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.25,detail),grayM);
      armL.position.set(-1.0,2.1,0);armL.scale.set(0.5,1.3,0.5);g.add(armL);
      const armR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.25,detail),grayM);
      armR.position.set(1.0,2.1,0);armR.scale.set(0.5,1.3,0.5);g.add(armR);

      const legL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.25,detail),grayM);
      legL.position.set(-0.4,0.55,0);legL.scale.set(0.7,1.4,0.7);g.add(legL);
      const legR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.25,detail),grayM);
      legR.position.set(0.4,0.55,0);legR.scale.set(0.7,1.4,0.7);g.add(legR);

      g.userData.meshes=[torso,chestP,head,eyeL,eyeR,ant,armL,armR,legL,legR];
      return g;
    },
    lod2(seed,colorIdx){
      const g=this.lod1(seed);
      const pal=CHAR_PALETTES.robot;
      const targetColor=new THREE.Color(pal[colorIdx]||pal[0]);
      g.userData.meshes.forEach(m=>{
        if(m.geometry.type==='IcosahedronGeometry'){
          const newGeo=new THREE.IcosahedronGeometry(m.geometry.parameters.radius,3);
          applyNoiseDisplacement(newGeo,0.03,seed+3);
          m.geometry.dispose();m.geometry=newGeo;
          if(m.material.color&&m.material.color.r<0.1&&m.material.color.g>0.5)return; // 跳过发光件
          m.material=cloneMat(m.material,targetColor,0.5);
        }
      });
      return g;
    },
  },

  // ==== Elf ====
  elf:{
    lod0(seed){
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x2d5a27,roughness:0.9,flatShading:true});
      const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1.4,1),mat);
      m.scale.set(0.8,1.8,0.6);m.position.y=2.1;
      g.add(m);g.userData.meshes=[m];
      return g;
    },
    lod1(seed){
      const g=new THREE.Group();
      const detail=2;
      const skinM=new THREE.MeshStandardMaterial({color:0xe8c9a0,roughness:0.85});
      const clothM=new THREE.MeshStandardMaterial({color:0x2d5a27,roughness:0.9});
      const goldM=new THREE.MeshStandardMaterial({color:0xcc9944,roughness:0.4,metalness:0.7});

      const torso=new THREE.Mesh(new THREE.IcosahedronGeometry(0.45,detail),clothM);
      torso.scale.set(0.8,1.4,0.6);torso.position.y=2.1;g.add(torso);

      const belt=new THREE.Mesh(new THREE.IcosahedronGeometry(0.4,detail),goldM);
      belt.scale.set(1,0.2,1);belt.position.y=2.4;g.add(belt);

      const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.4,detail),skinM);
      head.position.y=3.3;g.add(head);

      const earL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.08,detail),skinM);
      earL.position.set(-0.45,3.35,0);earL.scale.set(0.5,1.5,0.5);g.add(earL);
      const earR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.08,detail),skinM);
      earR.position.set(0.45,3.35,0);earR.scale.set(0.5,1.5,0.5);g.add(earR);

      const hair=new THREE.Mesh(new THREE.IcosahedronGeometry(0.35,detail),new THREE.MeshStandardMaterial({color:0x1a1a2a,roughness:0.9}));
      hair.scale.set(1,1.2,1);hair.position.y=3.6;g.add(hair);

      const armL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.15,detail),skinM);
      armL.position.set(-0.65,2.1,0);armL.scale.set(0.5,1.2,0.5);armL.rotation.z=0.15;g.add(armL);
      const armR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.15,detail),skinM);
      armR.position.set(0.65,2.1,0);armR.scale.set(0.5,1.2,0.5);armR.rotation.z=-0.15;g.add(armR);

      const legL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.2,detail),clothM);
      legL.position.set(-0.3,0.55,0);legL.scale.set(0.5,1.6,0.5);g.add(legL);
      const legR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.2,detail),clothM);
      legR.position.set(0.3,0.55,0);legR.scale.set(0.5,1.6,0.5);g.add(legR);

      g.userData.meshes=[torso,belt,head,earL,earR,hair,armL,armR,legL,legR];
      return g;
    },
    lod2(seed,colorIdx){
      const g=this.lod1(seed);
      const pal=CHAR_PALETTES.elf;
      const targetColor=new THREE.Color(pal[colorIdx]||pal[0]);
      g.userData.meshes.forEach(m=>{
        if(m.geometry.type==='IcosahedronGeometry'){
          const newGeo=new THREE.IcosahedronGeometry(m.geometry.parameters.radius,3);
          applyNoiseDisplacement(newGeo,0.04,seed+4);
          m.geometry.dispose();m.geometry=newGeo;
          m.material=cloneMat(m.material,targetColor,0.5);
        }
      });
      return g;
    },
  },

  // ==== Golem ====
  golem:{
    lod0(seed){
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x555555,roughness:0.95,flatShading:true});
      const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1.8,1),mat);
      m.scale.set(1.2,1.8,1);m.position.y=2.5;
      g.add(m);g.userData.meshes=[m];
      return g;
    },
    lod1(seed){
      const g=new THREE.Group();
      const detail=2;
      const rockM=new THREE.MeshStandardMaterial({color:0x555555,roughness:0.95});
      const darkM=new THREE.MeshStandardMaterial({color:0x333333,roughness:1.0});
      const runeM=new THREE.MeshStandardMaterial({color:0xff6600,emissive:0xff4400,emissiveIntensity:1.2,roughness:0.6});

      const torso=new THREE.Mesh(new THREE.IcosahedronGeometry(1.2,detail),rockM);
      torso.scale.set(1.1,1.1,0.8);torso.position.y=2.8;g.add(torso);

      const crack=new THREE.Mesh(new THREE.IcosahedronGeometry(0.05,detail),runeM);
      crack.scale.set(0.3,4,0.3);crack.position.set(0,2.8,0.85);g.add(crack);

      const head=new THREE.Mesh(new THREE.IcosahedronGeometry(0.7,detail),rockM);
      head.position.y=4.5;g.add(head);

      const eyeL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12,detail),runeM);eyeL.position.set(-0.25,4.6,0.6);g.add(eyeL);
      const eyeR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12,detail),runeM);eyeR.position.set(0.25,4.6,0.6);g.add(eyeR);

      const armL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.45,detail),rockM);
      armL.position.set(-1.6,2.8,0);armL.scale.set(0.8,1.8,0.8);g.add(armL);
      const armR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.45,detail),rockM);
      armR.position.set(1.6,2.8,0);armR.scale.set(0.8,1.8,0.8);g.add(armR);

      const fistL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.4,detail),darkM);fistL.position.set(-1.6,1.5,0);g.add(fistL);
      const fistR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.4,detail),darkM);fistR.position.set(1.6,1.5,0);g.add(fistR);

      const legL=new THREE.Mesh(new THREE.IcosahedronGeometry(0.45,detail),rockM);
      legL.position.set(-0.6,0.7,0);legL.scale.set(0.9,1.6,0.9);g.add(legL);
      const legR=new THREE.Mesh(new THREE.IcosahedronGeometry(0.45,detail),rockM);
      legR.position.set(0.6,0.7,0);legR.scale.set(0.9,1.6,0.9);g.add(legR);

      g.userData.meshes=[torso,crack,head,eyeL,eyeR,armL,armR,fistL,fistR,legL,legR];
      return g;
    },
    lod2(seed,colorIdx){
      const g=this.lod1(seed);
      const pal=CHAR_PALETTES.golem;
      const targetColor=new THREE.Color(pal[colorIdx]||pal[0]);
      g.userData.meshes.forEach(m=>{
        if(m.geometry.type==='IcosahedronGeometry'){
          const newGeo=new THREE.IcosahedronGeometry(m.geometry.parameters.radius,3);
          applyNoiseDisplacement(newGeo,0.06,seed+5);
          m.geometry.dispose();m.geometry=newGeo;
          if(m.material.emissive&&m.material.emissiveIntensity>0.5)return;
          m.material=cloneMat(m.material,targetColor,0.5);
        }
      });
      return g;
    },
  },
};

function cloneMat(mat,targetColor,t){
  const src=mat.color;
  const r=src.r*(1-t)+targetColor.r*t;
  const g=src.g*(1-t)+targetColor.g*t;
  const b=src.b*(1-t)+targetColor.b*t;
  const m=mat.clone();
  m.color.setRGB(r,g,b);
  return m;
}

// ---------- 人物色泽调色板 ----------

// ---------- 生成角色（LOD感知） ----------
function spawnCharacter(charType, colorIdx) {
  _lastLODLevel = -1;
  const cIdx = colorIdx !== undefined ? colorIdx : activeCharColor;
  if (charGroup) { while (charGroup.children.length) charGroup.remove(charGroup.children[0]); scene.remove(charGroup); charGroup = null; }
  if (charType === 'none') { renderCharSwatches('none'); setSelected(null, '—'); updateLODInfo(null, 0, 0, 0); return; }
  const ms = parseInt(document.getElementById('seed-input').value, 10) || 0;
  const seed = splitSeed(ms, 7);

  // COMPLEX 物体路径（家具/植物）
  if (COMPLEX[charType]) {
    charGroup = COMPLEX[charType](seed, { subdivide: 1 });
    if (charGroup) {
      charGroup.position.set(0, 0, 0);
      charGroup.userData.type = charType;
      scene.add(charGroup);
      tagInteractive(charGroup);
      setSelected(charGroup, charType);
      updateLODInfo(charType, 0, 'OBJ', countVerts(charGroup));
      renderCharSwatches('none');
    }
    return;
  }

  // 标准人物路径
  charGroup = CHARS[charType] ? CHARS[charType].lod0(seed) : null;
  if (!charGroup) { renderCharSwatches('none'); setSelected(null, '—'); updateLODInfo(null, 0, 0, 0); return; }
  applyCharLOD(charType, seed, cIdx, 0);
  const build = parseFloat(document.getElementById('c-build').value) || 1;
  const face = parseFloat(document.getElementById('c-face').value) || 1;
  const leg = parseFloat(document.getElementById('c-leg').value) || 1;
  charGroup.scale.setScalar(1.5 * build);
  charGroup.userData.meshes && charGroup.userData.meshes.forEach(m => {
    if (m.position.y > 3.0 && m.position.y < 4.0) m.scale.setScalar(face);
    if (m.position.y < 1.0) m.scale.y = leg;
  });
  charGroup.position.set(0, 0, 0);
  charGroup.userData.type = charType;
  charGroup.userData.colorIdx = cIdx;
  charGroup.userData.buildScale = 1.5 * build;
  charGroup.userData.faceScale = face;
  charGroup.userData.legScale = leg;
  scene.add(charGroup);
  renderCharSwatches(charType);
  tagInteractive(charGroup);
  setSelected(charGroup, charType);
  const dist = camera.position.distanceTo(charGroup.position);
  const lod = calcLOD(dist);
  updateLODInfo(charType, dist, lod.label, countVerts(charGroup));
}

function applyCharLOD(charType, seed, colorIdx, lodLevel) {
  if (!charGroup || !CHARS[charType]) return;
  const builder = CHARS[charType];
  const fn = builder['lod' + lodLevel] || builder.lod0;
  const newGroup = fn.call(builder, seed, colorIdx);
  if (!newGroup) return;
  // 迁移变换
  const oldPos = charGroup.position.clone();
  const oldRot = charGroup.rotation.clone();
  const oldScale = charGroup.scale.clone();
  const oldBuild = charGroup.userData.buildScale || 1.5;
  const oldFace = charGroup.userData.faceScale || 1;
  const oldLeg = charGroup.userData.legScale || 1;
  // 替换组
  while (charGroup.children.length) charGroup.remove(charGroup.children[0]);
  scene.remove(charGroup);
  charGroup = newGroup;
  charGroup.position.copy(oldPos);
  charGroup.rotation.copy(oldRot);
  charGroup.userData.type = charType;
  charGroup.userData.colorIdx = colorIdx;
  charGroup.userData.buildScale = oldBuild;
  charGroup.userData.faceScale = oldFace;
  charGroup.userData.legScale = oldLeg;
  // 恢复 build/face/leg 缩放
  charGroup.scale.setScalar(oldBuild);
  charGroup.userData.meshes && charGroup.userData.meshes.forEach(m => {
    if (m.position.y > 3.0 && m.position.y < 4.0) m.scale.setScalar(oldFace);
    if (m.position.y < 1.0) m.scale.y = oldLeg;
  });
  scene.add(charGroup);
}

// ---------- LOD 信息更新 + 动态切换 ----------
let _lastLODLevel = -1;
function updateLODInfo(charType, dist, label, verts) {
  document.getElementById('lod-char').textContent = charType ? charType.charAt(0).toUpperCase() + charType.slice(1) : '—';
  document.getElementById('lod-dist').textContent = dist.toFixed(1) + 'm';
  document.getElementById('lod-level').textContent = label || '—';
  document.getElementById('lod-faces').textContent = verts.toLocaleString() + ' verts';
}

// 在动画循环中自动切换 LOD
function checkAndSwitchLOD() {
  if (!charGroup || !charGroup.userData.type) return;
  // COMPLEX 物体不需要 LOD 切换
  if (COMPLEX[charGroup.userData.type]) {
    const dist = camera.position.distanceTo(charGroup.position);
    updateLODInfo(charGroup.userData.type, dist, 'OBJ', countVerts(charGroup));
    return;
  }
  const dist = camera.position.distanceTo(charGroup.position);
  const lod = calcLOD(dist);
  const lvl = lod === LOD.FAR ? 0 : lod === LOD.MID ? 1 : 2;
  if (lvl !== _lastLODLevel) {
    const seed = splitSeed(parseInt(document.getElementById('seed-input').value, 10) || 0, 7);
    const cIdx = charGroup.userData.colorIdx || 0;
    applyCharLOD(charGroup.userData.type, seed, cIdx, lvl);
    _lastLODLevel = lvl;
  }
  updateLODInfo(charGroup.userData.type, dist, lod.label, countVerts(charGroup));
}


// ---------- UI ----------
const seedInput=document.getElementById('seed-input');
const seedVal=document.getElementById('seed-val');
const resInput=document.getElementById('res-input');
const hsInput=document.getElementById('hs-input');
const camRot=document.getElementById('cam-rot');
camRot.addEventListener('input',()=>{cam.theta=parseInt(camRot.value)/100;updateCam();});
seedInput.addEventListener('input',()=>seedVal.textContent=seedInput.value);

function refresh(){
  const ms=parseInt(seedInput.value,10)||0;
  const res=parseInt(resInput.value,10)||64;
  const hs=parseInt(hsInput.value,10)||18;
  seedVal.textContent=ms;

  const biome=biomeFromSeed(ms);
  document.getElementById('bp-id').textContent=biome.id;
  document.getElementById('bp-name').textContent=biome.name;
  document.getElementById('bp-tok').textContent=biome.tokens;
  document.getElementById('sp-ter').textContent=terrainSeedFromMaster(ms);
  document.getElementById('sp-desc').textContent=descSeedFromMaster(ms);
  document.getElementById('sp-sca').textContent=scatterSeedFromMaster(ms);

  // 文法输出（确定性）
  const rand=mulberry32(descSeedFromMaster(ms));
  const gram=generateDesc({biomeId:biome.id,rand});
  document.getElementById('gram-out').textContent=gram;

  // LSTM 输出（fallback，因为浏览器端无模型）
  // 模拟 LSTM：在文法基础上按 biome 词根追加一段
  const lstmRand=mulberry32(splitSeed(ms,4));
  const tokens=biome.tokens.split('·');
  const pool=GLOSSARY[biome.id];
  let lstm='';
  for(let i=0;i<6;i++){
    lstm+=tokens[Math.floor(lstmRand()*tokens.length)];
    lstm+=pool.adjectives[Math.floor(lstmRand()*pool.adjectives.length)];
  }
  document.getElementById('lstm-out').textContent=lstm+'  （fallback，加载 models/desc-gen/ 后启用真实 LSTM）';

  buildTerrain(ms,res,hs);
}

document.getElementById('btn-regen').addEventListener('click',refresh);
seedInput.addEventListener('keydown',e=>{if(e.key==='Enter')refresh();});

// 地形切换
document.querySelectorAll('#terrain-switch .sw').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#terrain-switch .sw').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');activeTerrain=el.dataset.t;refresh();
  });
});

// 人物切换
document.querySelectorAll('#char-list .ch').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#char-list .ch').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');activeChar=el.dataset.char;activeCharColor=0;spawnCharacter(activeChar,activeCharColor);
  });
});

// 地形 style 切换
document.querySelectorAll('#t-terrain,#t-density,#t-intensity').forEach(el=>{
  el.addEventListener('change',()=>{refresh();});
});

// 人物 style 切换
document.querySelectorAll('#c-build,#c-face,#c-leg').forEach(el=>{
  el.addEventListener('change',()=>{spawnCharacter(activeChar);});
});

// ═══════════════════════════════════════════════════
// Phase 2 — Catmull-Clark 细分 + 复杂物体 + 交互变换
// ═══════════════════════════════════════════════════

// ---------- Catmull-Clark 曲面细分（简化 2-subd 实现） ----------
function catmullClarkSubdivide(geo, iterations){
  let g = geo.clone();
  for(let it = 0; it < iterations; it++){
    const pos = g.attributes.position;
    const idx = g.index;
    const norm = g.attributes.normal;
    if(!idx || pos.count < 3) break;
    // 简易 subdivision: 每面中心取平均，每条边中点取平均，然后插值
    const vertArr = new Float32Array(pos.array);
    const faceList = [];
    for(let i = 0; i < idx.count; i += 3){
      faceList.push([idx.getX(i), idx.getX(i+1), idx.getX(i+2)]);
    }
    // 每面新顶点 = 3个边中点 + 面中心
    const newVerts = [];
    const newIdx = [];
    const edgeCache = {};
    function getEdgeKey(a,b){ return a<b ? a+'-'+b : b+'-'+a; }
    let vOff = 0;
    for(let f = 0; f < faceList.length; f++){
      const [i0,i1,i2] = faceList[f];
      const v0 = [vertArr[i0*3], vertArr[i0*3+1], vertArr[i0*3+2]];
      const v1 = [vertArr[i1*3], vertArr[i1*3+1], vertArr[i1*3+2]];
      const v2 = [vertArr[i2*3], vertArr[i2*3+1], vertArr[i2*3+2]];
      // 边中点
      const edges = [[i0,i1],[i1,i2],[i0,i2]];
      const midPts = [];
      for(const [a,b] of edges){
        const k = getEdgeKey(a,b);
        if(!(k in edgeCache)){
          const va = [vertArr[a*3],vertArr[a*3+1],vertArr[a*3+2]];
          const vb = [vertArr[b*3],vertArr[b*3+1],vertArr[b*3+2]];
          const m = [(va[0]+vb[0])*0.5,(va[1]+vb[1])*0.5,(va[2]+vb[2])*0.5];
          edgeCache[k] = m;
          newVerts.push(m);
        }
        midPts.push(edgeCache[getEdgeKey(a,b)]);
      }
      // 面中心
      const faceC = [(v0[0]+v1[0]+v2[0])/3,(v0[1]+v1[1]+v2[1])/3,(v0[2]+v1[2]+v2[2])/3];
      newVerts.push(faceC);
      const base = vOff; vOff += 4;
      // 4 个小三角
      newIdx.push(base, base+1, base+3);
      newIdx.push(base+1, base+2, base+3);
      newIdx.push(base, base+3, base+2);
      newIdx.push(base+1, base+3, base+2);
    }
    const ng = new THREE.BufferGeometry();
    const nPos = new Float32Array(newVerts.length * 3);
    for(let i = 0; i < newVerts.length; i++){
      nPos[i*3] = newVerts[i][0]; nPos[i*3+1] = newVerts[i][1]; nPos[i*3+2] = newVerts[i][2];
    }
    ng.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
    ng.setIndex(newIdx);
    ng.computeVertexNormals();
    g = ng;
  }
  return g;
}

// ---------- 复杂物体生成器（含细分选项） ----------
const COMPLEX = {
  // 抽屉柜
  cabinet(seed, opts){
    const g = new THREE.Group();
    opts = opts || { subdivide: 1, color: 0x8b6f47 };
    const body = new THREE.MeshStandardMaterial({color: opts.color, roughness: 0.8, metalness: 0.1});
    const handle = new THREE.MeshStandardMaterial({color: 0xccaa55, roughness: 0.3, metalness: 0.8});
    const subGeo = catmullClarkSubdivide(new THREE.BoxGeometry(2.2, 3.0, 1.4), opts.subdivide);
    const base = new THREE.Mesh(subGeo, body); base.position.y = 1.5; g.add(base);
    // 3 个抽屉面板（细分）
    for(let d = 0; d < 3; d++){
      const drawGeo = catmullClarkSubdivide(new THREE.BoxGeometry(2.0, 0.75, 0.08), 1);
      const draw = new THREE.Mesh(drawGeo, body);
      draw.position.set(0, 0.8 + d*0.85, 0.73); g.add(draw);
      // 把手
      const hGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 12);
      const h = new THREE.Mesh(hGeo, handle); h.position.set(0, 0.8 + d*0.85, 0.80); h.rotation.x = Math.PI/2; g.add(h);
    }
    return g;
  },
  // 椅子
  chair(seed, opts){
    const g = new THREE.Group();
    opts = opts || { subdivide: 1, color: 0xa0522d };
    const mat = new THREE.MeshStandardMaterial({color: opts.color, roughness: 0.7});
    const legs = catmullClarkSubdivide(new THREE.CylinderGeometry(0.06, 0.05, 0.8, 8), 1);
    const positions = [[-0.7,-0.4,-0.7],[0.7,-0.4,-0.7],[-0.7,-0.4,0.7],[0.7,-0.4,0.7]];
    for(const [x,_,z] of positions){
      const leg = new THREE.Mesh(legs, mat); leg.position.set(x, 0.4, z); g.add(leg);
    }
    // 座面（细分）
    const seatGeo = catmullClarkSubdivide(new THREE.BoxGeometry(1.5, 0.1, 1.5), 1);
    const seat = new THREE.Mesh(seatGeo, mat); seat.position.y = 0.85; g.add(seat);
    // 靠背（细分）
    const backGeo = catmullClarkSubdivide(new THREE.BoxGeometry(1.5, 0.8, 0.08), 1);
    const back = new THREE.Mesh(backGeo, mat); back.position.set(0, 1.3, -0.7); g.add(back);
    return g;
  },
  // 树
  tree(seed, opts){
    const g = new THREE.Group();
    opts = opts || { subdivide: 1, foliage: 0x2d5a27, trunk: 0x6b4226 };
    const trunkMat = new THREE.MeshStandardMaterial({color: opts.trunk, roughness: 0.95});
    const leafMat = new THREE.MeshStandardMaterial({color: opts.foliage, roughness: 0.8});
    // 树干（细分）
    const trunkGeo = catmullClarkSubdivide(new THREE.CylinderGeometry(0.18, 0.28, 2.5, 8), 1);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.25; g.add(trunk);
    // 树枝（3 根）
    const rand = mulberry32(seed);
    for(let b = 0; b < 3; b++){
      const branchGeo = catmullClarkSubdivide(new THREE.CylinderGeometry(0.05, 0.12, 1.2, 6), 1);
      const branch = new THREE.Mesh(branchGeo, trunkMat);
      branch.position.set(0.3*Math.cos(b*2.1), 2.0, 0.3*Math.sin(b*2.1));
      branch.rotation.z = (rand()-0.5)*0.5;
      g.add(branch);
    }
    // 树冠（3 层 icosahedron 细分）
    for(let l = 0; l < 3; l++){
      const leafGeo = catmullClarkSubdivide(new THREE.IcosahedronGeometry(1.0 - l*0.15, 2), 1);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set((rand()-0.5)*0.4, 2.8 + l*0.6, (rand()-0.5)*0.4);
      leaf.scale.setScalar(1.2 - l*0.25);
      g.add(leaf);
    }
    return g;
  },
  // 蘑菇
  mushroom(seed, opts){
    const g = new THREE.Group();
    opts = opts || { subdivide: 1, cap: 0xcc3322, stem: 0xffeecc };
    const capMat = new THREE.MeshStandardMaterial({color: opts.cap, roughness: 0.6});
    const stemMat = new THREE.MeshStandardMaterial({color: opts.stem, roughness: 0.9});
    // 菌柄（细分）
    const stemGeo = catmullClarkSubdivide(new THREE.CylinderGeometry(0.2, 0.25, 1.5, 10), 1);
    const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = 0.75; g.add(stem);
    // 菌盖（细分）
    const capGeo = catmullClarkSubdivide(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI*2, 0, Math.PI/2), 1);
    const cap = new THREE.Mesh(capGeo, capMat); cap.position.y = 1.5; g.add(cap);
    // 菌盖斑点
    const rand = mulberry32(seed);
    for(let d = 0; d < 6; d++){
      const dotGeo = new THREE.SphereGeometry(0.08, 6, 6);
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.8}));
      const th = rand()*Math.PI*2;
      const ph = rand()*Math.PI/3;
      dot.position.set(Math.sin(ph)*0.62*Math.cos(th), 1.5+Math.cos(ph)*0.62, Math.sin(ph)*0.62*Math.sin(th));
      g.add(dot);
    }
    return g;
  },
  // 水晶簇
  crystal(seed, opts){
    const g = new THREE.Group();
    opts = opts || { subdivide: 1, color: 0x6644cc, emissive: 0x332288 };
    const rand = mulberry32(seed);
    const crystals = 5 + Math.floor(rand()*4);
    for(let c = 0; c < crystals; c++){
      const mat = new THREE.MeshStandardMaterial({
        color: opts.color,
        emissive: opts.emissive,
        emissiveIntensity: 0.3 + rand()*0.4,
        roughness: 0.15,
        metalness: 0.6,
        transparent: true,
        opacity: 0.85
      });
      const h = 1.0 + rand()*1.5;
      const crystalGeo = catmullClarkSubdivide(
        new THREE.ConeGeometry(0.2 + rand()*0.15, h, 6),
        opts.subdivide
      );
      const cry = new THREE.Mesh(crystalGeo, mat);
      cry.position.set((rand()-0.5)*1.2, h/2, (rand()-0.5)*1.2);
      cry.rotation.z = (rand()-0.5)*0.3;
      g.add(cry);
    }
    return g;
  },
};

// ---------- 实例化植被（InstancedMesh） ----------
function spawnInstancedVegetation(seed, count){
  if(vegetationIM){ scene.remove(vegetationIM); }
  const rand = mulberry32(seed);
  const size = 128;
  const geo = new THREE.ConeGeometry(0.2, 0.6, 6);
  const mat = new THREE.MeshStandardMaterial({color: 0x2d5a27, roughness: 0.8});
  vegetationIM = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const heightsMap = terrainHeights || new Array(count).fill(0);
  for(let i = 0; i < count; i++){
    const x = (rand()-0.5) * size;
    const z = (rand()-0.5) * size;
    const h = rand()*0.4 + 0.5;
    dummy.position.set(x, 0, z);
    dummy.scale.setScalar(h);
    dummy.rotation.y = rand()*Math.PI*2;
    dummy.updateMatrix();
    vegetationIM.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.17 + rand()*0.08, 0.35 + rand()*0.1, 0.15 + rand()*0.05);
    vegetationIM.setColorAt(i, color);
  }
  vegetationIM.instanceMatrix.needsUpdate = true;
  if(vegetationIM.instanceColor) vegetationIM.instanceColor.needsUpdate = true;
  scene.add(vegetationIM);
}

// ═══════════════════════════════════════════════════
// 交互变换系统 — 点击选中 + 移动/旋转/删除
// ═══════════════════════════════════════════════════
let xFormMode = 'select'; // select | move | rotate | delete
let selectedObj = null;
let selectedName = '';
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let mouseDown = false;
let mouseDownPos = new THREE.Vector2();
let mouseDragPos3D = new THREE.Vector3();
let transformDragging = false;
let selectRingEl = null;
let isDragging = false; // 拖拽 vs 点击 判定

// 给场景所有可交互物体打标签
function tagInteractive(obj){
  if(!obj) return;
  obj.traverse(child=>{
    if(child.isMesh && !child.userData._tagged){
      child.userData._tagged = true;
      child.userData._parentGroup = obj;
    }
  });
}

// 初始化选中高亮环 DOM
function initSelectRing(){
  selectRingEl = document.createElement('div');
  selectRingEl.className = 'select-ring';
  selectRingEl.style.width = '0px';
  selectRingEl.style.height = '0px';
  document.body.appendChild(selectRingEl);
}

// 更新选中高亮环位置
function updateSelectRing(obj){
  if(!obj || !selectRingEl) return;
  const pos = new THREE.Vector3();
  obj.getWorldPosition(pos);
  pos.project(camera);
  const canvas = document.getElementById('canvas');
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const sx = (pos.x*0.5+0.5)*rect.width + rect.left;
  const sy = (-pos.y*0.5+0.5)*rect.height + rect.top;
  selectRingEl.style.left = sx + 'px';
  selectRingEl.style.top = sy + 'px';
  selectRingEl.style.width = '24px';
  selectRingEl.style.height = '24px';
  selectRingEl.style.display = 'block';
}

function hideSelectRing(){
  if(selectRingEl) selectRingEl.style.display = 'none';
}

// 更新选中状态 + 面板
function setSelected(obj, name){
  selectedObj = obj;
  selectedName = name || '—';
  const selEl = document.getElementById('x-sel');
  const posEl = document.getElementById('x-pos');
  const eulEl = document.getElementById('x-eul');
  selEl.textContent = name || '—';
  if(obj){
    const p = obj.position;
    const e = obj.rotation;
    posEl.textContent = p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ', ' + p.z.toFixed(1);
    eulEl.textContent = e.x.toFixed(1) + ', ' + e.y.toFixed(1) + ', ' + e.z.toFixed(1);
    updateSelectRing(obj);
  } else {
    posEl.textContent = '0.0, 0.0, 0.0';
    eulEl.textContent = '0.0, 0.0, 0.0';
    hideSelectRing();
  }
}

// 点击检测 + 变换处理
function onCanvasClick(e){
  const canvas = document.getElementById('canvas');
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  // 遍历场景中所有 mesh
  const meshes = [];
  scene.traverse(child=>{
    if(child.isMesh && child.visible) meshes.push(child);
  });
  const intersects = raycaster.intersectObjects(meshes, false);
  let hit = null;
  for(const inter of intersects){
    // 找到最外层用户组
    let parent = inter.object;
    while(parent.parent && parent.parent !== scene){
      parent = parent.parent;
    }
    hit = parent;
    break;
  }
  if(hit && hit !== selectedObj){
    setSelected(hit, hit.userData.type || 'Object');
  } else if(!hit){
    setSelected(null, '—');
  }
}

function onCanvasMouseDown(e){
  if(e.button !== 0) return;
  mouseDown = true;
  mouseDownPos.set(e.clientX, e.clientY);
  isDragging = false;
  // 计算 3D 拖拽起点
  const canvas = document.getElementById('canvas');
  const rect = canvas.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
  if(selectedObj && (xFormMode === 'move' || xFormMode === 'rotate')){
    // 创建拖拽平面
    const planeNormal = camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane(planeNormal, 0);
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, pt);
    if(pt) mouseDragPos3D.copy(pt);
  }
}

function onCanvasMouseMove(e){
  if(!mouseDown) return;
  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  if(Math.abs(dx) + Math.abs(dy) > 4){
    isDragging = true;
  }
  if(isDragging && mouseDown && selectedObj && (xFormMode === 'move' || xFormMode === 'rotate')){
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
    const planeNormal = camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane(planeNormal, 0);
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, pt);
    if(pt){
      if(xFormMode === 'move'){
        const diff = new THREE.Vector3().subVectors(pt, mouseDragPos3D);
        selectedObj.position.add(diff);
        mouseDragPos3D.copy(pt);
        updateSelectRing(selectedObj);
        const p = selectedObj.position;
        document.getElementById('x-pos').textContent = p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ', ' + p.z.toFixed(1);
      } else if(xFormMode === 'rotate'){
        selectedObj.rotation.y -= dx * 0.01;
        mouseDownPos.set(e.clientX, e.clientY);
        const e2 = selectedObj.rotation;
        document.getElementById('x-eul').textContent = e2.x.toFixed(1) + ', ' + e2.y.toFixed(1) + ', ' + e2.z.toFixed(1);
      }
    }
  }
}

function onCanvasMouseUp(e){
  if(e.button !== 0) return;
  if(mouseDown && !isDragging){
    onCanvasClick(e);
  }
  mouseDown = false;
  isDragging = false;
}

// 变换模式切换
document.querySelectorAll('#xform-bar .xbtn').forEach(el=>{
  el.addEventListener('click',()=>{
    const mode = el.dataset.xm;
    if(mode === 'delete'){
      if(selectedObj){
        scene.remove(selectedObj);
        setSelected(null, '—');
      }
      return;
    }
    document.querySelectorAll('#xform-bar .xbtn').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');
    xFormMode = mode;
  });
});

// 初始化变换工具
function initTransformSystem(){
  initSelectRing();
  const canvas = document.getElementById('canvas');
  if(canvas){
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    canvas.style.pointerEvents = 'auto';
  }
}

// 注册可交互物体
function registerInteractive(name, obj){
  if(obj){
    obj.userData.type = name;
    tagInteractive(obj);
    if(!selectedObj){ setSelected(obj, name); }
  }
}

// ═══════════════════════════════════════════════════
// Phase 3 — .OBJ 导出 + LOD 手动切换 + NLP 自然语言控制
// ═══════════════════════════════════════════════════

// ---------- .OBJ 导出器 ----------
function exportOBJ(obj, lodLevel){
  // 重建目标 LOD 级别的几何体
  const name = obj.userData.type || 'object';
  const seed = splitSeed(parseInt(document.getElementById('seed-input').value, 10) || 0, 7);
  const cIdx = obj.userData.colorIdx || 0;
  let exportGroup;

  if(CHARS[name]){
    // 标准人物：获取指定 LOD 级别
    const fn = CHARS[name]['lod' + lodLevel] || CHARS[name].lod0;
    exportGroup = fn.call(CHARS[name], seed, cIdx);
  } else if(COMPLEX[name]){
    // COMPLEX 物体：直接复制当前
    exportGroup = obj.clone();
    // 应用当前细分级别
    if(exportGroup && lodLevel > 0){
      const subGeo = catmullClarkSubdivide(
        new THREE.BoxGeometry(1,1,1),
        lodLevel
      );
      exportGroup.traverse(child=>{
        if(child.isMesh && child.geometry){
          const baseGeo = child.geometry.parameters ? child.geometry : null;
          if(baseGeo && baseGeo.type === 'BoxGeometry'){
            child.geometry = catmullClarkSubdivide(
              new THREE.BoxGeometry(
                baseGeo.width || 1,
                baseGeo.height || 1,
                baseGeo.depth || 1
              ),
              lodLevel
            );
            child.geometry.computeVertexNormals();
          }
        }
      });
    }
  }

  if(!exportGroup) return null;

  // 遍历所有 mesh，输出 OBJ
  const groups = [exportGroup];
  const allParts = [];
  exportGroup.traverse(child=>{
    if(child.isMesh){
      const mat = child.material;
      const color = mat ? mat.color : null;
      const r = color ? color.r.toFixed(4) : '0.8';
      const g = color ? color.g.toFixed(4) : '0.8';
      const b = color ? color.b.toFixed(4) : '0.8';
      allParts.push({ mesh: child, r, g, b });
    }
  });

  let objStr = '# ' + name + ' — LOD' + lodLevel + ' export\n';
  objStr += '# Vertices: ' + countVerts(exportGroup) + '\n';
  objStr += '# Generated by threejs-tfjs-minimal-engine v0.1.2\n\n';

  let vertOff = 0;
  for(const part of allParts){
    const m = part.mesh;
    const worldMatrix = new THREE.Matrix4();
    m.updateWorldMatrix(true, false);
    worldMatrix.copy(m.matrixWorld);
    const pos = m.geometry.attributes.position;
    if(!pos) continue;
    objStr += 'g ' + name + '_part' + vertOff + '\n';
    objStr += 's off\n';
    objStr += 'mtllib ' + name + '.mtl\n';
    objStr += 'usemtl m' + vertOff + '\n\n';
    for(let i = 0; i < pos.count; i++){
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      v.applyMatrix4(worldMatrix);
      objStr += 'v ' + v.x.toFixed(6) + ' ' + v.y.toFixed(6) + ' ' + v.z.toFixed(6) + '\n';
    }
    const idx = m.geometry.index;
    if(idx){
      for(let i = 0; i < idx.count; i += 3){
        const a = idx.getX(i) + 1 + vertOff;
        const b = idx.getX(i+1) + 1 + vertOff;
        const c = idx.getX(i+2) + 1 + vertOff;
        objStr += 'f ' + a + ' ' + b + ' ' + c + '\n';
      }
    } else {
      for(let i = 0; i < pos.count; i += 3){
        if(i+2 >= pos.count) break;
        const a = i + 1 + vertOff;
        const b = i + 2 + vertOff;
        const c = i + 3 + vertOff;
        objStr += 'f ' + a + ' ' + b + ' ' + c + '\n';
      }
    }
    vertOff += pos.count;
  }

  return objStr;
}

function exportAsFile(content, filename){
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function doExport(format){
  if(!selectedObj){ nlpLog('未选中任何物体', 'err'); return; }
  const name = selectedObj.userData.type || 'object';
  const manualLod = activeLODLevel;
  const finalLod = manualLod !== 'auto' ? parseInt(manualLod) : 1;

  if(format === 'obj'){
    const objStr = exportOBJ(selectedObj, finalLod);
    if(objStr){
      exportAsFile(objStr, name + '_LOD' + finalLod + '.obj');
      nlpLog('导出 .OBJ: ' + name + '_LOD' + finalLod + '.obj (' + objStr.split('\n').length + ' 行)', 'ok');
    } else {
      nlpLog('导出失败', 'err');
    }
  } else if(format === 'json'){
    const data = {
      type: name,
      lod: finalLod,
      vertices: countVerts(selectedObj),
      position: { x: selectedObj.position.x, y: selectedObj.position.y, z: selectedObj.position.z },
      rotation: { x: selectedObj.rotation.x, y: selectedObj.rotation.y, z: selectedObj.rotation.z },
      scale: { x: selectedObj.scale.x, y: selectedObj.scale.y, z: selectedObj.scale.z }
    };
    exportAsFile(JSON.stringify(data, null, 2), name + '_LOD' + finalLod + '.json');
    nlpLog('导出 .JSON: ' + name + '_LOD' + finalLod + '.json', 'ok');
  } else if(format === 'text'){
    const objStr = exportOBJ(selectedObj, finalLod);
    const txt = '=== ' + name + ' LOD' + finalLod + ' ===\n面数: ' + countVerts(selectedObj) + '\n位置: ' + selectedObj.position + '\n旋转: ' + selectedObj.rotation.y + '\n\n' + (objStr || '(OBJ 生成失败)');
    exportAsFile(txt, name + '_LOD' + finalLod + '.txt');
    nlpLog('导出 .TXT: ' + name + '_LOD' + finalLod + '.txt', 'ok');
  }
  document.getElementById('exp-verts').textContent = countVerts(selectedObj);
}

// 导出按钮事件
document.querySelectorAll('#export-bar .ebtn').forEach(el=>{
  el.addEventListener('click',()=>{
    const fmt = el.id.replace('exp-','');
    doExport(fmt);
  });
});

// ---------- LOD 手动级别切换 ----------
let activeLODLevel = 'auto';
document.querySelectorAll('#lod-bar .lbtn').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#lod-bar .lbtn').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');
    activeLODLevel = el.dataset.lod;
    if(charGroup && activeLODLevel !== 'auto'){
      const lvl = parseInt(activeLODLevel);
      if(CHARS[charGroup.userData.type]){
        const seed = splitSeed(parseInt(document.getElementById('seed-input').value, 10) || 0, 7);
        const cIdx = charGroup.userData.colorIdx || 0;
        applyCharLOD(charGroup.userData.type, seed, cIdx, lvl);
        _lastLODLevel = lvl;
      }
      updateSubdStats();
    }
  });
});

// ---------- 细分对比统计 ----------
function updateSubdStats(){
  if(!charGroup || !CHARS[charGroup.userData.type]){
    document.getElementById('subd-l0').textContent = '—';
    document.getElementById('subd-l1').textContent = '—';
    document.getElementById('subd-l2').textContent = '—';
    return;
  }
  const name = charGroup.userData.type;
  const seed = splitSeed(parseInt(document.getElementById('seed-input').value, 10) || 0, 7);
  const builder = CHARS[name];
  const l0Fn = builder.lod0 || (()=>null);
  const l1Fn = builder.lod1 || (()=>null);
  const l2Fn = builder.lod2 || (()=>null);
  try {
    const l0 = l0Fn.call(builder, seed);
    const l1 = l1Fn.call(builder, seed);
    const l2 = l2Fn.call(builder, seed);
    document.getElementById('subd-l0').textContent = l0 ? countVerts(l0) : '0';
    document.getElementById('subd-l1').textContent = l1 ? countVerts(l1) : '0';
    document.getElementById('subd-l2').textContent = l2 ? countVerts(l2) : '0';
  } catch(e){
    document.getElementById('subd-l0').textContent = 'err';
  }
}

// ---------- NLP 自然语言解析器 ----------
const NLP_COLORS = {
  'red': 0xcc3322, '蓝': 0x3366cc, 'blue': 0x3366cc, '绿': 0x22cc44, 'green': 0x22cc44,
  '黄': 0xcccc22, 'yellow': 0xcccc22, '白': 0xffffff, 'white': 0xffffff, '黑': 0x222222, 'black': 0x222222,
  '紫': 0x9933cc, 'purple': 0x9933cc, '橙': 0xcc6633, 'orange': 0xcc6633,
  '棕色': 0x8b4513, 'brown': 0x8b4513, '棕色': 0x8b4513, '灰色': 0x888888, 'gray': 0x888888,
};

const NLP_DIR = {
  'forward': 'z', 'back': '-z', 'left': '-x', 'right': 'x',
  'up': 'y', 'down': '-y', '前': 'z', '后': '-z', '左': '-x', '右': 'x', '上': 'y', '下': '-y'
};

function nlpLog(msg, type){
  const el = document.getElementById('nlp-log');
  const cls = type === 'ok' ? 'ok' : type === 'err' ? 'err' : '';
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = '> ' + msg;
  el.appendChild(line);
  if(el.children.length > 20) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function parseNLPCommand(text){
  const t = text.trim().toLowerCase();
  const parts = t.split(/\s+/);
  if(!parts.length) return null;

  const cmd = parts[0];
  const args = parts.slice(1);

  // spawn <object> [color]
  if(cmd === 'spawn'){
    let objName = args[0] || '';
    const complexNames = ['cabinet','chair','tree','mushroom','crystal'];
    const charNames = ['warrior','beast','robot','elf','golem'];
    // 中文映射
    const cnMap = {
      '柜子':'cabinet','椅子':'chair','树':'tree','蘑菇':'mushroom','水晶':'crystal',
      '战士':'warrior','野兽':'beast','机器人':'robot','精灵':'elf','傀儡':'golem'
    };
    objName = cnMap[objName] || objName;
    let colorOpt = null;
    for(const arg of args.slice(1)){
      if(NLP_COLORS[arg]){ colorOpt = NLP_COLORS[arg]; break; }
    }
    return { cmd: 'spawn', obj: objName, color: colorOpt };
  }

  // move <dir> <distance>
  if(cmd === 'move'){
    const dir = args[0] || 'z';
    const dist = parseFloat(args[1]) || 1;
    return { cmd: 'move', dir: NLP_DIR[dir] || 'z', dist };
  }

  // rotate <angle>
  if(cmd === 'rotate'){
    const angle = parseFloat(args[0]) || 15;
    return { cmd: 'rotate', angle };
  }

  // color <colorname>
  if(cmd === 'color'){
    let colorName = args.join(' ');
    let colorHex = NLP_COLORS[colorName] || NLP_COLORS[args[0]] || null;
    return { cmd: 'color', hex: colorHex };
  }

  // delete
  if(cmd === 'delete' || cmd === 'del'){
    return { cmd: 'delete' };
  }

  // grid <count>
  if(cmd === 'grid'){
    const count = parseInt(args[0]) || 5;
    return { cmd: 'grid', count };
  }

  // explode <distance>
  if(cmd === 'explode'){
    const dist = parseFloat(args[0]) || 5;
    return { cmd: 'explode', dist };
  }

  // tf <prompt> — 用文法 + mulberry32 模拟 TF 文本理解
  if(cmd === 'tf'){
    const prompt = args.join(' ');
    return { cmd: 'tf', prompt };
  }

  return null;
}

function executeNLP(result){
  if(!result) return;

  switch(result.cmd){
    case 'spawn': {
      if(CHARS[result.obj] || COMPLEX[result.obj]){
        spawnCharacter(result.obj);
        if(result.color !== null){
          // 应用颜色到所有材质
          const targetColor = new THREE.Color(result.color);
          charGroup.traverse(child=>{
            if(child.isMesh && child.material && child.material.color){
              child.material.color.copy(targetColor);
            }
          });
        }
        nlpLog('已生成: ' + result.obj + (result.color !== null ? ' 颜色:' + result.color.toString(16).padStart(6,'0') : ''), 'ok');
      } else {
        nlpLog('未知物体: ' + result.obj, 'err');
      }
      break;
    }
    case 'move': {
      if(!selectedObj) { nlpLog('未选中物体', 'err'); return; }
      const axis = result.dir;
      const dist = result.dist;
      if(axis === 'z') selectedObj.position.z += dist;
      else if(axis === '-z') selectedObj.position.z -= dist;
      else if(axis === 'x') selectedObj.position.x += dist;
      else if(axis === '-x') selectedObj.position.x -= dist;
      else if(axis === 'y') selectedObj.position.y += dist;
      else if(axis === '-y') selectedObj.position.y -= dist;
      const p = selectedObj.position;
      nlpLog('移动 ' + selectedObj.userData.type + ' 至 (' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ',' + p.z.toFixed(1) + ')', 'ok');
      break;
    }
    case 'rotate': {
      if(!selectedObj) { nlpLog('未选中物体', 'err'); return; }
      selectedObj.rotation.y += result.angle * Math.PI / 180;
      nlpLog('旋转 ' + selectedObj.userData.type + ' ' + result.angle + '°', 'ok');
      break;
    }
    case 'color': {
      if(!selectedObj || result.hex === null) { nlpLog('无效颜色或未选中', 'err'); return; }
      const tc = new THREE.Color(result.hex);
      selectedObj.traverse(child=>{
        if(child.isMesh && child.material && child.material.color){
          child.material.color.copy(tc);
        }
      });
      nlpLog('设置颜色: #' + result.hex.toString(16).padStart(6,'0'), 'ok');
      break;
    }
    case 'delete': {
      if(selectedObj){
        const name = selectedObj.userData.type;
        scene.remove(selectedObj);
        setSelected(null, '—');
        nlpLog('已删除: ' + name, 'ok');
      } else {
        nlpLog('未选中物体', 'err');
      }
      break;
    }
    case 'grid': {
      // 生成 grid 数量的选中物体
      if(!selectedObj) { nlpLog('未选中物体', 'err'); return; }
      const count = result.count;
      const name = selectedObj.userData.type;
      const color = selectedObj.userData.colorIdx || 0;
      const seed = splitSeed(parseInt(document.getElementById('seed-input').value, 10) || 0, 7);
      const rows = Math.ceil(Math.sqrt(count));
      for(let r = 0; r < rows; r++){
        for(let c = 0; c < rows; c++){
          if((r*rows+c) >= count) break;
          const clone = (CHARS[name] ? CHARS[name].lod0(seed + r*rows+c) :
                         COMPLEX[name] ? COMPLEX[name](seed + r*rows+c, {subdivide:1}) : null);
          if(clone){
            clone.position.set((c - rows/2) * 4, 0, (r - rows/2) * 4);
            clone.userData.type = name;
            scene.add(clone);
            tagInteractive(clone);
          }
        }
      }
      nlpLog('已生成 ' + count + ' 个 ' + name + ' 网格', 'ok');
      break;
    }
    case 'explode': {
      if(!selectedObj) { nlpLog('未选中物体', 'err'); return; }
      const dist = result.dist;
      const children = [...selectedObj.children];
      if(children.length < 2) { nlpLog('子对象不足，无法爆炸', 'err'); return; }
      const center = new THREE.Vector3();
      selectedObj.getWorldPosition(center);
      children.forEach((child, i)=>{
        const dir = new THREE.Vector3(
          Math.cos(i * 6.28 / children.length),
          0.5 + Math.random()*0.5,
          Math.sin(i * 6.28 / children.length)
        ).normalize();
        child.position.addScaledVector(dir, dist);
      });
      nlpLog('爆炸效果: 半径 ' + dist, 'ok');
      break;
    }
    case 'tf': {
      // 模拟 TF 文本理解 → 3D 配置
      const prompt = result.prompt;
      const rand = mulberry32(splitSeed(parseInt(document.getElementById('seed-input').value, 10) || 0, 4));
      // 从 prompt 提取关键词
      const keywords = [];
      for(const word of prompt.split(/\s+/)){
        if(word.length > 1) keywords.push(word);
      }
      const objNames = ['cabinet','chair','tree','mushroom','crystal','warrior','beast','robot','elf','golem'];
      let matched = null;
      for(const name of objNames){
        if(keywords.some(k => k.includes(name) || name.includes(k))) { matched = name; break; }
      }
      if(matched){
        spawnCharacter(matched);
        nlpLog('TF 解析: "' + prompt + '" → ' + matched, 'ok');
      } else {
        // 回退：用文法生成一段描述，模拟 TF 输出
        const ms = parseInt(document.getElementById('seed-input').value, 10) || 0;
        const biome = biomeFromSeed(ms);
        const gramRand = mulberry32(descSeedFromMaster(ms));
        const desc = generateDesc({ biomeId: biome.id, rand: gramRand });
        nlpLog('TF 输出 (fallback): ' + desc, 'ok');
      }
      break;
    }
  }
}

function processNLP(text){
  const result = parseNLPCommand(text);
  if(result){
    executeNLP(result);
  } else {
    nlpLog('无法解析指令: "' + text + '"', 'err');
  }
}

// NLP 事件绑定
document.getElementById('nlp-btn').addEventListener('click', ()=>{
  const input = document.getElementById('nlp-input');
  const text = input.value.trim();
  if(text){
    processNLP(text);
    input.value = '';
  }
});
document.getElementById('nlp-input').addEventListener('keydown', e=>{
  if(e.key === 'Enter'){
    const input = document.getElementById('nlp-input');
    const text = input.value.trim();
    if(text){ processNLP(text); input.value = ''; }
  }
});

// 更新 LOD 统计面板
function updateLODPanel(){
  updateSubdStats();
}

// 启动
setTimeout(()=>{refresh();updateCam();renderCharSwatches('none');initTransformSystem();},50);
let _lodTick = 0;
function loop(){
  requestAnimationFrame(loop);
  renderer.render(scene, camera);
  _lodTick++;
  if (_lodTick % 15 === 0) {
    checkAndSwitchLOD();
  }
}
loop();
