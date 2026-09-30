import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const base=process.env.FORGE_TEST_URL || 'http://127.0.0.1:3001';
const evidence=[];
async function request(url,method='GET',body){const r=await fetch(base+url,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});return {status:r.status,data:await r.json()};}
async function rpc(method,params){const r=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);const text=await r.text();const data=text.startsWith('event:')?JSON.parse(text.split('\n').find(l=>l.startsWith('data:')).slice(5)):JSON.parse(text);assert.ok(!data.error,JSON.stringify(data.error));return data.result;}
async function waitRun(id){for(let i=0;i<120;i++){const {data}=await request('/ide/api/automations');const run=data.runs.find(r=>r.id===id);if(run&&run.status!=='RUNNING'&&!data.activeRunId)return run;await delay(250);}throw Error('Run timed out');}
const {data:catalog}=await request('/ide/api/tools');assert.equal(catalog.tools.length,10);assert.ok(catalog.tools.every(t=>t.connected&&t.inputSchema));
const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'forge-integration-test',version:'1'}});assert.equal(init.serverInfo.version,'37.0.0');
const mcpTools=JSON.parse((await rpc('tools/call',{name:'connected_tools_v37',arguments:{}})).content[0].text);assert.deepEqual(mcpTools.map(t=>t.name),catalog.tools.map(t=>t.name));const legacyTools=JSON.parse((await rpc('tools/call',{name:'connected_tools_v36',arguments:{}})).content[0].text);assert.deepEqual(legacyTools.map(t=>t.name),mcpTools.map(t=>t.name));
const invalid=await request('/ide/api/tools/run','POST',{tool:'run_command',arguments:{command:'echo unwanted'}});assert.equal(invalid.status,400);
const invalidArgs=await request('/ide/api/tools/run','POST',{tool:'search_code',arguments:{}});assert.equal(invalidArgs.status,400);
const denied=await fetch(base+'/ide/api/automations',{headers:{origin:'https://untrusted.example'}});assert.equal(denied.status,403);
evidence.push('HTTP/MCP catalog parity; invalid tools/arguments rejected; untrusted browser origin blocked');
const definition={name:'Integration verification (temporary)',steps:[{tool:'run_typecheck',arguments:{}},{tool:'run_tests',arguments:{}}],enabled:false,intervalSeconds:null};
const created=await rpc('tools/call',{name:'automation_save_v37',arguments:definition});assert.ok(!created.isError);const job=JSON.parse(created.content[0].text);
try {
 const started=await rpc('tools/call',{name:'automation_run_v37',arguments:{id:job.id}});assert.ok(!started.isError);const runId=JSON.parse(started.content[0].text).id;
 const collision=await request('/ide/api/tools/run','POST',{tool:'run_tests',arguments:{}});assert.equal(collision.status,409);
 const run=await waitRun(runId);assert.equal(run.status,'PASS');assert.deepEqual(run.steps.map(s=>s.status),['PASS','PASS']);
 evidence.push('MCP-created automation runs real typecheck + tests; concurrent dispatch returns 409');
} finally {assert.equal((await request('/ide/api/automations/'+job.id,'DELETE')).status,200);}
const scan=await request('/ide/api/dev/scan','POST');assert.equal(scan.status,200);assert.equal(scan.data.summary.runtime,'PASS');assert.ok(['PASS','UNAVAILABLE'].includes(scan.data.summary.gitStatus));if(scan.data.summary.gitStatus==='UNAVAILABLE')assert.equal(scan.data.summary.gitDirty,null);assert.ok(['READY','REVIEW'].includes(scan.data.status));assert.ok(scan.data.checks.some(c=>c.name==='typecheck'&&c.status==='PASS'));evidence.push('Full scan reports runtime/typecheck PASS and handles Git availability honestly');
const git=await rpc('tools/call',{name:'git_status',arguments:{}});if(scan.data.summary.gitStatus==='UNAVAILABLE')assert.equal(git.isError,true);else assert.ok(!git.isError);evidence.push('Git status behavior matches runtime Git availability');
for(const route of ['/ide','/ide/tools']){const r=await fetch(base+route);assert.equal(r.status,200);const html=await r.text();for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);}evidence.push('Both UI pages return 200 and their embedded scripts parse');
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/v36-integration.json',JSON.stringify({at:new Date().toISOString(),status:'PASS',evidence},null,2));console.log(JSON.stringify({status:'PASS',evidence},null,2));
