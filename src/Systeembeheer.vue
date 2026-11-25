<script setup>
import {t,setLanguage} from "./i18n.js";
import {ref,onMounted} from 'vue';
const props=defineProps({api:Function});const emit=defineEmits(['changed']);
const titel=ref('EMCOM Dispatch'),taal=ref('en'),organisatie=ref(''),busy=ref(true),error=ref(''),saved=ref('');
onMounted(async()=>{try{const r=await props.api('/systeem');organisatie.value=r.Organisatie;titel.value=r.Titel;taal.value=r.Taal;}catch(e){error.value=e.message;}finally{busy.value=false;}});
async function save(){if(busy.value||!organisatie.value.trim()||!titel.value.trim())return;busy.value=true;error.value='';saved.value='';try{const r=await props.api('/systeem',{method:'PUT',body:JSON.stringify({Titel:titel.value,Organisatie:organisatie.value,Taal:taal.value})});organisatie.value=r.Organisatie;titel.value=r.Titel;setLanguage(r.Taal);saved.value='Opgeslagen.';emit('changed');}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><section class="panel"><h2>{{t("Systeem")}}</h2><form class="field-form" @submit.prevent="save"><label>{{t("Applicatietitel")}}<input v-model="titel" maxlength="150" required :disabled="busy"></label><label>{{t("Organisatie")}}<input v-model="organisatie" maxlength="150" required :disabled="busy"></label><label>{{t("Taal")}}<select v-model="taal" :disabled="busy"><option value="nl">Nederlands</option><option value="en">English</option></select></label><p v-if="error" class="error" role="alert">{{t(error)}}</p><p v-if="saved" role="status">{{t(saved)}}</p><div class="form-actions"><button :disabled="busy||!organisatie.trim()||!titel.trim()">{{t("Opslaan")}}</button></div></form></section></template>
