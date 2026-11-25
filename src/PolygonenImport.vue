<script setup>
import {t} from "./i18n.js";
import {ref,onMounted} from 'vue';
const props=defineProps({api:Function});
const emit=defineEmits(['imported']);
const file=ref(null),busy=ref(false),aantal=ref(null),error=ref('');
onMounted(async()=>{try{aantal.value=(await props.api('/polygonen-import')).aantal;}catch(e){error.value=e.message;}});
async function upload(){if(!file.value||busy.value)return;if(!window.confirm(t('Alle bestaande polygonen vervangen door dit bestand?')))return;busy.value=true;error.value='';try{const r=await props.api('/polygonen-import',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file.value});aantal.value=r.aantal;emit('imported',r.aantal);}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template><section class="panel"><h2>{{t("Polygonen importeren")}}</h2><p>{{t("Huidig aantal polygonen")}}: {{t(aantal ?? 'Onbekend')}}</p><p>{{t("Selecteer polygonen.sqlite. De import vervangt uitsluitend de tabelinhoud van Polygoon.")}}</p><input type="file" accept=".sqlite,.sqlite3,.db" :disabled="busy" @change="file=$event.target.files[0]||null"><p v-if="error" class="error" role="alert">{{t(error)}}</p><div class="form-actions"><button :disabled="busy||!file" @click="upload">{{t(busy?'Importeren…':'Importeren')}}</button></div></section></template>
