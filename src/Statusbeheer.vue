<script setup>
import {t} from "./i18n.js";
import {ref,onMounted} from 'vue';
const props=defineProps({api:Function});const emit=defineEmits(['changed']);
const rows=ref([]),id=ref(null),nummer=ref(null),naam=ref(''),busy=ref(false),error=ref('');
async function load(){rows.value=await props.api('/eenheden/statussen');}
function fresh(){id.value=null;nummer.value=null;naam.value='';error.value='';}
function choose(r){id.value=r.StatusID;nummer.value=r.StatusNummer;naam.value=r.StatusNaam;error.value='';}
async function change(remove=false){if(busy.value)return;if(remove&&!confirm(t('Status verwijderen? Historische loggegevens blijven behouden.')))return;busy.value=true;error.value='';try{rows.value=await props.api('/statusbeheer'+(id.value===null?'':'/'+id.value),{method:remove?'DELETE':id.value===null?'POST':'PATCH',...(remove?{}:{body:JSON.stringify({StatusNummer:nummer.value,StatusNaam:naam.value})})});fresh();emit('changed');}catch(e){error.value=e.message;}finally{busy.value=false;}}
onMounted(()=>load().catch(e=>error.value=e.message));
</script>
<template><section class="panel"><h2>Status</h2><p class="meta">{{t("Statusnummers 1, 2, 4 en 5 behouden hun operationele betekenis. Historische logkolommen blijven behouden.")}}</p><p v-if="error" class="error" role="alert">{{t(error)}}</p><form class="field-form" @submit.prevent="change()"><label>{{t("Status nummer")}}<input v-model.number="nummer" type="number" min="0" step="1" required :disabled="busy"></label><label>{{t("Status naam")}}<input v-model="naam" maxlength="100" required :disabled="busy"></label><div class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="fresh">{{t("Nieuw")}}</button><button type="button" class="secondary" :disabled="busy||id===null" @click="change(true)">{{t("Verwijderen")}}</button><button :disabled="busy||!naam.trim()||!Number.isSafeInteger(nummer)||nummer<0">{{t("Opslaan")}}</button></div></form><table><thead><tr><th>{{t("Status nummer")}}</th><th>{{t("Status naam")}}</th></tr></thead><tbody><tr v-for="r in rows" :key="r.StatusID" tabindex="0" class="melding-row" :class="{selected:id===r.StatusID}" @click="!busy&&choose(r)" @keydown.enter.prevent="!busy&&choose(r)"><td>{{r.StatusNummer}}</td><td>{{r.StatusNaam}}</td></tr></tbody></table></section></template>
