<script setup>
import {t} from "./i18n.js";
import {ref,computed,onMounted,onUnmounted} from 'vue';
import {matchesUnit} from './unit-filter.js';
const props=defineProps({api:Function,canManage:Boolean});
const empty=()=>({TactischeNaam:'',Omschrijving:'',Locatie:'',StatusID:statuses.value.find(s=>s.StatusNummer===0)?.StatusID??statuses.value[0]?.StatusID??null,Pager:''});
const statuses=ref([]), rows=ref([]),id=ref(null),draft=ref(empty()),busy=ref(false),error=ref('');
const unitFilter=ref('');
const visibleRows=computed(()=>rows.value.filter(u=>matchesUnit(u,unitFilter.value,[u.Pager,statusNumber(u.StatusID),statusName(u.StatusID)])));
const canSave=computed(()=>!busy.value&&statuses.value.some(s=>s.StatusID===draft.value.StatusID)&&(props.canManage?!!draft.value.TactischeNaam.trim():id.value!==null));
const canNew=computed(()=>!busy.value&&(id.value!==null||draft.value.StatusID!==empty().StatusID||['TactischeNaam','Omschrijving','Locatie','Pager'].some(k=>draft.value[k].length>0)));
const statusNumber=n=>statuses.value.find(s=>s.StatusID===n)?.StatusNummer;
const statusName=n=>statuses.value.find(s=>s.StatusID===n)?.Status??'';
let timer,sequence=0;const statusTouched=ref(false);
async function load(){const n=++sequence;const [r,ss]=await Promise.all([props.api('/eenheden'),props.api('/eenheden/statussen')]);if(n===sequence){rows.value=r;statuses.value=ss;if(id.value===null&&!statusTouched.value)draft.value.StatusID=empty().StatusID;}}
function choose(r){statusTouched.value=false;id.value=r.ID;draft.value={TactischeNaam:r.TactischeNaam,Omschrijving:r.Omschrijving??'',Locatie:r.Locatie??'',StatusID:r.StatusID,Pager:r.Pager??''};error.value='';}
function fresh(){statusTouched.value=false;id.value=null;draft.value=empty();error.value='';}
async function save(){if(!canSave.value)return;busy.value=true;error.value='';try{const r=await props.api('/eenheden'+(id.value===null?'':'/'+id.value),{method:id.value===null?'POST':'PATCH',body:JSON.stringify(props.canManage?(id.value===null||statusTouched.value?draft.value:Object.fromEntries(Object.entries(draft.value).filter(([k])=>k!=='StatusID'))):{StatusID:draft.value.StatusID})});fresh();await load();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function remove(){if(!props.canManage||busy.value||id.value===null||!confirm(t('Eenheid verwijderen?')))return;busy.value=true;try{await props.api('/eenheden/'+id.value,{method:'DELETE'});fresh();await load();}catch(e){error.value=e.message;}finally{busy.value=false;}}
onMounted(async()=>{try{statuses.value=await props.api('/eenheden/statussen');await load();}catch(e){error.value=e.message;}});onMounted(()=>{timer=setInterval(()=>{if(!busy.value)load().catch(e=>error.value=e.message);},3000);});onUnmounted(()=>clearInterval(timer));
</script>
<template>
<section class="panel"><h2>{{t("Eenhedenmanagement")}}</h2><p v-if="error" class="error" role="alert">{{t(error)}}</p><form class="field-form" @submit.prevent="save"><fieldset class="beheer-fields" :disabled="busy||(!canManage&&id===null)">
<label>{{t("Tactische naam")}}<input v-model="draft.TactischeNaam" :disabled="!canManage" maxlength="150" required></label>
<label>{{t("Omschrijving")}}<input v-model="draft.Omschrijving" :disabled="!canManage" maxlength="1000"></label>
<label>{{t("Locatie")}}<input v-model="draft.Locatie" :disabled="!canManage" maxlength="1000"></label>
<label>Status<select v-model="draft.StatusID" @change="statusTouched=true"><option v-for="s in statuses" :key="s.StatusID" :value="s.StatusID">{{s.StatusNummer}} — {{s.StatusNaam}}</option></select></label>
<label>Pager<input v-model="draft.Pager" :disabled="!canManage" maxlength="1000"></label>
</fieldset><div class="form-actions"><button v-if="canManage" type="button" class="secondary" :disabled="!canNew" @click="fresh">{{t("Nieuw")}}</button><button v-if="canManage" type="button" class="secondary" :disabled="busy||id===null" @click="remove">{{t("Verwijderen")}}</button><button :disabled="!canSave">{{t("Opslaan")}}</button></div></form></section>
<section class="panel"><h2>{{t("Eenheden")}}</h2><input type="search" v-model="unitFilter" :aria-label="t('Filter eenheden')" :placeholder="t('Filter eenheden…')"><div style="overflow-x:auto"><table><thead><tr><th>{{t("Tactische naam")}}</th><th>{{t("Omschrijving")}}</th><th>{{t("Locatie")}}</th><th>Status</th><th>Pager</th></tr></thead><tbody><tr v-for="r in visibleRows" :key="r.ID" tabindex="0" class="melding-row" :class="{selected:id===r.ID}" @click="!busy&&choose(r)" @keydown.enter.prevent="!busy&&choose(r)"><td>{{r.TactischeNaam}}</td><td>{{r.Omschrijving}}</td><td>{{r.Locatie}}</td><td>{{statusNumber(r.StatusID)}} — {{statusName(r.StatusID)}}</td><td>{{r.Pager}}</td></tr><tr v-if="!visibleRows.length"><td colspan="5" class="empty">{{t("Geen passende eenheden.")}}</td></tr></tbody></table></div></section>
</template>
