const quote=s=>'"'+s.replaceAll('"','""')+'"';
export const resetModes=['alles','gebruikers','meldingen'];
export function resetDatabase(db,mode,createSuperuser,syncStatusHistory){
 if(!resetModes.includes(mode))throw Error('Ongeldige keuze.');
 return db.transaction(()=>{
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").all().map(r=>r.name);
  const logs=tables.filter(t=>/log/i.test(t));
  const targets=mode==='meldingen'?tables.filter(t=>t==='Melding'||logs.includes(t)):tables.filter(t=>mode!=='gebruikers'||!['Gebruiker','Eenheid','EenheidStatus'].includes(t));
  // Keep foreign keys enabled; defer checks until all related rows are removed.
  db.pragma('defer_foreign_keys = ON');
  const guards=db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name IN ('log_no_delete','eenhedenlog_no_delete','unit_history_no_delete')").all();
  for(const g of guards)db.exec(`DROP TRIGGER ${quote(g.name)}`);
  if(mode!=='alles'){let status=db.prepare('SELECT StatusID FROM EenheidStatus WHERE StatusNummer=5').get();if(!status){const r=db.prepare('INSERT INTO EenheidStatus(StatusNummer,StatusNaam) VALUES (5,?)').run('Op post');status={StatusID:Number(r.lastInsertRowid)};syncStatusHistory();}db.prepare('UPDATE Eenheid SET GekoppeldeMelding=NULL,StatusID=?').run(status.StatusID);}
  for(const t of targets)db.exec(`DELETE FROM ${quote(t)}`);
  for(const g of guards)db.exec(g.sql);
  if(mode==='alles')createSuperuser();
  if(mode!=='meldingen')syncStatusHistory();
  if(db.pragma('foreign_key_check').length)throw Error('Ongeldige databaseverwijzingen; actie teruggedraaid.');
  return {ok:true,logout:mode!=='meldingen'};
 })();
}
