import {searchAddresses,validPoint} from './map-api.js';
export async function lookupAddress(street,place,search=searchAddresses, trace=()=>{}){
 const query=`${street.trim()}, ${place.trim()}`;
 trace({query});
 const results=await search(query,'all');
 trace({results});
 const selected=results[0];
 if(!selected||!validPoint(selected.Latitude,selected.Longitude))throw Error('Geen geldig eerste zoekresultaat gevonden.');
 return {Latitude:selected.Latitude,Longitude:selected.Longitude};
}
