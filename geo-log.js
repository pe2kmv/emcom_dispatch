import {mkdirSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
export function writeGeoLog(root,entry,now=new Date()){
 const dir=join(root,'log');mkdirSync(dir,{recursive:true,mode:0o700});
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const text=Object.entries({Tijdstempel:now.toISOString(),...entry}).map(([key,value])=>`${key}: ${JSON.stringify(value)}`).join('\n')+'\n\n';
 appendFileSync(join(dir,`geocoding-${day}.txt`),text,{mode:0o600});
}
