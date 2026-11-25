<script setup>
import {t} from "./i18n.js";
import {ref,onMounted} from 'vue';
const props=defineProps({api:Function});
const form=ref({URI:'',Poort:null,Gebruikersnaam:'',Wachtwoord:'',TXGroep:''}),busy=ref(true),error=ref(''),success=ref(''),hasPassword=ref(false),ready=ref(false);
async function load(){const c=await props.api('/pager-config');hasPassword.value=c.HeeftWachtwoord;delete c.HeeftWachtwoord;form.value=c;ready.value=true;}
onMounted(async()=>{try{await load();}catch(e){error.value=e.message;}finally{busy.value=false;}});
async function save(){if(busy.value||!ready.value)return;busy.value=true;error.value='';success.value='';try{await props.api('/pager-config',{method:'PUT',body:JSON.stringify({...form.value,Poort:form.value.Poort===''?null:form.value.Poort})});await load();success.value='Instellingen opgeslagen.';}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><section class="panel"><h2>{{t("Pagerinstellingen")}}</h2><form class="pager-form" @submit.prevent="save"><label>URI<input v-model="form.URI" :disabled="busy||!ready"></label><label>{{t("Poort")}}<input type="number" min="1" max="65535" v-model.number="form.Poort" :disabled="busy||!ready"></label><label>{{t("Gebruikersnaam")}}<input v-model="form.Gebruikersnaam" autocomplete="off" :disabled="busy||!ready"></label><label>{{t("Wachtwoord")}}<input type="password" v-model="form.Wachtwoord" autocomplete="new-password" :placeholder="hasPassword?'Leeg laten om te behouden':''" :disabled="busy||!ready"></label><label>{{t("TXGroep")}}<input v-model="form.TXGroep" :disabled="busy||!ready"></label><p v-if="error" class="error" role="alert">{{t(error)}}</p><p v-if="success" role="status">{{success}}</p><div class="form-actions"><button :disabled="busy||!ready">{{t("Opslaan")}}</button></div></form></section></template>
