const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('timeline draws a covered zero and omits an uncovered positive month',()=>{
  const ctx = vm.createContext({window:{BS:{}},React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})}});
  vm.runInContext(fs.readFileSync(__dirname+'/pixel-bars.js','utf8'),ctx);
  const tree=ctx.window.BS.TimelineLineChart({slots:[
    {month:6,data:{income:0,expenses:0,has_data:true}},
    {month:7,data:{income:100,expenses:0,has_data:false}},
  ],maxV:100,activeYear:2020,textoDoMes:()=>'',onPickMonth:()=>{}});
  const nodes=[];
  const visit=node=>{if(Array.isArray(node)) return node.forEach(visit);if(node && typeof node==='object'){nodes.push(node);visit(node.children);}};
  visit(tree);
  const dots=nodes.filter(n=>n.tag==='circle' && ['var(--pos)','var(--neg)'].includes(n.props.fill));
  assert.equal(dots.length,2);
  assert.ok(dots.every(n=>n.props.cx===550 && n.props.cy===66));
});
