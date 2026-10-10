const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
test('Em Caixa histórico usa o saldo do mês sem descontar compromissos atuais',()=>{
  const ctx=vm.createContext({window:{BS:{fmtBRL:v=>`BRL:${v}`,PT_MONTHS:{9:'Setembro'},PT_SHORT:{8:'Ago'}}},React:{memo:fn=>fn,createElement:(tag,props,...children)=>({tag,props:props||{},children})}});
  const source=readFileSync(__dirname+'/dashboard.js','utf8').replace(/\}\)\(\);\s*$/, 'window.BS.testKpiStrip=KpiStrip;})();');
  vm.runInContext(source,ctx);
  const tree=ctx.window.BS.testKpiStrip({available:{checking_total:500,available_net:300,committed_this_month:200},accounts:[],cashflow:{income_total:10,expense_total:0,investment_net:0},investTotal:0,position:{is_current:false,is_future:false,has_data:true,checking_total:100,invested_total:0,net_worth:100},monthSel:{year:2025,month:9},monthTx:[{}]});
  const hero=tree.children[0];
  const text=JSON.stringify(hero);
  assert.match(text,/BRL:100/);
  assert.doesNotMatch(text,/Mês futuro|BRL:300|Reserva de emergência: BRL:0/);
});
