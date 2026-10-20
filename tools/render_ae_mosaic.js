// Render real AlphaEarth 2025 images (bands A01/A16/A09, -0.3..0.3) for landscapes across Europe.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const fs=require('fs');const S=process.argv[2];
const PLACES=[
 ['flevoland','Flevoland polders, NL',52.52,5.55,'big'],['wadden','Wadden Sea coast, NL',53.42,6.05,''],['po','Po delta, IT',44.95,12.42,''],
 ['alps','Bernese Alps, CH',46.52,8.02,''],['fjord','Sognefjord, NO',61.15,6.75,''],['olive','Olive groves, Jaén, ES',37.85,-3.75,'big'],
 ['almeria','Greenhouses, Almería, ES',36.74,-2.75,''],['camargue','Camargue, FR',43.52,4.55,''],['jutland','Farmland, Jutland, DK',55.95,9.05,''],
 ['paris','Paris, FR',48.86,2.35,''],['dalarna','Forest and lakes, Dalarna, SE',60.55,15.0,''],['highlands','Scottish Highlands, UK',57.05,-4.9,''],
 ['puszta','Great Plain, HU',47.25,20.1,''],['venice','Venice lagoon, IT',45.42,12.32,''],['rhine','Rhine valley, DE',50.08,7.75,''],
 ['bulbs','Bulb fields, Lisse, NL',52.27,4.55,''],['iceland','South Iceland',63.85,-19.1,''],['debilt','De Bilt, NL',52.10,5.18,'']
];
(async()=>{const b=await chromium.launch();const p=await b.newPage();p.on('console',m=>console.log('page:',m.text()));
await p.goto('http://localhost:8765/index.html');await p.addScriptTag({url:'https://cdn.jsdelivr.net/npm/geotiff@3.0.5/dist-browser/geotiff.js'});
for(const pl of PLACES){
 const out=await p.evaluate(async(pl)=>{
  const idx=await (await fetch('assets/data/aef-europe-2025.json')).json();
  const [id,name,lat,lon,size]=pl;const zone=Math.floor((lon+180)/6)+1,own=32600+zone;
  const hits=idx.tiles.filter(t=>lon>=t[0]&&lon<=t[2]&&lat>=t[1]&&lat<=t[3]);const t=hits.find(h=>h[5]===own)||hits[0];
  if(!t) return {err:'no tile'};
  const p=window.BeeAlphaEarth.toUtm(lat,lon,t[5]);
  const tiff=await GeoTIFF.fromUrl(idx.base+t[4]+'.tiff');const img0=await tiff.getImage(0);const ov=await tiff.getImage(2);// 40 m
  const o=img0.getOrigin();const res=10*img0.getWidth()/ov.getWidth();
  const N=size==='big'?256:128;const col=Math.round((p.x-o[0])/res),row=Math.round((p.y-o[1])/res);
  const W=ov.getWidth(),H=ov.getHeight();const x0=Math.max(0,Math.min(W-N,col-N/2)),y0=Math.max(0,Math.min(H-N,row-N/2));
  const ras=await ov.readRasters({window:[x0,y0,x0+N,y0+N],samples:[1,16,9],interleave:true});
  const c=document.createElement('canvas');c.width=N;c.height=N;const ctx=c.getContext('2d');const im=ctx.createImageData(N,N);
  const dq=q=>Math.sign(q)*(q/127.5)**2,tb=v=>Math.round(255*Math.min(1,Math.max(0,(v+0.3)/0.6)));let nod=0;
  for(let r=0;r<N;r++)for(let cc=0;cc<N;cc++){const s=(r*N+cc)*3,d=((N-1-r)*N+cc)*4;const a=ras[s],b2=ras[s+1],c2=ras[s+2];
   if(a===-128||b2===-128||c2===-128){im.data[d]=24;im.data[d+1]=28;im.data[d+2]=38;im.data[d+3]=255;nod++;continue;}
   im.data[d]=tb(dq(a));im.data[d+1]=tb(dq(b2));im.data[d+2]=tb(dq(c2));im.data[d+3]=255;}
  ctx.putImageData(im,0,0);return {url:c.toDataURL('image/png'),km:(N*res/1000).toFixed(1),nodata:nod/(N*N)};
 },pl);
 if(out.err){console.log(pl[0],out.err);continue;}
 fs.writeFileSync(S+'/aeimg/'+pl[0]+'.png',Buffer.from(out.url.split(',')[1],'base64'));console.log(pl[0],out.km+' km','nodata',out.nodata.toFixed(2));
}
fs.writeFileSync(S+'/aeimg/places.json',JSON.stringify(PLACES));await b.close()})();
