export function maakAlarmtekst(melding,eenheden,ids){
  const clean=v=>String(v??'').trim();
  const opschaling=v=>clean(v)?`(${clean(v)})`:'';
  const namen=eenheden.filter(u=>ids.includes(u.ID)).map(u=>clean(u.TactischeNaam)).filter(Boolean).join(', ');
  return [clean(melding.Prioriteit)?`P${clean(melding.Prioriteit)}`:'',clean(melding.Classificatie),clean(melding.StraatHuisnummer),clean(melding.Plaats),opschaling(melding.OpschalingMono),opschaling(melding.OpschalingMulti),namen].filter(Boolean).join(' ');
}
