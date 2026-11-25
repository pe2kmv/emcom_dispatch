<script setup>
import {t} from "./i18n.js";
import {ref,onMounted,onUnmounted} from 'vue';
const props=defineProps({api:{type:Function,required:true}});
const emit=defineEmits(['reset']);
const resetOpen=ref(false),mode=ref(''),confirmation=ref(''),resetBusy=ref(false),notice=ref('');
async function clearDatabase(){if(resetBusy.value||!mode.value||confirmation.value!=='LEEGMAKEN')return;resetBusy.value=true;error.value='';try{const result=await props.api('/database/leegmaken',{method:'POST',body:JSON.stringify({mode:mode.value,confirmation:confirmation.value})});resetOpen.value=false;emit('reset',result);if(!result.logout){await load();notice.value='Database leeggemaakt volgens de gekozen optie.';}}catch(e){error.value=e.message;}finally{resetBusy.value=false;}}
const tables=ref([]),selected=ref(''),data=ref(null),loading=ref(false),error=ref('');
let sequence=0;
async function load(page=0){const n=++sequence;data.value=null;error.value='';if(!selected.value)return;loading.value=true;try{const r=await props.api(`/database/tabellen/${encodeURIComponent(selected.value)}?page=${page}`);if(n===sequence)data.value=r;}catch(e){if(n===sequence)error.value=e.message;}finally{if(n===sequence)loading.value=false;}}
onMounted(async()=>{const n=++sequence;loading.value=true;try{const r=await props.api('/database/tabellen');if(n!==sequence)return;tables.value=r;selected.value=r[0]||'';if(selected.value)await load();}catch(e){if(n===sequence)error.value=e.message;}finally{if(n===sequence)loading.value=false;}});
onUnmounted(()=>{++sequence;});
</script>
<template>
<section class="panel database-panel">
<div class="toolbar"><h2>Database</h2><button class="secondary" :disabled="loading||resetBusy" @click="resetOpen=true;mode='';confirmation='';notice=''">{{t("Database leegmaken")}}</button></div>
<div v-if="resetOpen" class="panel" role="group" :aria-label="t('Database leegmaken')"><h3>{{t("Database leegmaken")}}</h3><p class="error">{{t("Deze actie is definitief. Maak eerst een back-up. Alle databaselogboeken worden gewist.")}}</p><label>{{t("Keuze")}}<select v-model="mode" :disabled="resetBusy"><option value="" disabled>{{t("Selecteer een optie")}}</option><option value="alles">{{t("Alles")}}</option><option value="gebruikers">{{t("Gebruikers behouden")}}</option><option value="meldingen">{{t("Meldingen")}}</option></select></label><p v-if="mode==='alles'">{{t("Alle gegevens verdwijnen. Alleen Superuser (4321) wordt opnieuw aangemaakt. Iedereen wordt uitgelogd.")}}</p><p v-if="mode==='gebruikers'">{{t("Gebruikers, eenheden en hun statustabel blijven behouden. Eenheden worden ontkoppeld en krijgen statusnummer 5. Iedereen wordt uitgelogd.")}}</p><p v-if="mode==='meldingen'">{{t("Meldingen en alle databaselogboeken verdwijnen. Eenheden worden ontkoppeld en krijgen statusnummer 5.")}}</p><label>{{t("Typ LEEGMAKEN ter bevestiging")}}<input v-model="confirmation" :disabled="resetBusy" autocomplete="off"/></label><div class="toolbar"><button class="secondary" :disabled="resetBusy" @click="resetOpen=false">{{t("Annuleren")}}</button><button :disabled="resetBusy||!mode||confirmation!=='LEEGMAKEN'" @click="clearDatabase">{{t("Definitief leegmaken")}}</button></div></div><p v-if="notice" role="status">{{t(notice)}}</p>
<div class="database-layout">
<aside><label>{{t("Tabel")}}<select v-model="selected" @change="load()" :disabled="!tables.length"><option v-if="!tables.length" value="">{{t("Geen tabellen")}}</option><option v-for="t in tables" :key="t" :value="t">{{t}}</option></select></label><button class="secondary" :disabled="loading||!selected" @click="load(data?.page??0)">{{t("Vernieuwen")}}</button></aside>
<div class="database-content"><p v-if="error" class="error" role="alert">{{t(error)}}</p><p v-if="loading" class="meta">{{t("Laden…")}}</p>
<template v-if="data"><div class="toolbar"><strong>{{selected}} · {{data.total}} records</strong><div class="database-paging"><button class="secondary" :disabled="data.page===0" @click="load(data.page-1)">{{t("Vorige")}}</button><span>{{t("Pagina")}} {{data.page+1}} / {{Math.max(1,Math.ceil(data.total/data.size))}}</span><button class="secondary" :disabled="(data.page+1)*data.size>=data.total" @click="load(data.page+1)">{{t("Volgende")}}</button></div></div>
<div class="database-scroll"><table><thead><tr><th v-for="c in data.columns" :key="c">{{c}}</th></tr></thead><tbody><tr v-for="(r,i) in data.rows" :key="i"><td v-for="(v,j) in r" :key="j"><span v-if="v===null" class="meta">NULL</span><span v-else>{{v}}</span></td></tr><tr v-if="!data.rows.length"><td :colspan="data.columns.length" class="empty">{{t("Geen records")}}</td></tr></tbody></table></div></template></div>
</div></section>
</template>
