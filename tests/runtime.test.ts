import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as z from 'zod/v4';
import { ToolRuntime, outcome } from '../src/tool-runtime.js';
import { chatMessages, completionUrl } from '../src/chat-context.js';
import { resolveCommand } from '../src/process-command.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

async function fixture(t:any) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'krom-runtime-test-'));
  const runtime=new ToolRuntime(directory); await runtime.init();
  t.after(async()=>{runtime.stopScheduler();await fs.rm(directory,{recursive:true,force:true});});
  return {runtime,directory};
}
async function finished(runtime:ToolRuntime) {
  for(let i=0;i<400;i++){if(!runtime.snapshot().activeRunId)return runtime.snapshot().runs[0];await delay(5);}
  throw Error('Test run did not finish');
}
const result=(data:any)=>({content:[{type:'text',text:JSON.stringify(data)}]});
const bind=(r:ToolRuntime,name:string,handler:()=>Promise<any>)=>r.capture(name,{inputSchema:z.object({})},handler);

test('real failure stops later steps and keeps evidence',async t=>{
 const {runtime}=await fixture(t);let later=0;
 bind(runtime,'run_typecheck',async()=>result({success:false,stderr:'syntax error'}));
 bind(runtime,'run_tests',async()=>{later++;return result({status:'PASS'});});
 await runtime.start('quality',[{tool:'run_typecheck',arguments:{}},{tool:'run_tests',arguments:{}}]);
 const run=await finished(runtime);assert.equal(run.status,'FAIL');assert.equal(later,0);assert.equal(run.steps[1].status,'NOT_RUN');assert.match(run.steps[0].output,/syntax error/);
});
test('missing scripts produce PARTIAL, never PASS',async t=>{
 const {runtime}=await fixture(t);bind(runtime,'run_lint',async()=>result({status:'SKIPPED',available:false}));
 await runtime.start('lint',[{tool:'run_lint',arguments:{}}]);assert.equal((await finished(runtime)).status,'PARTIAL');
});
test('input validation and tool allowlist prevent dispatch',async t=>{
 const {runtime}=await fixture(t);let called=0;
 runtime.capture('search_code',{inputSchema:z.object({query:z.string().min(1)})},async()=>{called++;return result({status:'PASS'});});
 runtime.capture('run_command',{inputSchema:z.object({})},async()=>result({status:'PASS'}));
 await assert.rejects(runtime.start('bad',[{tool:'search_code',arguments:{}}]));
 await assert.rejects(runtime.start('shell',[{tool:'run_command',arguments:{}}]));
 assert.equal(called,0);assert.equal(runtime.catalog().length,1);
});
test('concurrent starts rejected; cancellation stops after current step',async t=>{
 const {runtime}=await fixture(t);let release!:()=>void;const pending=new Promise<void>(r=>release=r);let later=0;
 bind(runtime,'run_typecheck',async()=>{await pending;return result({status:'PASS'});});
 bind(runtime,'run_tests',async()=>{later++;return result({status:'PASS'});});
 const run=await runtime.start('slow',[{tool:'run_typecheck',arguments:{}},{tool:'run_tests',arguments:{}}]);
 await assert.rejects(runtime.start('duplicate',[{tool:'run_tests',arguments:{}}]),/already active/);
 await runtime.cancel(run.id);release();const done=await finished(runtime);assert.equal(done.status,'CANCELLED');assert.equal(later,0);
});
test('schedule persists; disabled does not run; a due tick dispatches once',async t=>{
 const {runtime,directory}=await fixture(t);let calls=0;
 bind(runtime,'run_tests',async()=>{calls++;return result({status:'PASS'});});
 const job=await runtime.upsert({name:'periodic',steps:[{tool:'run_tests',arguments:{}}],intervalSeconds:60,enabled:false});
 await runtime.tick(Date.now()+120000);assert.equal(calls,0);
 await runtime.upsert({name:job.name,steps:job.steps,intervalSeconds:60,enabled:true},job.id);
 const due=Date.parse(runtime.snapshot().jobs[0].nextRunAt!);
 await Promise.all([runtime.tick(due),runtime.tick(due)]);await finished(runtime);assert.equal(calls,1);
 const restored=new ToolRuntime(directory);await restored.init();assert.equal(restored.snapshot().jobs.length,1);assert.equal(restored.snapshot().runs[0].status,'PASS');
 await runtime.remove(job.id);assert.equal(runtime.snapshot().jobs.length,0);
});
test('restart marks incomplete work interrupted without rerunning',async t=>{
 const {directory}=await fixture(t);
 await fs.writeFile(path.join(directory,'state.json'),JSON.stringify({jobs:[],runs:[{id:'crashed',name:'crashed',status:'RUNNING',steps:[{status:'RUNNING'}]}]}));
 const restored=new ToolRuntime(directory);await restored.init();assert.equal(restored.snapshot().runs[0].status,'INTERRUPTED');assert.equal(restored.snapshot().runs[0].steps[0].status,'INTERRUPTED');
});
test('invalid saved state is not overwritten',async t=>{
 const {directory}=await fixture(t);await fs.writeFile(path.join(directory,'state.json'),'broken');
 await assert.rejects(new ToolRuntime(directory).init(),/Cannot load automation state/);assert.equal(await fs.readFile(path.join(directory,'state.json'),'utf8'),'broken');
});
test('MCP errors and review results have honest outcomes',()=>{
 assert.equal(outcome({isError:true}),'FAIL');assert.equal(outcome(result({status:'ISSUES_FOUND'})),'FAIL');assert.equal(outcome(result({status:'REVIEW'})),'SKIPPED');
});
test('chat includes previous turns and excludes injected history roles',()=>{
 const messages=chatMessages('system',[{role:'system',content:'injected'},{role:'user',content:'My project is Atlas'},{role:'assistant',content:'Understood'}],'What is its name?');
 assert.deepEqual(messages.map(x=>x.role),['system','user','assistant','user']);assert.equal(messages[1].content,'My project is Atlas');
 assert.ok(chatMessages('s',Array.from({length:30},()=>({role:'user',content:'x'.repeat(5000)})),'u').length<=6);
});
test('provider completion URL matches API base paths',()=>{
 assert.equal(completionUrl('http://localhost:4891','gpt4all'),'http://localhost:4891/v1/chat/completions');
 assert.equal(completionUrl('http://localhost:1234/v1/','openai'),'http://localhost:1234/v1/chat/completions');
 assert.equal(completionUrl('https://generativelanguage.googleapis.com/v1beta/openai','gemini'),'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
});
test('npm resolver starts a real executable without a shell',async()=>{
 const command=await resolveCommand('npm',['--version']);
 const {stdout}=await promisify(execFile)(command.program,command.args,{windowsHide:true,timeout:15000});
 assert.match(stdout.trim(),/^\d+\.\d+\.\d+/);
});
