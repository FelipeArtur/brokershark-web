import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./api.js',import.meta.url),'utf8');
function setup(responses={}) {const calls=[];const ctx=vm.createContext({window:{BS:{}},FormData,fetch:async(url,opts={})=>{calls.push({url,opts});return {ok:true,json:async()=>responses[url]??[]};}});vm.runInContext(source,ctx);return {ctx,calls};}
test('vitrine recusa mutações antes de enviar dados',async()=>{const {ctx,calls}=setup();await assert.rejects(()=>ctx.patchTransaction(1,{display_name:'EXEMPLO'}),/somente leitura/i);assert.equal(calls.length,0);});
test('posição de investimento respeita mês selecionado',async()=>{const {ctx}=setup({'/api/investments/1':{id:1,snapshots:[{ref_date:'2025-01-31',net:10},{ref_date:'2025-02-28',net:20}]}});const p=await ctx.fetchInvestment(1,{year:2025,month:1});assert.equal(p.snapshots.length,1);});
test('leituras HTTP malsucedidas rejeitam em vez de preencher widgets',async()=>{const {ctx}=setup();ctx.fetch=async()=>({ok:false,json:async()=>({error:'Dados indisponíveis'})});await assert.rejects(()=>ctx.fetchAccounts(),/Dados indisponíveis/);});
test('gráfico distingue mês medido de mês sem dados',async()=>{const {ctx}=setup({'/api/monthly?present=1':[{year:2025,month:1,income:0,expenses:0,has_data:true},{year:2025,month:2,income:0,expenses:0,has_data:false}]});const data=await ctx.fetchMonthlyFull();assert.equal(data[0].has_data,true);assert.equal(data[1].has_data,false);});
