import {appendFileSync} from 'node:fs';
export function pagerRequest(config,text,pagers){
 const url=new URL(config.URI);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!Number.isInteger(config.Poort)||config.Poort<1||config.Poort>65535||!config.Gebruikersnaam||!config.Wachtwoord||!config.TXGroep)throw Error('Controleer de pagerinstellingen (URI inclusief http:// of https://, poort en inloggegevens).');
 url.port=String(config.Poort);url.pathname='/calls';
 return {url:url.href,authorization:'Basic '+Buffer.from(config.Gebruikersnaam+':'+config.Wachtwoord).toString('base64'),body:{text,callSignNames:pagers,transmitterGroupNames:[config.TXGroep],emergency:false}};
}
export async function sendPager(request,logPath,context){
 const log=(data)=>appendFileSync(logPath,`${new Date().toISOString()} ${JSON.stringify({...context,...data})}\n`,{mode:0o600});
 log({event:'request',method:'POST',url:request.url,headers:{'Content-Type':'application/json',Authorization:'Basic [REDACTED]'},body:request.body});
 let response;
 try{response=await fetch(request.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:request.authorization},body:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch(e){log({event:'transport_error',error:e.name});throw Error('Geen bevestiging van de pagerserver. Controleer de verzending voordat u opnieuw alarmeert.');}
 try{log({event:'response',status:response.status});}catch(e){throw Error('Pagerserver antwoordde, maar logging is mislukt. Controleer de verzending voordat u opnieuw alarmeert.');}
 if(response.body)await response.body.cancel().catch(()=>{});
 if(!response.ok)throw Error(`Pagerserver geeft HTTP ${response.status}. Controleer de verzending voordat u opnieuw alarmeert.`);
 return response.status;
}
