import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const frontend=new URL('../../',import.meta.url);
test('todos os scripts declarados na vitrine existem e têm sintaxe válida',()=>{
  const html=readFileSync(new URL('index.html',frontend),'utf8');
  const scripts=[...html.matchAll(/<script src="\/static\/([^"]+)"/g)];
  assert.ok(scripts.length>20);
  for(const [,path] of scripts) assert.doesNotThrow(()=>new Script(readFileSync(new URL(path,frontend),'utf8'),{filename:path}),path);
});
