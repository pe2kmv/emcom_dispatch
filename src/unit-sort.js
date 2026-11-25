// One preferred available TS/TST per P1/P2/P3, then TS/TST, then other units.
export function sortAvailableUnits(units, polygons){
 const normal=v=>String(v??'').trim().toLocaleLowerCase('nl');
 const isTS=u=>/^(?:tst|ts)(?![a-z])/i.test(String(u.TactischeNaam??'').trim())||/^(?:tankautospuit|ts|tst)(?:$|[\s-])/i.test(String(u.Omschrijving??'').trim());
 const rest=[...units].sort((a,b)=>a.TactischeNaam.localeCompare(b.TactischeNaam,'nl',{sensitivity:'base'})||a.ID-b.ID);
 const first=[];
 for(const [index,polygon] of polygons.entries()){
  if(!normal(polygon))continue;
  const i=rest.findIndex(u=>isTS(u)&&[4,5].includes(Number(u.StatusNummer??u.StatusID))&&u.GekoppeldeMelding==null&&normal(u.Locatie)===normal(polygon));
  if(i>=0)first.push({...rest.splice(i,1)[0], polygonPriority:index+1});
 }
 return [...first,...rest.filter(isTS),...rest.filter(u=>!isTS(u))];
}
