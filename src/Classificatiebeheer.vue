<script setup>
import {t} from "./i18n.js";
import {ref,onMounted} from 'vue';
const props=defineProps({api:Function});const emit=defineEmits(['changed']);
const rows=ref([]),id=ref(null),naam=ref(''),busy=ref(false),error=ref('');
async function load(){rows.value=await props.api('/classificaties');}
function choose(r){id.value=r.ID;naam.value=r.Classificatie;error.value='';}
function fresh(){id.value=null;naam.value='';error.value='';}
async function save(){if(busy.value||!naam.value.trim())return;busy.value=true;error.value='';try{await props.api('/classificaties'+(id.value===null?'':'/'+id.value),{method:id.value===null?'POST':'PATCH',body:JSON.stringify({Classificatie:naam.value})});await load();fresh();emit('changed');}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function remove(){if(busy.value||id.value===null||!confirm(t('Classificatie verwijderen?')))return;busy.value=true;try{await props.api('/classificaties/'+id.value,{method:'DELETE'});await load();fresh();emit('changed');}catch(e){error.value=e.message;}finally{busy.value=false;}}
onMounted(async()=>{try{await load();}catch(e){error.value=e.message;}});
</script>
<template><section class="panel"><h2>{{t("Classificatiemanagement")}}</h2><p v-if="error" class="error" role="alert">{{t(error)}}</p><form class="field-form" @submit.prevent="save"><fieldset class="beheer-fields" :disabled="busy"><label>{{t("Classificatie")}}<input v-model="naam" maxlength="150" required></label></fieldset><div class="form-actions"><button type="button" class="secondary" :disabled="busy||naam.length===0" @click="fresh">{{t("Nieuw")}}</button><button type="button" class="secondary" :disabled="busy||id===null" @click="remove">{{t("Verwijderen")}}</button><button :disabled="busy||!naam.trim()">{{t("Opslaan")}}</button></div></form></section><section class="panel"><h2>{{t("Classificaties")}}</h2><table><thead><tr><th>{{t("Classificatie")}}</th></tr></thead><tbody><tr v-for="r in rows" :key="r.ID" tabindex="0" class="melding-row" :class="{selected:id===r.ID}" @click="!busy&&choose(r)" @keydown.enter.prevent="!busy&&choose(r)"><td>{{r.Classificatie}}</td></tr></tbody></table></section></template>
