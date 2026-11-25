export function matchesUnit(unit, query, extra=[]) {
  const haystack = [unit.TactischeNaam, unit.Omschrijving, unit.Locatie, ...extra].map(v=>String(v??'').toLocaleLowerCase('nl')).join(' ');
  return String(query??'').trim().toLocaleLowerCase('nl').split(/\s+/).every(term=>haystack.includes(term));
}
