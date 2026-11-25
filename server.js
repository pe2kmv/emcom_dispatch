import {writeGeoLog} from './geo-log.js';
import {systemRoutes,readSystem} from './system-settings.js';
import {initPriority,priorityRoutes} from './priority.js';
import {auditMiddleware} from './audit-csv.js';
import {resetDatabase,resetModes} from './database-reset.js';
import {mapRoutes,validPoint} from './map-api.js';
import {findPolygons,findPriorityPolygons} from './polygonen.js';
import {lookupAddress} from './geocoding.js';
import {pagerRequest,sendPager} from './pager.js';
import express from 'express';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
mkdirSync(root+'data',{recursive:true});
const db=new Database(root+'data/cad.sqlite');
db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');
const freshDatabase=!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
const defaults=['Brand','Hulpverlening','IBGS','Dienstverlening'];
const schema=`CREATE TABLE Melding (ID INTEGER PRIMARY KEY AUTOINCREMENT, MasterID INTEGER DEFAULT NULL REFERENCES Melding(ID), Naam TEXT NOT NULL DEFAULT '', StraatHuisnummer TEXT NOT NULL DEFAULT '', Postcode TEXT NOT NULL DEFAULT '', Plaats TEXT NOT NULL DEFAULT '', Telefoon TEXT NOT NULL DEFAULT '', Classificatie TEXT DEFAULT 'Dienstverlening', Datum TEXT NOT NULL, Tijd TEXT NOT NULL, Status TEXT NOT NULL DEFAULT 'Open' CHECK(Status IN ('Open','Gesloten')))`;
// Migrate v1.1's Locatie column without losing IDs, timestamps, status or links.
const cols=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Melding'").get()?db.prepare('PRAGMA table_info(Melding)').all().map(c=>c.name):[];
if(!cols.length)db.exec(schema);
else if(cols.includes('Locatie')){
 db.transaction(()=>{
  db.exec('ALTER TABLE Melding RENAME TO Melding_legacy');
  db.exec(schema);
  db.exec(`INSERT INTO Melding (ID,MasterID,Naam,StraatHuisnummer,Postcode,Plaats,Telefoon,Classificatie,Datum,Tijd,Status) SELECT ID,MasterID,'',Locatie,'','','','Dienstverlening',Datum,Tijd,Status FROM Melding_legacy`);
  db.exec('DROP TABLE Melding_legacy');
 })();
}
// Migrate legacy address text without guessing its components.
if(db.pragma('table_info(Melding)').some(c=>c.name==='Locatie')){
 db.transaction(()=>{
  for(const f of ['Naam','StraatHuisnummer','Postcode','Plaats','Telefoon']) db.exec(`ALTER TABLE Melding ADD COLUMN ${f} TEXT NOT NULL DEFAULT ''`);
  db.exec("ALTER TABLE Melding ADD COLUMN Classificatie TEXT");
  db.exec('UPDATE Melding SET StraatHuisnummer=Locatie');
  db.exec('ALTER TABLE Melding DROP COLUMN Locatie');
 })();
}
if(!db.pragma('table_info(Melding)').some(c=>c.name==='Prioriteit')) db.exec('ALTER TABLE Melding ADD COLUMN Prioriteit INTEGER NOT NULL DEFAULT 2 CHECK(Prioriteit IN (1,2))');
db.exec(`CREATE TABLE IF NOT EXISTS Logregel (LogID INTEGER PRIMARY KEY AUTOINCREMENT, MeldingID INTEGER NOT NULL REFERENCES Melding(ID), Datum TEXT NOT NULL, Tijd TEXT NOT NULL, Tekst TEXT NOT NULL CHECK(length(trim(Tekst)) BETWEEN 1 AND 3000));
CREATE INDEX IF NOT EXISTS idx_log_melding ON Logregel(MeldingID,LogID);
CREATE TRIGGER IF NOT EXISTS log_no_update BEFORE UPDATE ON Logregel BEGIN SELECT RAISE(ABORT,'Logregel is onveranderlijk'); END;
CREATE TRIGGER IF NOT EXISTS log_no_delete BEFORE DELETE ON Logregel BEGIN SELECT RAISE(ABORT,'Logregel is onveranderlijk'); END;`);
// Allow only the one-time association metadata update; log contents stay immutable.
db.transaction(()=>{
 db.exec('DROP TRIGGER IF EXISTS log_no_update');
 if(!db.pragma('table_info(Logregel)').some(c=>c.name==='MasterID')){
  db.exec('ALTER TABLE Logregel ADD COLUMN MasterID INTEGER DEFAULT NULL REFERENCES Melding(ID)');
  db.exec('UPDATE Logregel SET MasterID=(SELECT MasterID FROM Melding WHERE ID=Logregel.MeldingID)');
 }
 db.exec(`CREATE INDEX IF NOT EXISTS idx_log_master ON Logregel(MasterID,LogID);
 CREATE TRIGGER log_no_update BEFORE UPDATE ON Logregel WHEN NOT (OLD.MasterID IS NULL AND NEW.MasterID IS NOT NULL AND NEW.MasterID IS (SELECT MasterID FROM Melding WHERE ID=OLD.MeldingID) AND NEW.LogID IS OLD.LogID AND NEW.MeldingID IS OLD.MeldingID AND NEW.Datum IS OLD.Datum AND NEW.Tijd IS OLD.Tijd AND NEW.Tekst IS OLD.Tekst) BEGIN SELECT RAISE(ABORT,'Logregel is onveranderlijk'); END;`);
})();
// Remove the old fixed classification CHECK while preserving IDs and log references.
if(/CHECK\s*\(Classificatie/i.test(db.prepare("SELECT sql FROM sqlite_master WHERE name='Melding'").get().sql)) {
 db.pragma('foreign_keys = OFF');
 try { db.transaction(()=>{
  const seq=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='Melding'").get()?.seq||0;
  const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE name='log_no_update'").get().sql;
  db.exec('DROP TRIGGER log_no_update');
  db.exec(schema.replace('CREATE TABLE Melding (','CREATE TABLE Melding_new ('));
  db.exec('ALTER TABLE Melding_new ADD COLUMN Prioriteit INTEGER NOT NULL DEFAULT 2 CHECK(Prioriteit IN (1,2))');
  const columns=db.pragma('table_info(Melding_new)').map(c=>c.name).join(',');
  db.exec(`INSERT INTO Melding_new (${columns}) SELECT ${columns} FROM Melding; DROP TABLE Melding; ALTER TABLE Melding_new RENAME TO Melding;`);
  db.prepare("UPDATE sqlite_sequence SET seq=max(seq,?) WHERE name='Melding'").run(seq);
  db.exec(trigger);
  if(db.pragma('foreign_key_check').length)throw Error('Migratie: ongeldige verwijzingen');
 })(); } finally {db.pragma('foreign_keys = ON');}
}
db.transaction(()=>{
 const exists=db.prepare("SELECT name FROM sqlite_master WHERE name='Classificatie'").get();
 db.exec('CREATE TABLE IF NOT EXISTS Classificatie (ID INTEGER PRIMARY KEY AUTOINCREMENT, Classificatie TEXT NOT NULL COLLATE NOCASE UNIQUE, Omschrijving TEXT DEFAULT NULL)');
 if(!exists){const ins=db.prepare('INSERT OR IGNORE INTO Classificatie (Classificatie) VALUES (?)'); if(!freshDatabase)for(const c of defaults)ins.run(c);for(const r of db.prepare("SELECT DISTINCT Classificatie FROM Melding WHERE Classificatie IS NOT NULL AND Classificatie<>''").all())ins.run(r.Classificatie);}
})();
// 1.48: configurable escalation levels; retain historical incident values.
const escalationTables={mono:'OpschalingMono',multi:'OpschalingMulti'};
const escalationDefaults={mono:['Klein','Middel','Groot','Zeer groot'],multi:['GRIP 1','GRIP 2','GRIP 3','GRIP 4','GRIP 5']};
db.pragma('foreign_keys = OFF');
try {db.transaction(()=>{
 for(const name of Object.values(escalationTables))if(!db.pragma('table_info(Melding)').some(c=>c.name===name))db.exec(`ALTER TABLE Melding ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
 const original=db.prepare("SELECT sql FROM sqlite_master WHERE name='Melding'").get().sql;
 const sql=original.replace(/CHECK\s*\(\s*Opschaling(?:Mono|Multi)\s+IN\s*\([^)]*\)\s*\)/gi,'');
 if(sql!==original){
  const seq=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='Melding'").get()?.seq||0;
  const objects=db.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND ((tbl_name='Melding' AND type IN ('index','trigger')) OR (type='trigger' AND tbl_name<>'Melding' AND sql LIKE '%Melding%'))").all();
  const external=objects.filter(o=>o.type==='trigger');
  const quote=x=>'"'+x.replaceAll('"','""')+'"';
  for(const o of external)db.exec(`DROP TRIGGER ${quote(o.name)}`);
  db.exec(sql.replace(/^CREATE TABLE\s+["`\[]?Melding["`\]]?/i,'CREATE TABLE Melding_new'));
  const columns=db.pragma('table_info(Melding)').map(c=>quote(c.name)).join(',');
  db.exec(`INSERT INTO Melding_new (${columns}) SELECT ${columns} FROM Melding; DROP TABLE Melding; ALTER TABLE Melding_new RENAME TO Melding;`);
  db.prepare("UPDATE sqlite_sequence SET seq=max(seq,?) WHERE name='Melding'").run(seq);
  if(!db.prepare("SELECT 1 FROM sqlite_sequence WHERE name='Melding'").get())db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('Melding',?)").run(seq);
  for(const o of objects)db.exec(o.sql);
 }
 for(const [kind,table] of Object.entries(escalationTables)){
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (ID INTEGER PRIMARY KEY AUTOINCREMENT, Naam TEXT NOT NULL COLLATE NOCASE UNIQUE)`);
  if(!exists&&!freshDatabase){const ins=db.prepare(`INSERT INTO ${table}(Naam) VALUES (?)`);for(const name of escalationDefaults[kind])ins.run(name);}
 }
 if(db.pragma('foreign_key_check').length)throw Error('Migratie opschalingsniveaus: ongeldige verwijzingen');
})();}finally{db.pragma('foreign_keys = ON');}
initPriority(db,!freshDatabase);
const escalationExists=(table,value)=>value===''||!!db.prepare(`SELECT ID FROM ${table} WHERE Naam=? COLLATE BINARY`).get(value);
const classExists=c=>!!db.prepare('SELECT ID FROM Classificatie WHERE Classificatie=? COLLATE BINARY').get(c);
const velden=['Naam','StraatHuisnummer','Postcode','Plaats','Telefoon','Classificatie'];
const app=express();app.use(express.json({limit:'16kb'}));app.use(auditMiddleware(root,db));
db.exec(`CREATE TABLE IF NOT EXISTS Gebruiker (ID INTEGER PRIMARY KEY AUTOINCREMENT, Gebruikersnaam TEXT NOT NULL COLLATE NOCASE UNIQUE, Wachtwoord TEXT NOT NULL, Voornaam TEXT NOT NULL, Achternaam TEXT NOT NULL, Telefoon TEXT DEFAULT NULL, Email TEXT DEFAULT NULL, Toegangsniveau INTEGER NOT NULL CHECK(Toegangsniveau IN (0,1,2,3)));
CREATE TABLE IF NOT EXISTS Sessie (Token TEXT PRIMARY KEY, GebruikerID INTEGER NOT NULL REFERENCES Gebruiker(ID) ON DELETE CASCADE, Verloopt INTEGER NOT NULL);`);
// Preserve historical identities even when accounts are renamed or deleted.
db.transaction(()=>{
 for(const [table,columns] of [['Gebruiker',["Audio INTEGER NOT NULL DEFAULT 1 CHECK(Audio IN (0,1))","Kleurpalet TEXT NOT NULL DEFAULT 'Donker' CHECK(Kleurpalet IN ('Donker','Licht'))"]],['Melding',['AangemaaktDoorID INTEGER','AangemaaktDoor TEXT','GewijzigdDoorID INTEGER','GewijzigdDoor TEXT','RD_X REAL','RD_Y REAL','Latitude REAL','Longitude REAL']],['Logregel',['GebruikerID INTEGER','Gebruikersnaam TEXT']]]){
  for(const column of columns)if(!db.pragma(`table_info(${table})`).some(c=>c.name===column.split(' ')[0]))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
 }
 db.exec('DROP TRIGGER IF EXISTS log_no_update');
 db.exec(`CREATE TRIGGER log_no_update BEFORE UPDATE ON Logregel WHEN NOT (OLD.MasterID IS NULL AND NEW.MasterID IS NOT NULL AND NEW.MasterID IS (SELECT MasterID FROM Melding WHERE ID=OLD.MeldingID) AND NEW.LogID IS OLD.LogID AND NEW.MeldingID IS OLD.MeldingID AND NEW.Datum IS OLD.Datum AND NEW.Tijd IS OLD.Tijd AND NEW.Tekst IS OLD.Tekst AND NEW.GebruikerID IS OLD.GebruikerID AND NEW.Gebruikersnaam IS OLD.Gebruikersnaam) BEGIN SELECT RAISE(ABORT,'Logregel is onveranderlijk'); END;`);
})();
const changedBy=(id,u)=>db.prepare('UPDATE Melding SET GewijzigdDoorID=?,GewijzigdDoor=? WHERE ID=?').run(u.ID,u.Gebruikersnaam,id);
function hashPassword(password,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(password,salt,64).toString('hex');}
function checkPassword(password,hash){const [salt,key]=hash.split(':');return timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(hashPassword(password,salt).split(':')[1],'hex'));}
if(!db.prepare('SELECT ID FROM Gebruiker LIMIT 1').get())db.prepare('INSERT INTO Gebruiker (Gebruikersnaam,Wachtwoord,Voornaam,Achternaam,Telefoon,Email,Toegangsniveau) VALUES (?,?,?,?,NULL,NULL,0)').run('Superuser',hashPassword('4321'),'Super','User');
const digest=t=>createHash('sha256').update(t).digest('hex');
const token=req=>/^(?:.*;\s*)?cad_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
const publicUser=u=>({Titel:readSystem(db).Titel,Organisatie:readSystem(db).Organisatie,Taal:readSystem(db).Taal,Audio:u.Audio,Kleurpalet:u.Kleurpalet,Gebruikersnaam:u.Gebruikersnaam,Voornaam:u.Voornaam,Achternaam:u.Achternaam,KanGebruikersBeheren:u.Toegangsniveau<=1,KanHeropenen:u.Toegangsniveau<=2});
const cookieOptions={httpOnly:true,sameSite:'strict',secure:process.env.CAD_SECURE_COOKIE==='1',path:'/'};
const attempts=new Map();const dummy=hashPassword('invalid');
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){const origin=req.get('origin');if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Ongeldige herkomst.'});}catch{return res.status(403).json({error:'Ongeldige herkomst.'});}}}next();});
app.post('/api/login',(req,res)=>{
 const ip=req.ip,now=Date.now();for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);
 const a=attempts.get(ip)||{count:0,until:now+15*60000};if(a.count>=10)return res.status(429).json({error:'Te veel pogingen. Probeer later opnieuw.'});
 const {Gebruikersnaam,Wachtwoord}=req.body||{};
 if(typeof Gebruikersnaam!=='string'||typeof Wachtwoord!=='string'||Gebruikersnaam.length>200||Wachtwoord.length>256)return res.status(400).json({error:'Ongeldige invoer.'});
 const u=db.prepare('SELECT * FROM Gebruiker WHERE Gebruikersnaam=?').get(Gebruikersnaam.trim());
 if(!checkPassword(Wachtwoord,u?.Wachtwoord||dummy)||!u){a.count++;attempts.set(ip,a);return res.status(401).json({error:'Gebruikersnaam of wachtwoord onjuist.'});}
 attempts.delete(ip);const t=randomBytes(32).toString('hex');const old=token(req);if(old)db.prepare('DELETE FROM Sessie WHERE Token=?').run(digest(old));db.prepare('DELETE FROM Sessie WHERE Verloopt<=?').run(now);db.prepare('INSERT INTO Sessie VALUES (?,?,?)').run(digest(t),u.ID,now+8*3600000);res.cookie('cad_session',t,{...cookieOptions,maxAge:8*3600000});res.json(publicUser(u));
});
app.get('/api/taal',(req,res)=>{res.set('Cache-Control','no-store');res.json({Taal:readSystem(db).Taal,Titel:readSystem(db).Titel});});
app.use('/api',(req,res,next)=>{const t=token(req);const u=t&&db.prepare('SELECT g.* FROM Sessie s JOIN Gebruiker g ON g.ID=s.GebruikerID WHERE s.Token=? AND s.Verloopt>?').get(digest(t),Date.now());if(!u)return res.status(401).json({error:'Log eerst in.'});req.gebruiker=u;next();});
app.get('/api/session',(req,res)=>res.json(publicUser(req.gebruiker)));
app.patch('/api/eigen-audio',(req,res)=>{const b=req.body;if(!b||Object.keys(b).length!==1||![0,1].includes(b.Audio))return res.status(400).json({error:'Ongeldige audio-instelling.'});db.prepare('UPDATE Gebruiker SET Audio=? WHERE ID=?').run(b.Audio,req.gebruiker.ID);res.json({Audio:b.Audio});});
app.patch('/api/eigen-kleurpalet',(req,res)=>{const b=req.body;if(!b||Object.keys(b).length!==1||!['Donker','Licht'].includes(b.Kleurpalet))return res.status(400).json({error:'Ongeldig kleurpalet.'});db.prepare('UPDATE Gebruiker SET Kleurpalet=? WHERE ID=?').run(b.Kleurpalet,req.gebruiker.ID);res.json({Kleurpalet:b.Kleurpalet});});
app.post('/api/logout',(req,res)=>{db.prepare('DELETE FROM Sessie WHERE Token=?').run(digest(token(req)));res.clearCookie('cad_session',cookieOptions);res.json({ok:true});});

// User management: enforce permissions on every request, not just in Vue.
const management=(req,res,next)=>req.gebruiker.Toegangsniveau<=1?next():res.status(403).json({error:'Geen toegang.'});
systemRoutes(app,db,management);mapRoutes(app,db,management);priorityRoutes(app,db,management);
// Read-only database browser: identifiers come only from SQLite metadata.
const databaseTables=()=>db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name COLLATE NOCASE").all().map(r=>r.name);
const quoteIdentifier=name=>'"'+name.replaceAll('"','""')+'"';
app.get('/api/database/tabellen',management,(req,res)=>res.json(databaseTables()));
app.get('/api/database/tabellen/:naam',management,(req,res)=>{
 const name=req.params.naam;
 if(!databaseTables().includes(name))return res.status(404).json({error:'Tabel niet gevonden.'});
 const page=Number(req.query.page??0),size=100;
 if(!Number.isSafeInteger(page)||page<0||page>Math.floor(Number.MAX_SAFE_INTEGER/size))return res.status(400).json({error:'Ongeldige pagina.'});
 const table=quoteIdentifier(name);
 const fields=db.prepare('SELECT name,pk FROM pragma_table_info(?)').all(name);
 const columns=fields.map(f=>f.name).filter(c=>!(name==='Logboek eenheden'&&c==='LogID')&&!(name==='EenheidStatus'&&c==='StatusID'));
 const hidden=c=>/^(wachtwoord|token)$/i.test(c);
 const projection=columns.map(c=>hidden(c)?`'••••••' AS ${quoteIdentifier(c)}`:quoteIdentifier(c)).join(',');
 const order=fields.filter(f=>f.pk).sort((a,b)=>a.pk-b.pk).map(f=>quoteIdentifier(f.name)).join(',')||columns.map(quoteIdentifier).join(',');
 const result=db.transaction(()=>({columns,total:db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,rows:db.prepare(`SELECT ${projection} FROM ${table} ORDER BY ${order} LIMIT ? OFFSET ?`).safeIntegers().all(size,page*size).map(r=>columns.map(c=>typeof r[c]==='bigint'?r[c].toString():Buffer.isBuffer(r[c])?`[BLOB: ${r[c].length} bytes]`:r[c])),page,size}))();
 res.json(result);
});

// Explicit, authorized exception to immutable log deletion guards.
app.post('/api/database/leegmaken',management,(req,res)=>{
 const {mode,confirmation}=req.body??{};
 if(!resetModes.includes(mode)||confirmation!=='LEEGMAKEN')return res.status(400).json({error:'Bevestig de gekozen actie met LEEGMAKEN.'});
 try{
  const result=resetDatabase(db,mode,()=>db.prepare('INSERT INTO Gebruiker (Gebruikersnaam,Wachtwoord,Voornaam,Achternaam,Toegangsniveau) VALUES (?,?,?,?,0)').run('Superuser',hashPassword('4321'),'Super','User'),syncStatusHistory);
  if(result.logout)res.clearCookie('cad_session',cookieOptions);
  res.json(result);
 }catch(e){res.status(500).json({error:'Database leegmaken mislukt: '+e.message});}
});

// Import only the known data columns; never execute SQL from an uploaded database.
db.exec(`CREATE TABLE IF NOT EXISTS Polygoon (PolygoonID INTEGER PRIMARY KEY AUTOINCREMENT, Locatie TEXT NOT NULL CHECK(length(trim(Locatie)) BETWEEN 1 AND 200), Geometrie TEXT NOT NULL)`);
app.get('/api/polygonen-import',management,(req,res)=>res.json({aantal:db.prepare('SELECT count(*) AS n FROM Polygoon').get().n}));
app.post('/api/polygonen-import',management,express.raw({type:'application/octet-stream',limit:'32mb'}),(req,res)=>{
 let source;
 try{
  if(!Buffer.isBuffer(req.body)||req.body.subarray(0,16).toString()!=='SQLite format 3\0')throw Error('Selecteer een geldig SQLite-bestand.');
  source=new Database(req.body,{readonly:true});
  source.pragma('trusted_schema = OFF');
  const table=source.prepare("SELECT type,sql FROM sqlite_master WHERE name='Polygoon'").get();
  if(table?.type!=='table'||!/^CREATE TABLE\s/i.test(table.sql||''))throw Error('Tabel Polygoon ontbreekt of is ongeldig.');
  const rows=source.prepare('SELECT PolygoonID, Locatie, Geometrie FROM Polygoon LIMIT 100001').all();
  if(!rows.length||rows.length>100000)throw Error('Ongeldig aantal polygonen.');
  for(const r of rows){
   if(!Number.isSafeInteger(r.PolygoonID)||r.PolygoonID<1||typeof r.Locatie!=='string'||!r.Locatie.trim()||r.Locatie.trim().length>200||typeof r.Geometrie!=='string')throw Error('Ongeldige polygoon.');
   const g=JSON.parse(r.Geometrie);if(!['Polygon','MultiPolygon'].includes(g?.type)||!Array.isArray(g.coordinates)||!g.coordinates.length)throw Error('Ongeldige geometrie.');
  }
  const insert=db.prepare('INSERT INTO Polygoon (PolygoonID,Locatie,Geometrie) VALUES (?,?,?)');
  db.transaction(()=>{db.exec('DELETE FROM Polygoon');for(const r of rows)insert.run(r.PolygoonID,r.Locatie,r.Geometrie);})();
  res.json({aantal:rows.length});
 }catch(e){res.status(400).json({error:'Import mislukt. Bestaande polygonen blijven behouden. '+e.message});}finally{if(source)source.close();}
});
app.use('/api/polygonen-import',(err,req,res,next)=>res.status(err.status||400).json({error:'Bestand te groot of onleesbaar.'}));
const userColumns='ID,Gebruikersnaam,Voornaam,Achternaam,Telefoon,Email,Toegangsniveau,Kleurpalet,Audio';
const userGet=id=>db.prepare(`SELECT ${userColumns} FROM Gebruiker WHERE ID=?`).get(id);
function userData(b,create){
 if(!b||typeof b!=='object'||Object.hasOwn(b,'ID'))throw Error('ID wordt automatisch bepaald.');
 for(const k of ['Gebruikersnaam','Voornaam','Achternaam'])if(typeof b[k]!=='string'||!b[k].trim()||b[k].length>200)throw Error('Controleer '+k+'.');
 for(const k of ['Telefoon','Email'])if(b[k]!=null&&(typeof b[k]!=='string'||b[k].length>250))throw Error('Controleer '+k+'.');
 if(![0,1,2,3].includes(b.Toegangsniveau))throw Error('Ongeldig toegangsniveau.');
 if(typeof b.Wachtwoord!=='string'||b.Wachtwoord.length>256||((create||b.Wachtwoord!=='')&&b.Wachtwoord.length<8))throw Error('Gebruik minimaal 8 tekens voor een nieuw wachtwoord.');
 return [b.Gebruikersnaam.trim(),b.Voornaam.trim(),b.Achternaam.trim(),b.Telefoon?.trim()||null,b.Email?.trim()||null,b.Toegangsniveau];
}
function userError(res,e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'Gebruikersnaam is al in gebruik.'});if(e.code){console.error(e);return res.status(500).json({error:'Opslaan mislukt.'});}return res.status(400).json({error:e.message});}
const pagerPath=root+'data/pager-config.json';
const pagerDefaults={URI:'',Poort:null,Gebruikersnaam:'',Wachtwoord:'',TXGroep:''};
function savePagerConfig(config){const tmp=pagerPath+'.'+randomBytes(8).toString('hex')+'.tmp';writeFileSync(tmp,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});renameSync(tmp,pagerPath);}
if(!existsSync(pagerPath))savePagerConfig(pagerDefaults);
chmodSync(pagerPath,0o600);
function readPagerConfig(){return JSON.parse(readFileSync(pagerPath,'utf8'));}
app.get('/api/pager-config',management,(req,res)=>{const c=readPagerConfig();res.json({...c,Wachtwoord:'',HeeftWachtwoord:!!c.Wachtwoord});});
app.put('/api/pager-config',management,(req,res)=>{
 const b=req.body;if(!b||['URI','Gebruikersnaam','Wachtwoord','TXGroep'].some(k=>typeof b[k]!=='string'||b[k].length>2048)||!(b.Poort===null||Number.isInteger(b.Poort)&&b.Poort>=1&&b.Poort<=65535))return res.status(400).json({error:'Ongeldige pagerinstellingen.'});
 const old=readPagerConfig();savePagerConfig({URI:b.URI.trim(),Poort:b.Poort,Gebruikersnaam:b.Gebruikersnaam.trim(),Wachtwoord:b.Wachtwoord||old.Wachtwoord,TXGroep:b.TXGroep.trim()});res.json({ok:true});
});
const pagerLogPath=root+'data/pager-http.log';
if(existsSync(pagerLogPath))chmodSync(pagerLogPath,0o600);
const alarmPending=new Set();
app.post('/api/meldingen/:id/alarmeren',async(req,res)=>{
 const id=Number(req.params.id),{IDs, Tekst}=req.body??{};
 if(!Number.isSafeInteger(id)||!Array.isArray(IDs)||!IDs.length||IDs.length>500||IDs.some(v=>!Number.isSafeInteger(v)||v<1)||new Set(IDs).size!==IDs.length||typeof Tekst!=='string'||Tekst.trim().length<4||Tekst.length>3000)return res.status(400).json({error:'Ongeldige eenheden of alarmeringstekst.'});
 const m=db.prepare('SELECT Status FROM Melding WHERE ID=?').get(id);
 if(!m||m.Status!=='Open')return res.status(409).json({error:'Melding is niet open.'});
 if(alarmPending.has(id))return res.status(409).json({error:'Er loopt al een alarmering voor deze melding.'});
 const units=IDs.map(v=>db.prepare('SELECT Pager,TactischeNaam,GekoppeldeMelding FROM Eenheid WHERE ID=?').get(v));
 if(units.some(u=>!u||u.GekoppeldeMelding!==id))return res.status(409).json({error:'Niet alle eenheden zijn nog gekoppeld.'});
 const skipped=units.filter(u=>!u.Pager?.trim()).map(u=>u.TactischeNaam);
 const eligible=units.filter(u=>u.Pager?.trim());
 if(!eligible.length)return res.status(400).json({code:'PAGER_CODE_MISSING',error:'De volgende eenheden konden niet worden gealarmeerd omdat de koppeling met een pagercode ontbreekt: '+units.filter(u=>!u.Pager?.trim()).map(u=>u.TactischeNaam).join(', ')+'. Er is geen alarmering verzonden.'});
 let request;try{request=pagerRequest(readPagerConfig(),Tekst.trim(),eligible.map(u=>u.Pager));}catch(e){return res.status(400).json({error:'Controleer de pagerinstellingen.'});}
 alarmPending.add(id);
 try{const status=await sendPager(request,pagerLogPath,{requestID:randomBytes(12).toString('hex'),meldingID:id,gebruiker:req.gebruiker.Gebruikersnaam});res.json({ok:true,status,skipped});}catch(e){res.status(502).json({error:e.code?'Pagerlog kon niet worden geschreven. Controleer de verzending.':e.message});}finally{alarmPending.delete(id);}
});
app.get('/api/gebruikers',(req,res)=>res.json(req.gebruiker.Toegangsniveau<=1?db.prepare(`SELECT ${userColumns} FROM Gebruiker ORDER BY Gebruikersnaam`).all():[userGet(req.gebruiker.ID)]));
app.patch('/api/eigen-wachtwoord',(req,res)=>{const b=req.body;if(!b||Object.keys(b).length!==1||typeof b.Wachtwoord!=='string'||b.Wachtwoord.length<8||b.Wachtwoord.length>256)return res.status(400).json({error:'Wachtwoord: 8 tot 256 tekens.'});db.transaction(()=>{db.prepare('UPDATE Gebruiker SET Wachtwoord=? WHERE ID=?').run(hashPassword(b.Wachtwoord),req.gebruiker.ID);db.prepare('DELETE FROM Sessie WHERE GebruikerID=? AND Token<>?').run(req.gebruiker.ID,digest(token(req)));})();res.json({ok:true});});
app.post('/api/gebruikers',management,(req,res)=>{try{
 const v=userData(req.body,true);if(req.gebruiker.Toegangsniveau>v[5])return res.status(403).json({error:'Dit niveau mag je niet toekennen.'});
 const r=db.prepare('INSERT INTO Gebruiker (Gebruikersnaam,Voornaam,Achternaam,Telefoon,Email,Toegangsniveau,Wachtwoord) VALUES (?,?,?,?,?,?,?)').run(...v,hashPassword(req.body.Wachtwoord));res.status(201).json(userGet(r.lastInsertRowid));
}catch(e){userError(res,e);}});
app.patch('/api/gebruikers/:id',management,(req,res)=>{try{
 const old=userGet(Number(req.params.id));if(!old)return res.status(404).json({error:'Gebruiker niet gevonden.'});const v=userData(req.body,false);
 if(req.gebruiker.Toegangsniveau>old.Toegangsniveau||req.gebruiker.Toegangsniveau>v[5])return res.status(403).json({error:'Onvoldoende rechten.'});
 if((old.ID===req.gebruiker.ID||old.Toegangsniveau===0)&&old.Toegangsniveau!==v[5])throw Error('Eigen toegangsniveau kan niet worden gewijzigd.');
 db.transaction(()=>{db.prepare('UPDATE Gebruiker SET Gebruikersnaam=?,Voornaam=?,Achternaam=?,Telefoon=?,Email=?,Toegangsniveau=? WHERE ID=?').run(...v,old.ID);if(req.body.Wachtwoord){db.prepare('UPDATE Gebruiker SET Wachtwoord=? WHERE ID=?').run(hashPassword(req.body.Wachtwoord),old.ID);db.prepare('DELETE FROM Sessie WHERE GebruikerID=? AND Token<>?').run(old.ID,digest(token(req)));}})();res.json(userGet(old.ID));
}catch(e){userError(res,e);}});
app.delete('/api/gebruikers/:id',management,(req,res)=>{const old=userGet(Number(req.params.id));if(!old)return res.status(404).json({error:'Gebruiker niet gevonden.'});if(req.gebruiker.Toegangsniveau>old.Toegangsniveau||old.ID===req.gebruiker.ID||old.Toegangsniveau===0)return res.status(403).json({error:'Deze gebruiker mag je niet verwijderen.'});db.prepare('DELETE FROM Gebruiker WHERE ID=?').run(old.ID);res.json({ok:true});});

app.get('/api/opschalingsniveaus',(req,res)=>res.json(Object.fromEntries(Object.entries(escalationTables).map(([kind,table])=>[kind,db.prepare(`SELECT ID,Naam FROM ${table} ORDER BY ID`).all()]))));
for(const [kind,table] of Object.entries(escalationTables)){
 const path='/api/opschalingsniveaus/'+kind;
 const nameOf=b=>{if(typeof b?.Naam!=='string'||!b.Naam.trim()||b.Naam.trim().length>150)throw Error('Controleer opschalingsniveau.');return b.Naam.trim();};
 const fail=(res,e)=>res.status(e.code==='SQLITE_CONSTRAINT_UNIQUE'?409:400).json({error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'Opschalingsniveau bestaat al.':e.message});
 app.post(path,management,(req,res)=>{try{const Naam=nameOf(req.body);const r=db.prepare(`INSERT INTO ${table}(Naam) VALUES (?)`).run(Naam);res.status(201).json({ID:Number(r.lastInsertRowid),Naam});}catch(e){fail(res,e);}});
 app.patch(path+'/:id',management,(req,res)=>{try{const Naam=nameOf(req.body),ID=Number(req.params.id);if(!db.prepare(`UPDATE ${table} SET Naam=? WHERE ID=?`).run(Naam,ID).changes)return res.status(404).json({error:'Niveau niet gevonden.'});res.json({ID,Naam});}catch(e){fail(res,e);}});
 app.delete(path+'/:id',management,(req,res)=>{if(!db.prepare(`DELETE FROM ${table} WHERE ID=?`).run(Number(req.params.id)).changes)return res.status(404).json({error:'Niveau niet gevonden.'});res.json({ok:true});});
}
app.get('/api/classificaties',(req,res)=>res.json(db.prepare('SELECT ID,Classificatie FROM Classificatie ORDER BY Classificatie').all()));
function className(b){if(!b||Object.hasOwn(b,'ID')||typeof b.Classificatie!=='string'||!b.Classificatie.trim()||b.Classificatie.length>150)throw Error('Controleer classificatie.');return b.Classificatie.trim();}
function classError(res,e){return res.status(e.code==='SQLITE_CONSTRAINT_UNIQUE'?409:400).json({error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'Classificatie bestaat al.':e.message});}
app.post('/api/classificaties',management,(req,res)=>{try{const c=className(req.body);const r=db.prepare('INSERT INTO Classificatie (Classificatie) VALUES (?)').run(c);res.status(201).json({ID:Number(r.lastInsertRowid),Classificatie:c});}catch(e){classError(res,e);}});
app.patch('/api/classificaties/:id',management,(req,res)=>{try{const c=className(req.body),old=db.prepare('SELECT * FROM Classificatie WHERE ID=?').get(Number(req.params.id));if(!old)return res.status(404).json({error:'Classificatie niet gevonden.'});db.transaction(()=>{db.prepare('UPDATE Classificatie SET Classificatie=? WHERE ID=?').run(c,old.ID);for(const m of db.prepare('SELECT * FROM Melding WHERE Classificatie=?').all(old.Classificatie)){db.prepare('UPDATE Melding SET Classificatie=? WHERE ID=?').run(c,m.ID);changedBy(m.ID,req.gebruiker);const [d,t]=now();db.prepare('INSERT INTO Logregel (MeldingID,MasterID,Datum,Tijd,Tekst,GebruikerID,Gebruikersnaam) VALUES (?,?,?,?,?,?,?)').run(m.ID,m.MasterID,d,t,`Classificatie hernoemd: ${old.Classificatie} → ${c}`,req.gebruiker.ID,req.gebruiker.Gebruikersnaam);}})();res.json({ID:old.ID,Classificatie:c});}catch(e){classError(res,e);}});
app.delete('/api/classificaties/:id',management,(req,res)=>{const old=db.prepare('SELECT * FROM Classificatie WHERE ID=?').get(Number(req.params.id));if(!old)return res.status(404).json({error:'Classificatie niet gevonden.'});if(db.prepare('SELECT ID FROM Melding WHERE Classificatie=? LIMIT 1').get(old.Classificatie))return res.status(409).json({error:'Classificatie is in gebruik.'});if(db.prepare('SELECT count(*) n FROM Classificatie').get().n<=1)return res.status(409).json({error:'Minimaal één classificatie behouden.'});db.prepare('DELETE FROM Classificatie WHERE ID=?').run(old.ID);res.json({ok:true});});
const polygonRows=()=>db.prepare('SELECT Locatie,Geometrie FROM Polygoon ORDER BY PolygoonID').all().map(r=>{try{return {...r,Geometrie:JSON.parse(r.Geometrie)};}catch{return r;}});
const withPolygon=(m,rows)=>m?{...m,PolygoonNaam:findPolygons(m.Longitude,m.Latitude,rows).join(', ')||null,...findPriorityPolygons(m.Longitude,m.Latitude,rows)}:m;
const get=id=>withPolygon(db.prepare('SELECT * FROM Melding WHERE ID=?').get(id),polygonRows());
const validMaster=(id,master)=>master===null||(Number.isSafeInteger(master)&&master>0&&master!==id&&!!db.prepare("SELECT ID FROM Melding WHERE ID=? AND MasterID IS NULL AND Status='Open'").get(master));
function validate(body,old=null){
 if(!body||typeof body!=='object')return 'Ongeldige invoer.';
 for(const [key,max,required] of [['Naam',200,false],['StraatHuisnummer',250,true],['Postcode',20,false],['Plaats',150,true],['Telefoon',50,false]]){
  if(typeof body[key]!=='string'||body[key].length>max||(required&&!body[key].trim()))return `Controleer veld ${key}.`;
 }
 if(!['Open','Gesloten'].includes(body.Status))return 'Ongeldige status.';
 if(!Number.isSafeInteger(body.Prioriteit)||(body.Prioriteit!==old?.Prioriteit&&!db.prepare('SELECT 1 FROM Prioriteit WHERE Prioriteit=?').get(body.Prioriteit)))return 'Kies een beschikbare prioriteit.';
 for(const table of Object.values(escalationTables)){if(typeof body[table]!=='string'||(body[table]!==old?.[table]&&!escalationExists(table,body[table])))return 'Ongeldige opschaling.';}
 if(!classExists(body.Classificatie))return 'Ongeldige classificatie.';
 if(!(body.MasterID===null||Number.isSafeInteger(body.MasterID)))return 'Ongeldige hoofdmelding.';
 return null;
}
function fields(body){return [body.Naam.trim(),body.StraatHuisnummer.trim(),body.Postcode.trim(),body.Plaats.trim(),body.Telefoon.trim(),body.Classificatie,body.Prioriteit];}
function now(){const p=Object.fromEntries(new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return [`${p.year}-${p.month}-${p.day}`,`${p.hour}:${p.minute}:${p.second}`];}
db.prepare("UPDATE Melding SET Status='Gesloten' WHERE MasterID IS NOT NULL AND Status='Open'").run();
app.get('/api/meldingen',(req,res)=>{
 const units=db.prepare('SELECT e.GekoppeldeMelding,e.TactischeNaam,s.StatusNaam AS Status FROM Eenheid e JOIN EenheidStatus s ON s.StatusID=e.StatusID WHERE e.GekoppeldeMelding IS NOT NULL ORDER BY e.TactischeNaam COLLATE NOCASE').all();
 const grouped=new Map();for(const u of units){if(!grouped.has(u.GekoppeldeMelding))grouped.set(u.GekoppeldeMelding,[]);grouped.get(u.GekoppeldeMelding).push(`${u.TactischeNaam} (${u.Status??'Onbekend'})`);}
 const polygons=polygonRows();
 res.json(db.prepare('SELECT * FROM Melding ORDER BY ID DESC').all().map(m=>({...withPolygon(m,polygons),EenhedenOverzicht:(grouped.get(m.ID)||[]).join(', ')})));
});
const insertLog=(id,date,time,text,u)=>db.prepare('INSERT INTO Logregel (MeldingID,Datum,Tijd,Tekst,MasterID,GebruikerID,Gebruikersnaam) VALUES (?,?,?,?,NULL,?,?)').run(id,date,time,text,u.ID,u.Gebruikersnaam);
const keys=[...velden,'Prioriteit','MasterID','Status','OpschalingMono','OpschalingMulti'];
const display=v=>v===null||v===''?'(leeg)':JSON.stringify(v);
function audit(old,m,date,time,u){
 const changes=keys.filter(k=>old[k]!==m[k]).map(k=>`${k}: ${display(old[k])} → ${display(m[k])}`);
 // Split long audit entries at field boundaries to respect existing database limits.
 let text='Melding gewijzigd:';
 for(const change of changes){if(text.length+change.length+1>3000){insertLog(m.ID,date,time,text,u);text='Melding gewijzigd (vervolg):';}text+='\n'+change;}
 if(changes.length)insertLog(m.ID,date,time,text,u);
}
function logText(body){const t=body?.Logtekst??'';return typeof t==='string'&&t.length<=3000?t.trim():null;}
app.post('/api/meldingen',async(req,res)=>{
 const body={...req.body,Classificatie:req.body?.Classificatie||(classExists('Dienstverlening')?'Dienstverlening':db.prepare('SELECT Classificatie FROM Classificatie ORDER BY ID LIMIT 1').get()?.Classificatie),Prioriteit:req.body?.Prioriteit??db.prepare('SELECT Prioriteit FROM Prioriteit ORDER BY Prioriteit DESC LIMIT 1').get()?.Prioriteit,MasterID:null,Status:'Open',OpschalingMono:'',OpschalingMulti:''},error=validate(body),tekst=logText(body);
 if(error||tekst===null)return res.status(400).json({error:error||'Ongeldige logtekst.'});
 if(body.MasterID!==null)return res.status(400).json({error:'Kies een open hoofdmelding.'});
 let coords=null;let geoError=null;const geoTrace={};const viaKaart=body.KaartLocatie&&validPoint(body.Latitude,body.Longitude);
 try{coords=viaKaart?{Latitude:body.Latitude,Longitude:body.Longitude}:await lookupAddress(body.StraatHuisnummer,body.Plaats,undefined,info=>Object.assign(geoTrace,info));}catch(e){geoError=e.message;}
 if(!db.prepare('SELECT 1 FROM Prioriteit WHERE Prioriteit=?').get(body.Prioriteit))return res.status(409).json({error:'Prioriteit inmiddels gewijzigd.'});
 if(!classExists(body.Classificatie))return res.status(409).json({error:'Classificatie inmiddels gewijzigd.'});
 const m=db.transaction(()=>{
  const [date,time]=now();
  const result=db.prepare('INSERT INTO Melding (Naam,StraatHuisnummer,Postcode,Plaats,Telefoon,Classificatie,Prioriteit,MasterID,Datum,Tijd,Status) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...fields(body),body.MasterID,date,time,body.MasterID===null?body.Status:'Gesloten');
  db.prepare('UPDATE Melding SET AangemaaktDoorID=?,AangemaaktDoor=? WHERE ID=?').run(req.gebruiker.ID,req.gebruiker.Gebruikersnaam,result.lastInsertRowid);changedBy(result.lastInsertRowid,req.gebruiker);if(coords)db.prepare('UPDATE Melding SET Latitude=?,Longitude=? WHERE ID=?').run(coords.Latitude,coords.Longitude,result.lastInsertRowid);const m=get(result.lastInsertRowid);if(tekst)insertLog(m.ID,date,time,tekst,req.gebruiker);
  insertLog(m.ID,date,time,'Melding aangemaakt.',req.gebruiker);if(geoError)insertLog(m.ID,date,time,'Adreszoekdienst: coördinaten niet opgehaald ('+geoError.slice(0,250)+').',req.gebruiker);return m;
 })();try{writeGeoLog(root,{MeldingID:m.ID,Plaats:body.Plaats,Adres:body.StraatHuisnummer,Bron:viaKaart?'Kaart':'Adreszoekdienst',Zoekprompt:geoTrace.query??null,Zoekresultaat:geoTrace.results??null,Latitude:coords?.Latitude??null,Longitude:coords?.Longitude??null,Fout:geoError});}catch(e){console.error('Geocodinglog schrijven mislukt:',e.message);}res.status(201).json(m);
});
app.patch('/api/meldingen/:id',(req,res)=>{
 const id=Number(req.params.id),old=get(id);
 if(!old)return res.status(404).json({error:'Melding niet gevonden.'});
 if(old.Status==='Gesloten'){if(req.gebruiker.Toegangsniveau>2||old.MasterID!==null||req.body?.Status!=='Open'||req.body?.Basis?.Status!=='Gesloten'||logText(req.body)!=='')return res.status(409).json({error:'Heropenen niet toegestaan.'});const updated=db.transaction(()=>{db.prepare("UPDATE Melding SET Status='Open' WHERE ID=?").run(id);changedBy(id,req.gebruiker);const m=get(id);audit(old,m,...now(),req.gebruiker);return m;})();return res.json(updated);}
 const body=req.body,tekst=logText(body);
 if(tekst===null)return res.status(400).json({error:'Ongeldige logtekst.'});
 // Only apply explicitly edited fields; untouched forms can append logs without overwriting concurrent edits.
 const base=body.Basis;
 if(!base||typeof base!=='object')return res.status(400).json({error:'Herlaad de melding voordat je opslaat.'});
 if(body.MasterID!==base.MasterID)return res.status(400).json({error:'Gebruik Koppel melding.'});
 const proposed={...old};
 for(const k of keys){
  if(!Object.hasOwn(body,k)&&!Object.hasOwn(base,k))continue;
  if(body[k]!==base[k]){if(old[k]!==base[k]&&old[k]!==body[k])return res.status(409).json({error:`${k} is inmiddels gewijzigd. Herlaad de melding.`});proposed[k]=body[k];}
 }
 if(proposed.MasterID!==null)proposed.Status='Gesloten';
 const mapChanged=body.KaartLocatie===true&&validPoint(body.Latitude,body.Longitude);
 if(mapChanged&&((old.StraatHuisnummer!==base.StraatHuisnummer&&old.StraatHuisnummer!==body.StraatHuisnummer)||(old.Plaats!==base.Plaats&&old.Plaats!==body.Plaats)||(old.Latitude!==base.Latitude&&old.Latitude!==body.Latitude)||(old.Longitude!==base.Longitude&&old.Longitude!==body.Longitude)))return res.status(409).json({error:"Locatie inmiddels gewijzigd. Herlaad de melding."});
 const changed=keys.some(k=>proposed[k]!==old[k]);
 if(changed){const error=validate(proposed,old);if(error)return res.status(400).json({error});}
 if(proposed.MasterID!==old.MasterID&&!validMaster(id,proposed.MasterID))return res.status(400).json({error:'Kies een andere open hoofdmelding.'});
 if(proposed.MasterID!==null&&db.prepare('SELECT ID FROM Melding WHERE MasterID=? LIMIT 1').get(id))return res.status(409).json({error:'Een hoofdmelding met gekoppelde meldingen kan niet worden gekoppeld.'});
 const m=db.transaction(()=>{
  const [date,time]=now();
  if(changed)db.prepare('UPDATE Melding SET Naam=?,StraatHuisnummer=?,Postcode=?,Plaats=?,Telefoon=?,Classificatie=?,Prioriteit=?,MasterID=?,Status=?,OpschalingMono=?,OpschalingMulti=? WHERE ID=?').run(...fields(proposed),proposed.MasterID,proposed.Status,proposed.OpschalingMono,proposed.OpschalingMulti,id);
  if(proposed.StraatHuisnummer!==old.StraatHuisnummer||proposed.Plaats!==old.Plaats)db.prepare('UPDATE Melding SET RD_X=NULL,RD_Y=NULL,Latitude=NULL,Longitude=NULL WHERE ID=?').run(id);
  if(mapChanged){db.prepare("UPDATE Melding SET Latitude=?,Longitude=?,RD_X=NULL,RD_Y=NULL WHERE ID=?").run(body.Latitude,body.Longitude,id);insertLog(id,date,time,"Locatie via kaart gewijzigd.",req.gebruiker);}
  if(changed||mapChanged)changedBy(id,req.gebruiker);const m=get(id);if(tekst)insertLog(id,date,time,tekst,req.gebruiker);audit(old,m,date,time,req.gebruiker);if(m.Status==='Gesloten')unlinkClosedUnits(id,req.gebruiker,date,time);return m;
 })();res.json(m);
});
app.post('/api/meldingen/:id/koppel',(req,res)=>{
 const id=Number(req.params.id),master=req.body?.MasterID;
 const result=db.transaction(()=>{
  const old=get(id);
  if(!old)return {code:404,error:'Melding niet gevonden.'};
  if(old.Status!=='Open'||old.MasterID!==null)return {code:409,error:'Alleen open zelfstandige meldingen kunnen worden gekoppeld.'};
  if(master===null||!validMaster(id,master))return {code:400,error:'Kies een andere open hoofdmelding.'};
  if(db.prepare('SELECT ID FROM Melding WHERE MasterID=? LIMIT 1').get(id))return {code:409,error:'Een hoofdmelding met gekoppelde meldingen kan niet worden gekoppeld.'};
  const [date,time]=now();
  insertLog(id,date,time,`Melding gekoppeld aan hoofdmelding ID ${master}. Status: Open → Gesloten.`,req.gebruiker);
  db.prepare("UPDATE Melding SET MasterID=?,Status='Gesloten' WHERE ID=?").run(master,id);
  changedBy(id,req.gebruiker);
  unlinkClosedUnits(id,req.gebruiker,date,time);
  db.prepare('UPDATE Logregel SET MasterID=? WHERE MeldingID=? AND MasterID IS NULL').run(master,id);
  return {melding:get(id)};
 }).immediate();
 if(result.error)return res.status(result.code).json({error:result.error});
 res.json(result.melding);
});
app.patch('/api/meldingen/:id/status',(req,res)=>{
 const id=Number(req.params.id),status=req.body?.Status;
 if(!Number.isSafeInteger(id)||!['Open','Gesloten'].includes(status))return res.status(400).json({error:'Ongeldige ID of status.'});
 const m=get(id);if(!m)return res.status(404).json({error:'Melding niet gevonden.'});
 if(m.Status==='Gesloten'&&(req.gebruiker.Toegangsniveau>2||status!=='Open'||m.MasterID!==null))return res.status(409).json({error:'Heropenen niet toegestaan.'});
 if(status==='Open'&&m.MasterID!==null)return res.status(409).json({error:'Ontkoppel de melding voordat je deze heropent.'});
 const updated=db.transaction(()=>{db.prepare('UPDATE Melding SET Status=? WHERE ID=?').run(status,id);if(m.Status!==status)changedBy(id,req.gebruiker);const updated=get(id);const [date,time]=now();audit(m,updated,date,time,req.gebruiker);if(status==='Gesloten')unlinkClosedUnits(id,req.gebruiker,date,time);return updated;})();res.json(updated);
});
app.get('/api/meldingen/:id/logregels',(req,res)=>{
 const id=Number(req.params.id);if(!Number.isSafeInteger(id)||!get(id))return res.status(404).json({error:'Melding niet gevonden.'});
 res.json(db.prepare('SELECT * FROM Logregel WHERE MeldingID=? OR MasterID=? ORDER BY LogID DESC').all(id,id));
});
// Eenheden and immutable audit trail. No foreign key to deleted units/users in history.
db.transaction(()=>{
 db.exec(`CREATE TABLE IF NOT EXISTS EenheidStatus (StatusID INTEGER PRIMARY KEY, Status TEXT);
 CREATE TABLE IF NOT EXISTS Eenheid (ID INTEGER PRIMARY KEY AUTOINCREMENT, TactischeNaam TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(TactischeNaam))>0), Omschrijving TEXT, Locatie TEXT, StatusID INTEGER NOT NULL DEFAULT 0 REFERENCES EenheidStatus(StatusID) CHECK(StatusID IN (0,1,2,4,5)), Pager TEXT);
 CREATE TABLE IF NOT EXISTS EenhedenLog (LogID INTEGER PRIMARY KEY AUTOINCREMENT, EenheidID INTEGER NOT NULL, Tijdstempel TEXT NOT NULL, GebruikerID INTEGER NOT NULL, Gebruikersnaam TEXT NOT NULL, Wijziging TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_eenhedenlog ON EenhedenLog(EenheidID,LogID);
 CREATE TRIGGER IF NOT EXISTS eenhedenlog_no_update BEFORE UPDATE ON EenhedenLog BEGIN SELECT RAISE(ABORT,'Log is onveranderlijk'); END;
 CREATE TRIGGER IF NOT EXISTS eenhedenlog_no_delete BEFORE DELETE ON EenhedenLog BEGIN SELECT RAISE(ABORT,'Log is onveranderlijk'); END;`);
 if(!freshDatabase&&!db.prepare('PRAGMA table_info(EenheidStatus)').all().some(c=>c.name==='StatusNummer')){ const seed=db.prepare('INSERT OR IGNORE INTO EenheidStatus VALUES (?,?)');
 for(const [id,status] of ['Buiten dienst','Uitruk','Ter plaatse',null,'Inzetbaar','Op post',null,null,null,null].entries())seed.run(id,status); }
})();
if(!db.prepare('PRAGMA table_info(Eenheid)').all().some(c=>c.name==='GekoppeldeMelding')) db.exec('ALTER TABLE Eenheid ADD COLUMN GekoppeldeMelding INTEGER REFERENCES Melding(ID)');
db.exec('CREATE INDEX IF NOT EXISTS idx_eenheid_melding ON Eenheid(GekoppeldeMelding)');
db.exec(`CREATE TABLE IF NOT EXISTS "Logboek eenheden" (LogID INTEGER PRIMARY KEY AUTOINCREMENT, Eenheid TEXT NOT NULL, MeldingID INTEGER, MeldingAdres TEXT, MeldingPlaats TEXT, MeldingPrio INTEGER, MeldingOpschalingMono TEXT, MeldingOpschalingMulti TEXT, Status1 TEXT, Status2 TEXT, Status3 TEXT, Status4 TEXT, Status5 TEXT, Status6 TEXT, Status7 TEXT, Status8 TEXT, Status9 TEXT, Status0 TEXT);
CREATE TRIGGER IF NOT EXISTS unit_history_no_update BEFORE UPDATE ON "Logboek eenheden" BEGIN SELECT RAISE(ABORT,'Log is onveranderlijk'); END;
CREATE TRIGGER IF NOT EXISTS unit_history_no_delete BEFORE DELETE ON "Logboek eenheden" BEGIN SELECT RAISE(ABORT,'Log is onveranderlijk'); END;`);
// Preserve legacy IDs and historical columns; migrate only once.
if(!db.prepare('PRAGMA table_info(EenheidStatus)').all().some(c=>c.name==='StatusNummer')){
 db.pragma('foreign_keys = OFF');try{db.transaction(()=>{
 db.exec(`DROP TRIGGER IF EXISTS unit_status_history;
 CREATE TABLE StatusNieuw (StatusID INTEGER PRIMARY KEY AUTOINCREMENT, StatusNummer INTEGER NOT NULL UNIQUE, StatusNaam TEXT NOT NULL);
 INSERT INTO StatusNieuw SELECT StatusID,StatusID,Status FROM EenheidStatus WHERE Status IS NOT NULL;
 DROP TABLE EenheidStatus; ALTER TABLE StatusNieuw RENAME TO EenheidStatus;
 CREATE TABLE EenheidNieuw (ID INTEGER PRIMARY KEY AUTOINCREMENT,TactischeNaam TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(TactischeNaam))>0),Omschrijving TEXT,Locatie TEXT,StatusID INTEGER NOT NULL REFERENCES EenheidStatus(StatusID),Pager TEXT,GekoppeldeMelding INTEGER REFERENCES Melding(ID));
 INSERT INTO EenheidNieuw SELECT ID,TactischeNaam,Omschrijving,Locatie,StatusID,Pager,GekoppeldeMelding FROM Eenheid;
 DROP TABLE Eenheid; ALTER TABLE EenheidNieuw RENAME TO Eenheid;
 CREATE INDEX idx_eenheid_melding ON Eenheid(GekoppeldeMelding);`);
 if(db.pragma('foreign_key_check').length)throw Error('Statusmigratie: ongeldige verwijzingen');
 })();}finally{db.pragma('foreign_keys = ON');}
}
const statusRows=()=>db.prepare('SELECT StatusID,StatusNummer,StatusNaam,StatusNaam AS Status FROM EenheidStatus ORDER BY StatusNummer').all();
const statusNum=id=>db.prepare('SELECT StatusNummer FROM EenheidStatus WHERE StatusID=?').get(id)?.StatusNummer;
const statusByNum=n=>db.prepare('SELECT StatusID FROM EenheidStatus WHERE StatusNummer=?').get(n)?.StatusID;
const statusLabel=id=>db.prepare('SELECT StatusNummer,StatusNaam FROM EenheidStatus WHERE StatusID=?').get(id);
const quoteIdent=v=>'"'+v.replaceAll('"','""')+'"';
function syncStatusHistory(){
 const columns=new Set(db.prepare('PRAGMA table_info("Logboek eenheden")').all().map(c=>c.name.toLowerCase()));
 const rows=statusRows().map(r=>({...r,col:`${r.StatusNummer} ${r.StatusNaam} (${r.StatusID})`}));
 for(const r of rows)if(!columns.has(r.col.toLowerCase()))db.exec(`ALTER TABLE "Logboek eenheden" ADD COLUMN ${quoteIdent(r.col)} TEXT`);
 db.exec('DROP TRIGGER IF EXISTS unit_status_history');
 const extra=rows.map(r=>','+quoteIdent(r.col)).join('');
 const values=rows.map(r=>`,CASE WHEN NEW.StatusID=${r.StatusID} THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END`).join('');
 db.exec(`CREATE TRIGGER unit_status_history AFTER UPDATE OF StatusID ON Eenheid WHEN OLD.StatusID IS NOT NEW.StatusID BEGIN
 INSERT INTO "Logboek eenheden" (Eenheid,MeldingID,MeldingAdres,MeldingPlaats,MeldingPrio,MeldingOpschalingMono,MeldingOpschalingMulti${extra})
 SELECT NEW.TactischeNaam,COALESCE(OLD.GekoppeldeMelding,NEW.GekoppeldeMelding),m.StraatHuisnummer,m.Plaats,m.Prioriteit,m.OpschalingMono,m.OpschalingMulti${values}
 FROM (SELECT 1) LEFT JOIN Melding m ON m.ID=COALESCE(OLD.GekoppeldeMelding,NEW.GekoppeldeMelding); END;`);
}
db.transaction(syncStatusHistory)();
function statusData(b){if(!Number.isSafeInteger(b?.StatusNummer)||b.StatusNummer<0||typeof b.StatusNaam!=='string'||!b.StatusNaam.trim()||b.StatusNaam.length>100||/[\x00-\x1f]/.test(b.StatusNaam))throw Error('Ongeldige status.');return [b.StatusNummer,b.StatusNaam.trim()];}
for(const method of ['post','patch','delete'])app[method]('/api/statusbeheer'+(method==='post'?'':'/:id'),management,(req,res)=>{try{db.transaction(()=>{const id=Number(req.params.id);if(method==='post')db.prepare('INSERT INTO EenheidStatus(StatusNummer,StatusNaam) VALUES (?,?)').run(...statusData(req.body));else{if(!statusLabel(id))throw Error('Status niet gevonden.');if(method==='delete'){if(db.prepare('SELECT 1 FROM Eenheid WHERE StatusID=?').get(id))throw Error('Status is in gebruik.');db.prepare('DELETE FROM EenheidStatus WHERE StatusID=?').run(id);}else db.prepare('UPDATE EenheidStatus SET StatusNummer=?,StatusNaam=? WHERE StatusID=?').run(...statusData(req.body),id);}syncStatusHistory();})();res.json(statusRows());}catch(e){res.status(400).json({error:e.message});}});
const unitGet=id=>db.prepare('SELECT * FROM Eenheid WHERE ID=?').get(id);
const unitFields=['TactischeNaam','Omschrijving','Locatie','StatusID','Pager'];
function unitData(body){
 if(!body||Object.keys(body).some(k=>!unitFields.includes(k)))throw Error('Ongeldige velden.');
 if(typeof body.TactischeNaam!=='string'||!body.TactischeNaam.trim()||body.TactischeNaam.length>150)throw Error('Tactische naam is verplicht (max. 150 tekens).');
 const data={TactischeNaam:body.TactischeNaam.trim(),StatusID:body.StatusID??statusByNum(0)??statusRows()[0]?.StatusID};
 for(const k of ['Omschrijving','Locatie','Pager']){const v=body[k]??'';if(typeof v!=='string'||v.length>1000)throw Error('Ongeldige '+k);data[k]=v.trim()||null;}
 unitStatus(data.StatusID);return data;
}
function unitStatus(id){if(!Number.isInteger(id)||!db.prepare('SELECT StatusID FROM EenheidStatus WHERE StatusID=?').get(id))throw Error('Ongeldige status.');return id;}
function unitAudit(id,u,change){db.prepare('INSERT INTO EenhedenLog (EenheidID,Tijdstempel,GebruikerID,Gebruikersnaam,Wijziging) VALUES (?,?,?,?,?)').run(id,new Date().toISOString(),u.ID,u.Gebruikersnaam,JSON.stringify(change));}
function shouldUnlink(old,status){return old.GekoppeldeMelding!==null&&[1,2].includes(statusNum(old.StatusID))&&[4,5].includes(statusNum(status));}
function unlinkClosedUnits(id,u,date,time){
 for(const old of db.prepare('SELECT ID,TactischeNaam FROM Eenheid WHERE GekoppeldeMelding=?').all(id)){
  db.prepare('UPDATE Eenheid SET GekoppeldeMelding=NULL WHERE ID=?').run(old.ID);
  unitAudit(old.ID,u,{Actie:'Losgekoppeld',Wijzigingen:{GekoppeldeMelding:{Oud:id,Nieuw:null}}});
  insertLog(id,date,time,`Eenheid ${old.TactischeNaam} losgekoppeld wegens sluiten melding.`,u);
 }
}
function logUnitStatus(old,status,unlink,u){
 if(old.GekoppeldeMelding===null||old.StatusID===status)return;
 const label=n=>statusLabel(n)?.StatusNaam;
 const [date,time]=now(),id=old.GekoppeldeMelding;
 insertLog(id,date,time,`Eenheid ${old.TactischeNaam}: status ${statusNum(old.StatusID)} (${label(old.StatusID)}) → ${statusNum(status)} (${label(status)}).${unlink?' Eenheid losgekoppeld van melding.':''}`,u);
 changedBy(id,u);
}
function unitError(res,e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'Tactische naam bestaat al.'});if(e.code){console.error(e);return res.status(500).json({error:'Eenheid kon niet worden opgeslagen.'});}return res.status(400).json({error:e.message});}
app.get('/api/meldingen/:id/polygonen',(req,res)=>{const m=get(Number(req.params.id));if(!m)return res.status(404).json({error:'Melding niet gevonden.'});res.set('Cache-Control','no-store').json({PolygoonP1:m.PolygoonP1,PolygoonP2:m.PolygoonP2,PolygoonP3:m.PolygoonP3});});
app.get('/api/meldingen/:id/eenheden',(req,res)=>{
 const id=Number(req.params.id);if(!get(id))return res.status(404).json({error:'Melding niet gevonden.'});
 res.json(db.prepare('SELECT e.ID,e.TactischeNaam,e.Omschrijving,e.Locatie,e.StatusID,s.StatusNaam AS Status FROM Eenheid e LEFT JOIN EenheidStatus s ON s.StatusID=e.StatusID WHERE e.GekoppeldeMelding=? ORDER BY e.TactischeNaam COLLATE NOCASE').all(id));
});
app.get('/api/eenheden/beschikbaar',(req,res)=>res.json(db.prepare('SELECT ID,TactischeNaam,Omschrijving,Locatie,StatusID,(SELECT StatusNummer FROM EenheidStatus s WHERE s.StatusID=Eenheid.StatusID) AS StatusNummer FROM Eenheid WHERE StatusID IN (SELECT StatusID FROM EenheidStatus WHERE StatusNummer IN (4,5)) AND GekoppeldeMelding IS NULL ORDER BY TactischeNaam COLLATE NOCASE').all()));
app.post('/api/meldingen/:id/eenheden',(req,res)=>{
 const id=Number(req.params.id), ids=req.body?.IDs, original=req.body?.OriginalIDs;
 const valid=a=>Array.isArray(a)&&a.every(n=>Number.isSafeInteger(n)&&n>0)&&new Set(a).size===a.length;
 if(!valid(ids)||!valid(original))return res.status(400).json({error:'Ongeldige selectie.'});
 try{db.transaction(()=>{
  const m=get(id);if(!m||m.Status!=='Open')throw Error('Selecteer een open melding.');
  const current=db.prepare('SELECT * FROM Eenheid WHERE GekoppeldeMelding=?').all(id);
  const old=new Set(current.map(r=>r.ID)), desired=new Set(ids);
  if(old.size!==original.length||original.some(n=>!old.has(n)))throw Error('Koppelingen zijn intussen gewijzigd. Open het venster opnieuw.');
  const added=ids.filter(n=>!old.has(n)).map(unitGet), removed=current.filter(r=>!desired.has(r.ID));
  if(added.some(r=>!r||![4,5].includes(statusNum(r.StatusID))||r.GekoppeldeMelding!==null))throw Error('Een of meer eenheden zijn niet meer beschikbaar. Open het venster opnieuw.');
  const [date,time]=now();
  for(const [rows,link] of [[removed,false],[added,true]])for(const r of rows){
   const status=!link&&[1,2,4].includes(statusNum(r.StatusID))?(statusByNum(4)??r.StatusID):r.StatusID;
   const wijzigingen={GekoppeldeMelding:{Oud:link?null:id,Nieuw:link?id:null}};
   if(status!==r.StatusID)wijzigingen.StatusID={Oud:r.StatusID,Nieuw:status};
   db.prepare('UPDATE Eenheid SET GekoppeldeMelding=?,StatusID=? WHERE ID=?').run(link?id:null,status,r.ID);
   unitAudit(r.ID,req.gebruiker,{Actie:link?'Gekoppeld':'Losgekoppeld',Wijzigingen:wijzigingen});
   const statusLog=status!==r.StatusID?` Status: ${statusNum(r.StatusID)} (${statusLabel(r.StatusID)?.StatusNaam}) → ${statusNum(status)} (${statusLabel(status)?.StatusNaam}).`:'';
   insertLog(id,date,time,`Eenheid ${r.TactischeNaam} ${link?'gekoppeld aan':'losgekoppeld van'} melding.${statusLog}`,req.gebruiker);
  }
  if(added.length||removed.length)changedBy(id,req.gebruiker);
 })();res.json({ok:true});}catch(e){unitError(res,e);}
});
app.patch('/api/meldingen/:id/eenheden/:unitId/status',(req,res)=>{try{
 const id=Number(req.params.id),uid=Number(req.params.unitId),status=unitStatus(req.body?.StatusID);
 const row=db.transaction(()=>{
  const m=get(id),old=unitGet(uid);
  if(!m||m.Status!=='Open'||!old||old.GekoppeldeMelding!==id)throw Error('Eenheid is niet meer gekoppeld aan een open melding.');
  if(old.StatusID!==req.body?.OriginalStatusID)throw Error('Status is intussen gewijzigd. Open het venster opnieuw.');
  if(status===old.StatusID)return old;
  const unlink=shouldUnlink(old,status), changes={StatusID:{Oud:old.StatusID,Nieuw:status}};
  if(unlink)changes.GekoppeldeMelding={Oud:id,Nieuw:null};
  db.prepare('UPDATE Eenheid SET StatusID=?,GekoppeldeMelding=? WHERE ID=?').run(status,unlink?null:id,uid);
  unitAudit(uid,req.gebruiker,{Actie:'Gewijzigd',Wijzigingen:changes});
  logUnitStatus(old,status,unlink,req.gebruiker);return unitGet(uid);
 })();res.json(row);
}catch(e){unitError(res,e);}});
app.get('/api/eenheden/statussen',(req,res)=>res.json(statusRows()));
app.get('/api/eenheden',(req,res)=>res.json(db.prepare('SELECT * FROM Eenheid ORDER BY TactischeNaam COLLATE NOCASE').all()));
app.post('/api/eenheden',management,(req,res)=>{try{const data=unitData(req.body);const row=db.transaction(()=>{const r=db.prepare('INSERT INTO Eenheid (TactischeNaam,Omschrijving,Locatie,StatusID,Pager) VALUES (@TactischeNaam,@Omschrijving,@Locatie,@StatusID,@Pager)').run(data);const m=unitGet(r.lastInsertRowid);unitAudit(m.ID,req.gebruiker,{Actie:'Aangemaakt',Nieuw:m});return m;})();res.status(201).json(row);}catch(e){unitError(res,e);}});
app.patch('/api/eenheden/:id',(req,res)=>{try{const old=unitGet(Number(req.params.id));if(!old)return res.status(404).json({error:'Eenheid niet gevonden.'});const b=req.body;if(!b||Object.keys(b).some(k=>!unitFields.includes(k)))throw Error('Ongeldige velden.');if(req.gebruiker.Toegangsniveau>1&&Object.keys(b).some(k=>k!=='StatusID'))return res.status(403).json({error:'Alleen status wijzigen toegestaan.'});const data=unitData({...Object.fromEntries(unitFields.map(k=>[k,old[k]])),...b});const changes=Object.fromEntries(unitFields.filter(k=>old[k]!==data[k]).map(k=>[k,{Oud:old[k],Nieuw:data[k]}]));if(shouldUnlink(old,data.StatusID))changes.GekoppeldeMelding={Oud:old.GekoppeldeMelding,Nieuw:null};const row=db.transaction(()=>{if(Object.keys(changes).length){db.prepare('UPDATE Eenheid SET TactischeNaam=@TactischeNaam,Omschrijving=@Omschrijving,Locatie=@Locatie,StatusID=@StatusID,Pager=@Pager,GekoppeldeMelding=@GekoppeldeMelding WHERE ID=@ID').run({...data,ID:old.ID,GekoppeldeMelding:changes.GekoppeldeMelding?null:old.GekoppeldeMelding});unitAudit(old.ID,req.gebruiker,{Actie:'Gewijzigd',Wijzigingen:changes});logUnitStatus(old,data.StatusID,!!changes.GekoppeldeMelding,req.gebruiker);}return unitGet(old.ID);})();res.json(row);}catch(e){unitError(res,e);}});
app.delete('/api/eenheden/:id',management,(req,res)=>{try{const old=unitGet(Number(req.params.id));if(!old)return res.status(404).json({error:'Eenheid niet gevonden.'});db.transaction(()=>{unitAudit(old.ID,req.gebruiker,{Actie:'Verwijderd',Oud:old});db.prepare('DELETE FROM Eenheid WHERE ID=?').run(old.ID);})();res.json({ok:true});}catch(e){unitError(res,e);}});

app.use('/api',(req,res)=>res.status(404).json({error:'Onbekende API-route.'}));
app.use(express.static(root+'dist',{setHeaders:(res,path)=>{if(path.endsWith('.html'))res.setHeader('Cache-Control','no-cache');}}));
app.use((err,req,res,next)=>{console.error(err);res.status(err.status===400?400:500).json({error:'Verzoek kon niet worden verwerkt.'});});
app.listen(3000,'0.0.0.0',()=>console.log('CAD luistert op poort 3000'));
