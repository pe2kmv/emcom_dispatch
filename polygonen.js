// GeoJSON positions are [longitude, latitude]. Include polygon boundaries.
function ringPosition(x,y,ring){
 if(!Array.isArray(ring)||ring.length<4)return -1;
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i];
  if(!Array.isArray(a)||!Array.isArray(b)||![a[0],a[1],b[0],b[1]].every(Number.isFinite))return -1;
  const dx=b[0]-a[0],dy=b[1]-a[1],cross=(x-a[0])*dy-(y-a[1])*dx;
  if(Math.abs(cross)<=1e-10*Math.hypot(dx,dy)&&x>=Math.min(a[0],b[0])-1e-10&&x<=Math.max(a[0],b[0])+1e-10&&y>=Math.min(a[1],b[1])-1e-10&&y<=Math.max(a[1],b[1])+1e-10)return 0;
  if((a[1]>y)!==(b[1]>y)&&x<(dx*(y-a[1])/dy+a[0]))inside=!inside;
 }
 return inside?1:-1;
}
function containsPolygon(x,y,rings){
 if(!Array.isArray(rings)||!rings.length||ringPosition(x,y,rings[0])<0)return false;
 return !rings.slice(1).some(r=>ringPosition(x,y,r)===1);
}
export function findPolygons(lon,lat,rows){
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return [];
 return rows.filter(r=>{try{const g=typeof r.Geometrie==='string'?JSON.parse(r.Geometrie):r.Geometrie;return g.type==='Polygon'?containsPolygon(lon,lat,g.coordinates):g.type==='MultiPolygon'&&Array.isArray(g.coordinates)&&g.coordinates.some(p=>containsPolygon(lon,lat,p));}catch{return false;}}).map(r=>r.Locatie);
}

// Local metric projection centred on the incident (suitable for regional polygons).
function boundaryDistance(lon,lat,polygons){
 const sx=111195*Math.cos(lat*Math.PI/180),sy=111195;
 let best=Infinity;
 for(const rings of polygons)for(const ring of rings){
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[j],b=ring[i];
   if(!a||!b||![a[0],a[1],b[0],b[1]].every(Number.isFinite))continue;
   const x=(a[0]-lon)*sx,y=(a[1]-lat)*sy,dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy;
   const d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,-(x*dx+y*dy)/d)):0;
   best=Math.min(best,Math.hypot(x+t*dx,y+t*dy));
  }
 }
 return best;
}
export function findPriorityPolygons(lon,lat,rows){
 const empty={PolygoonP1:null,PolygoonP2:null,PolygoonP3:null};
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return empty;
 const candidates=[];
 for(const r of rows){try{
  const g=typeof r.Geometrie==='string'?JSON.parse(r.Geometrie):r.Geometrie;
  const p=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  if(!p.length)continue;
  const inside=p.some(rings=>containsPolygon(lon,lat,rings));
  const distance=boundaryDistance(lon,lat,p);
  if(Number.isFinite(distance))candidates.push({r,inside,distance});
 }catch{}}
 const first=candidates.find(c=>c.inside);
 if(!first)return empty;
 const [second,third]=candidates.filter(c=>c!==first).sort((a,b)=>a.distance-b.distance);
 return {PolygoonP1:first.r.Locatie,PolygoonP2:second?.r.Locatie??null,PolygoonP3:third?.r.Locatie??null};
}
