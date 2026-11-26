import { vfxAtlases } from './vfx-atlases.js'
import { summonTier } from './legendary-attacks.js'

const tau=Math.PI*2,clamp=n=>Math.max(0,Math.min(1,n))
const textures=new Map(),tints=new Map()
const particleFiles=['circle-02','light-03','star-06','twirl-02'].map(id=>'vfx-particle-'+id+'.webp')
function texture(file){
  if(textures.has(file))return textures.get(file)
  const image=new Image();image.src=globalThis.fairytaleImages?.[file]??new URL('./assets/'+file,import.meta.url).href
  textures.set(file,image);return image
}
export function preloadBattleVfx(){
  if(!globalThis.Image)return
  for(const file of [...Object.values(vfxAtlases).map(a=>a.file),...particleFiles])texture(file)
}
function tint(file,color){
  const key=file+color;if(tints.has(key))return tints.get(key)
  const image=texture(file);if(!image.complete||!image.naturalWidth)return null
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height)
  if(tints.size>=96)tints.delete(tints.keys().next().value)
  tints.set(key,canvas);return canvas
}
function particle(ctx,id,x,y,size,color,alpha=1,angle=0){
  if(alpha<=0)return
  const image=tint('vfx-particle-'+id+'.webp',color);if(!image)return
  ctx.save();ctx.globalAlpha=clamp(alpha);ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(image,-size/2,-size/2,size,size);ctx.restore()
}
function glow(ctx,x,y,radius,color,alpha){
  if(radius<=0||alpha<=0)return
  ctx.save();ctx.globalAlpha=clamp(alpha);const fill=ctx.createRadialGradient(x,y,0,x,y,radius);fill.addColorStop(0,color);fill.addColorStop(.3,color+'99');fill.addColorStop(1,color+'00');ctx.fillStyle=fill;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);ctx.restore()
}
function ring(ctx,x,y,radius,color,alpha=1,scaleY=1,rotation=0,dashed=false){
  ctx.save();ctx.globalAlpha=clamp(alpha);ctx.translate(x,y);ctx.scale(1,scaleY);ctx.rotate(rotation);ctx.strokeStyle=color;ctx.lineWidth=1.5;if(dashed)ctx.setLineDash([5,8]);ctx.beginPath();ctx.arc(0,0,radius,0,tau);ctx.stroke();ctx.restore()
}
function sprite(ctx,name,x,y,size,progress,alpha=1,angle=0){
  const atlas=vfxAtlases[name];if(!atlas||progress<0||progress>=1)return
  const image=texture(atlas.file);if(!image.complete||!image.naturalWidth)return
  const frame=atlas.frames[Math.min(atlas.frames.length-1,Math.floor(progress*atlas.frames.length))]
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=clamp(alpha);ctx.drawImage(image,frame.x,frame.y,frame.w,frame.h,-size/2,-size/2,size,size);ctx.restore()
}
function polygon(ctx,x,y,radius,count,angle,color,alpha=1){
  ctx.save();ctx.globalAlpha=clamp(alpha);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath()
  for(let i=0;i<=count;i++){const a=angle+i/count*tau;const px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}
  ctx.stroke();ctx.restore()
}
function fieldRunes(ctx,x,y,r,angle,alpha){
  ctx.save();ctx.translate(x,y);ctx.scale(1,.34);ctx.rotate(angle);ctx.strokeStyle='#ffe6a0';ctx.globalAlpha=clamp(alpha);ctx.lineWidth=1.7
  for(let i=0;i<12;i++){ctx.save();ctx.rotate(i/12*tau);ctx.translate(r,0);ctx.beginPath();ctx.moveTo(-3,-6);ctx.lineTo(4,0);ctx.lineTo(-3,6);ctx.moveTo(-2,0);ctx.lineTo(6,0);ctx.stroke();ctx.restore()}
  ctx.restore()
}
function summon(ctx,target,progress,tier,impact=false){
  const special=tier==='legendary',major=special||tier==='major',radius=Math.min(138,target.width*(special ? .77 : major ? .66 : .48))
  const appear=impact?1:clamp(progress*3),fade=impact?(1-progress)**1.3:Math.sin(progress*Math.PI*.7)
  const x=target.x,y=target.y+target.height*.25,spin=progress*(special?1.8:.9)
  glow(ctx,x,y,radius*1.3,'#ffd47b',fade*.25)
  ring(ctx,x,y,radius*appear,'#ffd98c',fade,.34,spin,true)
  if(major){ring(ctx,x,y,radius*.72*appear,'#fff0ba',fade*.95,.34,-spin);fieldRunes(ctx,x,y,radius*.86*appear,spin,fade*.85);polygon(ctx,x,y,radius*.42*appear,8,spin,'#ffe6aa',fade*.45)}
  const count=special?24:major?14:6
  for(let i=0;i<count;i++){
    const angle=i/count*tau+spin*.25,travel=impact?progress:progress*.45
    const px=x+Math.cos(angle)*radius*(.65+travel*.65),py=y+Math.sin(angle)*radius*.3-(special?100:55)*travel*((i%5+1)/5)
    particle(ctx,i%4?'star-06':'light-03',px,py,8+(i%3)*5,'#ffe6aa',fade*.8,angle)
  }
  if(major){
    const beamHeight=Math.min(280,target.height*(special?2.5:1.8)),beamWidth=radius*(special ? .82 : .5)
    ctx.save();ctx.globalAlpha=fade*(special ? .65 : .38);const beam=ctx.createLinearGradient(x,y-beamHeight,x,y);beam.addColorStop(0,'#ffda8200');beam.addColorStop(.65,'#fff0b433');beam.addColorStop(1,'#fff2d3cc');ctx.fillStyle=beam;ctx.fillRect(x-beamWidth/2,y-beamHeight,beamWidth,beamHeight);ctx.restore()
    particle(ctx,'light-03',x,y,radius*1.9,'#ffe5a7',fade*.5,spin)
  }
  if(impact){ring(ctx,x,y,radius*(.5+progress*.95),'#ffeec3',fade,.42);glow(ctx,target.x,target.y,radius,'#fff3c8',(1-progress)**3*.55)}
}
function point(from,to,t,method,phase){
  const x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t
  if(method==='meteor')return{x,y:y-Math.sin(t*Math.PI)*95}
  if(['ribbon','wave','music','jelly','petal','feather','cloud'].includes(method))return{x,y:y+Math.sin(t*Math.PI*2+phase)*Math.sin(t*Math.PI)*24}
  return{x,y}
}
function trace(ctx,from,to,p,color,width,method,phase){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath()
  for(let i=0;i<=22;i++){const t=i/22*p,at=point(from,to,t,method,phase);i?ctx.lineTo(at.x,at.y):ctx.moveTo(at.x,at.y)}
  ctx.stroke();ctx.restore()
}
function travel(ctx,from,to,p,profile){
  const {method,color,accent,seed,glyph}=profile,phase=profile.phase/180*Math.PI,q=clamp(p),at=point(from,to,q,method,phase)
  const angle=Math.atan2(to.y-from.y,to.x-from.x),fade=Math.sin(Math.PI*clamp(q*.85+.07)),radius=Math.min(30,to.width*.24)
  glow(ctx,from.x,from.y,from.width*.55,color,fade*.16)
  if(method==='breath'||method==='flame'){
    ctx.save();ctx.translate(from.x,from.y);ctx.rotate(angle)
    const length=Math.hypot(at.x-from.x,at.y-from.y),spread=12+q*27
    const beam=ctx.createLinearGradient(0,0,Math.max(1,length),0)
    beam.addColorStop(0,color+'11');beam.addColorStop(.55,color+'77');beam.addColorStop(1,accent+'bb')
    ctx.fillStyle=beam;ctx.globalAlpha=fade*.65;ctx.beginPath();ctx.moveTo(0,-4);ctx.quadraticCurveTo(length*.6,-spread*.6,length,-spread);ctx.quadraticCurveTo(length+12,0,length,spread);ctx.quadraticCurveTo(length*.6,spread*.6,0,4);ctx.closePath();ctx.fill();ctx.restore()
  }
  ctx.save();ctx.globalAlpha=fade*.7;trace(ctx,from,at,1,color,method==='breath'?12:method==='wave'?8:3,method,phase);ctx.restore()
  for(let i=0;i<9;i++){
    const t=Math.max(0,q-i*.026),pos=point(from,to,t,method,phase)
    particle(ctx,i%3?'star-06':'light-03',pos.x+Math.sin(i*2+phase)*10,pos.y+Math.cos(i+phase)*8,10+(i%3)*4,color,fade*(1-i/10)*.6,phase+p*3)
  }
  ctx.save();ctx.translate(at.x,at.y);ctx.rotate(angle)
  if(['blade','dagger','axe','claw','shadow'].includes(method)){
    const slashes=method==='claw'?3:method==='axe'?2:1
    for(let i=0;i<slashes;i++){ctx.save();ctx.translate(0,(i-(slashes-1)/2)*11);ctx.strokeStyle=i%2?accent:color;ctx.lineWidth=method==='axe'?5:3;ctx.beginPath();ctx.moveTo(-radius*1.8,10);ctx.quadraticCurveTo(0,-radius,radius*1.9,0);ctx.stroke();ctx.restore()}
  }else if(['arrow','ice','bolt'].includes(method)){
    ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-radius*2,0)
    if(method==='bolt')for(let i=0;i<7;i++)ctx.lineTo(-radius*2+i*radius*.65,(i%2?1:-1)*10)
    else{ctx.lineTo(radius,0);ctx.moveTo(0,-radius*.45);ctx.lineTo(radius,0);ctx.lineTo(0,radius*.45)}
    ctx.stroke();if(method==='ice')polygon(ctx,0,0,radius,4,0,color,.9)
  }else if(method==='hammer'){
    ctx.rotate(-.7+q*1.2);ctx.fillStyle=accent;ctx.fillRect(-7,-radius,14,radius*2);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(-radius,-radius*1.1,radius*1.8,radius*.9)
  }else if(['breath','flame'].includes(method)){
    for(let i=0;i<5;i++)glow(ctx,-i*9,Math.sin(i+q*12)*10,radius*(1-i*.12),i%2?color:accent,fade*.4)
  }else if(['wave','cloud','jelly'].includes(method)){
    for(let i=0;i<3;i++){ring(ctx,-i*13,0,radius*(1-i*.2),i%2?color:accent,fade,.7,q*4);glow(ctx,-i*12,0,radius*.8,color,.23)}
  }else if(method==='vine'||method==='ribbon'){
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-radius*2,0);ctx.bezierCurveTo(-radius,-radius,radius,radius,radius*1.7,0);ctx.stroke()
    if(method==='vine')for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-radius+i*radius*.55,0);ctx.lineTo(-radius+i*radius*.55-6,(i%2?1:-1)*12);ctx.stroke()}
    else particle(ctx,'twirl-02',0,0,radius*2,accent,.8,q*5)
  }else if(['feather','petal'].includes(method)){
    for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*.8+q*5);ctx.fillStyle=i%2?accent:color;ctx.globalAlpha=.7;ctx.beginPath();ctx.ellipse(radius*.5,0,radius*.6,radius*.18,0,0,tau);ctx.fill();ctx.restore()}
  }else if(method==='music'){
    ctx.rotate(-angle);ctx.fillStyle=accent;ctx.font='28px Georgia';ctx.textAlign='center';ctx.fillText(glyph,0,8);ring(ctx,0,0,radius,color,.5)
  }else{
    glow(ctx,0,0,radius*1.7,color,.5);polygon(ctx,0,0,radius,method==='mirror'?4:profile.spokes,q*4,color,.95)
    ctx.rotate(-angle);ctx.fillStyle=accent;ctx.font='21px Georgia';ctx.textAlign='center';ctx.fillText(glyph,0,7)
    if(method==='lantern')ring(ctx,0,0,radius*.65,accent,.8,.8)
  }
  ctx.restore()
}
function legendaryImpact(ctx,target,p,profile){
  const {method,color,accent}=profile,r=Math.min(130,target.width*.8),fade=(1-p)**1.5
  glow(ctx,target.x,target.y,r*1.3,color,fade*.45)
  ring(ctx,target.x,target.y,r*(.35+p),color,fade)
  polygon(ctx,target.x,target.y,r*(.45+p*.4),profile.spokes,profile.phase+p,accent,fade*.6)
  const atlas=['blade','dagger','axe','claw','shadow'].includes(method)?'sword-slash':method==='ice'?'ice-burst':method==='bolt'?'lightning':method==='flame'?'fireball':'hit-spark'
  const repeats=method==='claw'?3:method==='axe'?2:1
  for(let i=0;i<repeats;i++)sprite(ctx,atlas,target.x+(i-(repeats-1)/2)*13,target.y,r*2.05,clamp(p*1.9-i*.12),fade*.75,(i-(repeats-1)/2)*.45)
  const count=12+profile.seed%7
  for(let i=0;i<count;i++){
    const a=i/count*tau+profile.phase,radius=r*(.25+p)*(1+(i%3)*.13),x=target.x+Math.cos(a)*radius,y=target.y+Math.sin(a)*radius*.72
    particle(ctx,i%4?'star-06':'twirl-02',x,y,9+(i%4)*4,i%2?color:accent,fade*.8,a+p*3)
    if(['petal','feather','vine','music','mirror','rune','star','meteor'].includes(method)&&i%3===0){ctx.save();ctx.translate(x,y);ctx.rotate(a+p*3);ctx.globalAlpha=fade*.8;ctx.fillStyle=accent;ctx.font='19px Georgia';ctx.textAlign='center';ctx.fillText(profile.glyph,0,0);ctx.restore()}
  }
}
function normalImpact(ctx,target,p,style){
  const size=Math.min(175,target.width*1.45),fade=(1-p)**1.2
  sprite(ctx,style==='slash'?'sword-slash':'hit-spark',target.x,target.y,size,p,style==='slash'?.8:.7)
  if(style==='slash')sprite(ctx,'hit-spark',target.x,target.y,size*.55,clamp(p*1.2),fade*.55,.3)
}
function targetPoint(node,rect){
  if(!node)return null
  const bounds=node.getBoundingClientRect();return{x:bounds.x-rect.x+bounds.width/2,y:bounds.y-rect.y+bounds.height/2,width:bounds.width,height:bounds.height}
}

// The layer follows DOM anchors each frame; it never owns game state or blocks input.
export function mountBattleVfx(app,scene,phase,resolveAnchor){
  if(scene.reduced)return null
  const grid=app.querySelector('.battle-grid');if(!grid)return null
  const hasSummon=phase==='approach'&&scene.landing&&scene.card?.kind==='unit'
  if(phase==='approach'&&!hasSummon&&!scene.strike?.legend)return null
  grid.querySelector('.battle-vfx-layer')?.remove()
  const layer=document.createElement('div');layer.className='battle-vfx-layer';layer.dataset.vfxStage=phase;layer.setAttribute('aria-hidden','true')
  if(scene.strike?.legend)layer.dataset.vfxProfile=scene.strike.legend.id
  if(hasSummon){layer.dataset.vfxTier=scene.summonTier;if(scene.summonTier==='legendary')layer.classList.add('vfx-legendary-summon')}
  const canvas=document.createElement('canvas');canvas.className='battle-vfx-canvas';layer.append(canvas);grid.append(layer)
  const ctx=canvas.getContext('2d');if(!ctx){layer.remove();return null}
  const life=phase==='approach'?scene.approachMs+40:scene.strike?.legend?680:scene.bursts.some(b=>b.style==='summon'&&summonTier(b.card)==='legendary')?850:480
  const start=performance.now();preloadBattleVfx()
  function paint(now){
    if(!layer.isConnected)return
    const p=clamp((now-start)/life),rect=grid.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5)
    const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio)
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height)
    if(phase==='approach'){
      if(hasSummon){const target=targetPoint(resolveAnchor(scene.landing),rect);if(target)summon(ctx,target,p,scene.summonTier)}
      if(scene.strike?.legend){const from=targetPoint(resolveAnchor(scene.strike.from),rect),to=targetPoint(resolveAnchor(scene.strike.to),rect);if(from&&to)travel(ctx,from,to,clamp((now-start)/scene.approachMs),scene.strike.legend)}
    }else for(const impact of scene.bursts.slice(0,12)){
      const target=targetPoint(resolveAnchor(impact.to),rect);if(!target)continue
      if(impact.style==='summon')summon(ctx,target,p,summonTier(impact.card),true)
      else if(['slash','blow','arcane'].includes(impact.style)){
        if(scene.strike?.legend&&impact.to.seat===scene.strike.to.seat)legendaryImpact(ctx,target,p,scene.strike.legend)
        else normalImpact(ctx,target,clamp(p*1.6),impact.style)
      }
    }
    if(p<1)requestAnimationFrame(paint);else layer.remove()
  }
  requestAnimationFrame(paint);return layer
}
