<script setup>
import {t} from "./i18n.js";
import {ref,computed,onMounted} from 'vue';
const props=defineProps({api:Function,current:String,canManage:Boolean});const emit=defineEmits(['changed']);
const roles=['Superuser','Admin','Supervisor','Centralist'];
const blank=()=>({Gebruikersnaam:'',Voornaam:'',Achternaam:'',Telefoon:'',Email:'',Toegangsniveau:3,Wachtwoord:''});
const users=ref([]),selected=ref(null),draft=ref(blank()),busy=ref(false),error=ref(''),message=ref('');
const self=computed(()=>users.value.find(u=>u.Gebruikersnaam===props.current));
const allowed=computed(()=>self.value?.Toegangsniveau<=1&&(selected.value===null||users.value.find(u=>u.ID===selected.value)?.Toegangsniveau>=self.value.Toegangsniveau));
const valid=computed(()=>!props.canManage?draft.value.Wachtwoord.length>=8:allowed.value&&['Gebruikersnaam','Voornaam','Achternaam'].every(k=>draft.value[k].trim())&&(selected.value!==null||draft.value.Wachtwoord.length>=8)&&(!draft.value.Wachtwoord||draft.value.Wachtwoord.length>=8));
async function load(){users.value=await props.api('/gebruikers');if(!props.canManage&&users.value.length)choose(users.value[0]);}
function choose(u){selected.value=u.ID;const {ID,...fields}=u;draft.value={...fields,Telefoon:u.Telefoon||'',Email:u.Email||'',Wachtwoord:''};error.value='';message.value='';}
function chooseFromList(u){choose(u);window.scrollTo({top:0,left:0,behavior:'smooth'});}
function fresh(){selected.value=null;draft.value=blank();error.value='';message.value='';}
async function save(){if(busy.value||!valid.value)return;busy.value=true;error.value='';message.value='';try{if(!props.canManage){await props.api('/eigen-wachtwoord',{method:'PATCH',body:JSON.stringify({Wachtwoord:draft.value.Wachtwoord})});draft.value.Wachtwoord='';message.value='Wachtwoord opgeslagen.';return;}const id=selected.value;const u=await props.api('/gebruikers'+(id===null?'':'/'+id),{method:id===null?'POST':'PATCH',body:JSON.stringify(draft.value)});await load();choose(u);message.value='Gebruiker opgeslagen.';emit('changed');}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function remove(){if(busy.value||!allowed.value||selected.value===null||selected.value===self.value?.ID||users.value.find(u=>u.ID===selected.value)?.Toegangsniveau===0)return;if(!window.confirm(t('Gebruiker daadwerkelijk verwijderen?')))return;busy.value=true;try{await props.api('/gebruikers/'+selected.value,{method:'DELETE'});await load();fresh();message.value='Gebruiker verwijderd.';}catch(e){error.value=e.message;}finally{busy.value=false;}}
onMounted(async()=>{try{await load();}catch(e){error.value=e.message;}});
</script>
<template>
<section class="panel"><div class="toolbar"><h2>{{t("Gebruikersmanagement")}}</h2><span class="meta">{{t(selected===null?'Nieuwe gebruiker':'Gebruiker bewerken')}}</span></div>
<p v-if="error" class="error" role="alert">{{t(error)}}</p><p v-if="message" class="live" role="status">{{t(message)}}</p>
<form @submit.prevent="save" class="field-form"><fieldset class="beheer-fields" :disabled="busy||(canManage&&!allowed)">
<label>{{t("Gebruikersnaam")}}<input v-model="draft.Gebruikersnaam" :disabled="!canManage" maxlength="200" required autocomplete="off"></label>
<label>{{t("Wachtwoord")}}<span class="password-inline"><input v-model="draft.Wachtwoord" type="password" autocomplete="new-password" maxlength="256" minlength="8" :required="selected===null"><small>{{t("Minimaal 8 tekens.")}}</small></span></label>
<label>{{t("Rol")}}<select v-model="draft.Toegangsniveau" :disabled="!canManage||selected!==null&&(selected===self?.ID||users.find(u=>u.ID===selected)?.Toegangsniveau===0)"><option v-for="(r,i) in roles" :key="r" :value="i" :disabled="i<self?.Toegangsniveau">{{t(r)}}</option></select></label>
<label>{{t("Voornaam")}}<input v-model="draft.Voornaam" :disabled="!canManage" maxlength="200" required></label>
<label>{{t("Achternaam")}}<input v-model="draft.Achternaam" :disabled="!canManage" maxlength="200" required></label>
<label>{{t("E-mailadres")}}<input v-model="draft.Email" :disabled="!canManage" type="email" maxlength="250"></label>
<label>{{t("Telefoonnummer")}}<input v-model="draft.Telefoon" :disabled="!canManage" type="tel" maxlength="250"></label>
<p v-if="selected!==null && canManage" class="meta">{{t("Laat het wachtwoord leeg om het bestaande wachtwoord te behouden.")}}</p>
</fieldset><div class="form-actions"><button v-if="canManage" type="button" class="secondary" :disabled="busy" @click="fresh">{{t("Nieuw")}}</button><button v-if="canManage" type="button" class="secondary" :disabled="busy||!allowed||selected===null||selected===self?.ID||users.find(u=>u.ID===selected)?.Toegangsniveau===0" @click="remove">{{t("Verwijderen")}}</button><button :disabled="busy||!valid">{{t("Opslaan")}}</button></div></form></section>
<section class="panel"><h2>{{t("Gebruikers")}}</h2><div class="scroll"><table><thead><tr><th>{{t("Gebruikersnaam")}}</th><th>{{t("Voornaam")}}</th><th>{{t("Achternaam")}}</th><th>{{t("Telefoon")}}</th><th>{{t("E-mailadres")}}</th><th>{{t("Rol")}}</th></tr></thead><tbody><tr v-for="u in users" :key="u.ID" class="melding-row" :class="{selected:selected===u.ID}" tabindex="0" @click="!busy&&chooseFromList(u)" @keydown.enter.self.prevent="!busy&&chooseFromList(u)"><td>{{u.Gebruikersnaam}}</td><td>{{u.Voornaam}}</td><td>{{u.Achternaam}}</td><td>{{u.Telefoon}}</td><td>{{u.Email}}</td><td>{{t(roles[u.Toegangsniveau])}}</td></tr></tbody></table></div></section>
</template>
