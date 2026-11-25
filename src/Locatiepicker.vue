<script setup>
import {t} from "./i18n.js";
import {ref,onMounted,onUnmounted} from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const props=defineProps({api:Function,admin:Boolean,incident:Object});
const emit=defineEmits(['cancel','select']);
const host=ref(null),query=ref(''),country=ref('all'),results=ref([]),chosen=ref(null),error=ref(''),notice=ref(''),ready=ref(false),busy=ref(false);let map,marker,seq=0,dead=false;
function pin(lat,lon){if(!marker)marker=L.circleMarker([lat,lon],{radius:9,color:'#a51919',fillColor:'#f44336',fillOpacity:0.9}).addTo(map);else marker.setLatLng([lat,lon]);}
async function clickMap(e){const n=++seq;const {lat,lng}=e.latlng;pin(lat,lng);chosen.value=null;error.value='';notice.value='';busy.value=true;try{const r=await props.api(`/kaart/locatie?lat=${lat}&lon=${lng}`);if(n!==seq||dead)return;if(!r?.Plaats||!r?.StraatHuisnummer)throw Error('Geen adres bij deze locatie gevonden.');chosen.value={...r,Latitude:lat,Longitude:lng};}catch(e){if(n===seq)error.value=e.message;}finally{if(n===seq)busy.value=false;}}
async function search(){if(query.value.trim().length<2)return;const n=++seq;busy.value=true;error.value='';results.value=[];try{const r=await props.api('/kaart/zoeken?q='+encodeURIComponent(query.value.trim())+'&country='+country.value);if(n===seq){results.value=r;if(!r.length)error.value='Geen resultaten.';}}catch(e){if(n===seq)error.value=e.message;}finally{if(n===seq)busy.value=false;}}
function choose(r){++seq;busy.value=false;error.value='';chosen.value=r;pin(r.Latitude,r.Longitude);map.setView([r.Latitude,r.Longitude],17);}
async function saveDefault(){const p=map.getCenter();try{await props.api('/kaart/standaard',{method:'PUT',body:JSON.stringify({Latitude:p.lat,Longitude:p.lng,Zoom:map.getZoom()})});notice.value='Standaard kaart opgeslagen.';}catch(e){error.value=e.message;}}
async function centerIncident(){
 const street=String(props.incident?.StraatHuisnummer??'').trim(),place=String(props.incident?.Plaats??'').trim();
 if(!street||!place)return;
 query.value=`${street}, ${place}`;
 const n=++seq;busy.value=true;
 try{const r=await props.api('/kaart/zoeken?q='+encodeURIComponent(query.value)+'&country=all');
 if(dead||n!==seq)return;
 results.value=r;const first=r[0];
 if(!first||!Number.isFinite(first.Latitude)||!Number.isFinite(first.Longitude))throw Error('Geen locatie gevonden. Standaardkaart wordt getoond.');
 choose({...first,StraatHuisnummer:first.StraatHuisnummer||street,Plaats:first.Plaats||place});
 }catch(e){if(!dead&&n===seq)error.value=e.message;}finally{if(!dead&&n===seq)busy.value=false;}
}
onMounted(async()=>{try{const d=await props.api('/kaart/standaard');if(dead)return;map=L.map(host.value,{minZoom:2,maxZoom:19}).setView([d.Latitude,d.Longitude],d.Zoom);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>{error.value='Kaarttegels niet bereikbaar. Controleer internetverbinding.';});map.on('click',clickMap);ready.value=true;setTimeout(()=>map?.invalidateSize(),0);await centerIncident();}catch(e){error.value=e.message;}});
onUnmounted(()=>{dead=true;++seq;map?.remove();map=null;});
</script>
<template>
<div class="modal-backdrop" @keydown.esc.stop="emit('cancel')"><section class="panel map-picker" role="dialog" aria-modal="true" :aria-label="t('Kies locatie')"><h2>{{t("Kies locatie")}}</h2><div class="map-layout"><div ref="host" class="map-host"></div><aside class="map-sidebar"><form @submit.prevent="search"><select v-model="country" :aria-label="t('Land')"><option value="all">{{t("Nederland, België, Duitsland")}}</option><option value="nl">{{t("Nederland")}}</option><option value="be">{{t("België")}}</option><option value="de">{{t("Duitsland")}}</option></select><input v-model="query" :placeholder="t('Adres, straat of plaats')" :aria-label="t('Zoek kaartlocatie')"><button :disabled="!ready||busy||query.trim().length&lt;2">{{t("Zoeken")}}</button></form><p v-if="busy">{{t("Bezig…")}}</p><p v-if="error" class="error" role="alert">{{t(error)}}</p><p v-if="notice" role="status">{{t(notice)}}</p><button v-for="(r,i) in results" :key="i" class="secondary map-result" @click="choose(r)">{{r.label}}</button><p v-if="chosen"><strong>{{t("Geselecteerd")}}</strong><br>{{chosen.StraatHuisnummer}}<br>{{chosen.Plaats}}</p><p v-else>{{t("Klik op de kaart of kies een zoekresultaat.")}}</p></aside></div><div class="form-actions"><button v-if="admin" class="secondary map-default" :disabled="!ready" @click="saveDefault">{{t("Standaard kaart")}}</button><button class="secondary" @click="emit('cancel')">{{t("Annuleren")}}</button><button :disabled="busy||!chosen?.Plaats||!chosen?.StraatHuisnummer" @click="emit('select',chosen)">{{t("Locatie gebruiken")}}</button></div></section></div>
</template>
