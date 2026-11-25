<script setup>
import {t} from "./i18n.js";
import {reactive,onMounted} from 'vue';
const props=defineProps({api:Function});const emit=defineEmits(['changed']);
const groups=reactive([{kind:'mono',title:'Opschaling mono',rows:[],id:null,naam:'',busy:false,error:''},{kind:'multi',title:'Opschaling multi',rows:[],id:null,naam:'',busy:false,error:''}]);
async function load(){const r=await props.api('/opschalingsniveaus');for(const g of groups)g.rows=r[g.kind];}
function fresh(g){g.id=null;g.naam='';g.error='';}
function choose(g,r){g.id=r.ID;g.naam=r.Naam;g.error='';}
async function save(g){if(g.busy||!g.naam.trim())return;g.busy=true;g.error='';try{const r=await props.api('/opschalingsniveaus/'+g.kind+(g.id===null?'':'/'+g.id),{method:g.id===null?'POST':'PATCH',body:JSON.stringify({Naam:g.naam})});emit('changed');await load();fresh(g);}catch(e){g.error=e.message;}finally{g.busy=false;}}
async function remove(g){if(g.busy||g.id===null||!confirm(t('Opschalingsniveau verwijderen? Bestaande meldingen behouden hun waarde.')))return;g.busy=true;g.error='';try{await props.api('/opschalingsniveaus/'+g.kind+'/'+g.id,{method:'DELETE'});emit('changed');await load();fresh(g);}catch(e){g.error=e.message;}finally{g.busy=false;}}
onMounted(async()=>{try{await load();}catch(e){for(const g of groups)g.error=e.message;}});
</script>
<template><section class="panel"><h2>{{t("Opschalingsniveau")}}</h2><p class="meta">{{t("Wijzigingen gelden voor de keuzelijsten. Bestaande meldingen behouden hun opgeslagen niveau.")}}</p><div class="ops-groups"><section v-for="g in groups" :key="g.kind" class="panel"><h2>{{t(g.title)}}</h2><p v-if="g.error" class="error" role="alert">{{g.error}}</p><form class="field-form" @submit.prevent="save(g)"><label>{{t("Niveau")}}<input v-model="g.naam" maxlength="150" :disabled="g.busy" required></label><div class="form-actions"><button type="button" class="secondary" :disabled="g.busy" @click="fresh(g)">{{t("Nieuw")}}</button><button type="button" class="secondary" :disabled="g.busy||g.id===null" @click="remove(g)">{{t("Verwijderen")}}</button><button :disabled="g.busy||!g.naam.trim()">{{t("Opslaan")}}</button></div></form><table><thead><tr><th>{{t("Opschalingsniveau")}}</th></tr></thead><tbody><tr v-for="r in g.rows" :key="r.ID" tabindex="0" class="melding-row" :class="{selected:g.id===r.ID}" @click="!g.busy&&choose(g,r)" @keydown.enter.prevent="!g.busy&&choose(g,r)"><td>{{r.Naam}}</td></tr><tr v-if="!g.rows.length"><td>{{t("Geen niveaus")}}</td></tr></tbody></table></section></div></section></template>
<style scoped>.ops-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.ops-groups .panel{min-width:0}@media(max-width:800px){.ops-groups{grid-template-columns:1fr}}</style>
