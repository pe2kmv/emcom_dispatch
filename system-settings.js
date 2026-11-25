export function readSystem(db){return db.prepare('SELECT Organisatie,Taal,Titel FROM Systeeminstelling WHERE ID=1').get()??{Organisatie:'Meldkamer',Taal:'en',Titel:'EMCOM Dispatch'};}
export function initSystem(db){
 db.exec("CREATE TABLE IF NOT EXISTS Systeeminstelling (ID INTEGER PRIMARY KEY CHECK(ID=1), Organisatie TEXT NOT NULL CHECK(length(trim(Organisatie)) BETWEEN 1 AND 150))");
 if(!db.prepare('PRAGMA table_info(Systeeminstelling)').all().some(c=>c.name==='Taal'))db.exec("ALTER TABLE Systeeminstelling ADD COLUMN Taal TEXT NOT NULL DEFAULT 'en' CHECK(Taal IN ('nl','en'))");
 if(!db.prepare('PRAGMA table_info(Systeeminstelling)').all().some(c=>c.name==='Titel'))db.exec("ALTER TABLE Systeeminstelling ADD COLUMN Titel TEXT NOT NULL DEFAULT 'EMCOM Dispatch' CHECK(length(trim(Titel)) BETWEEN 1 AND 150)");

}
export function systemRoutes(app,db,management){
 initSystem(db);
 app.get('/api/systeem',management,(req,res)=>res.json(readSystem(db)));
 app.put('/api/systeem',management,(req,res)=>{const title=req.body?.Titel??readSystem(db).Titel;if(typeof title!=='string'||!title.trim()||title.trim().length>150)return res.status(400).json({error:'Voer een titel van 1 tot 150 tekens in.'});const name=req.body?.Organisatie,lang=req.body?.Taal??readSystem(db).Taal;if(typeof name!=='string'||!name.trim()||name.trim().length>150)return res.status(400).json({error:'Voer een organisatienaam van 1 tot 150 tekens in.'});if(!['nl','en'].includes(lang))return res.status(400).json({error:'Ongeldige taal.'});db.prepare('INSERT INTO Systeeminstelling (ID,Organisatie,Taal,Titel) VALUES (1,?,?,?) ON CONFLICT(ID) DO UPDATE SET Organisatie=excluded.Organisatie,Taal=excluded.Taal,Titel=excluded.Titel').run(name.trim(),lang,title.trim());res.json(readSystem(db));});
}
