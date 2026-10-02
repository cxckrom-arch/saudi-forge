import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();const previous=JSON.parse(await fs.readFile('reports/full-audit/local-results.json','utf8'));
const temp=previous.fixture,project=path.join(temp,'project'),home=path.join(temp,'home');
const events=[];const conversations=[];
const mock=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 res.setHeader('content-type','application/json');
 if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'audit-model'}]}));
 if(req.url.endsWith('/chat/completions')){const data=JSON.parse(body);conversations.push(data.messages);return res.end(JSON.stringify({choices:[{message:{content:'Synthetic audit response'}}]}));}
 res.statusCode=404;res.end('{}');
});await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockPort=mock.address().port;
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
await fs.writeFile(path.join(home,'.krom','v32-providers','provider-profiles.json'),JSON.stringify({profiles:[{id:'mock',name:'Local test provider',kind:'openai-compatible',baseUrl:`http://127.0.0.1:${mockPort}`,enabled:true,priority:1,timeoutMs:1000,defaultModel:'audit-model'}]}));
await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'audit-fixture',version:'1',scripts:{typecheck:'node -e "process.exit(0)"',test:'node -e "process.exit(0)"'}}));
const craftedName='x&quot;);document.body.dataset.auditXss=1;(&quot;.ts';await fs.writeFile(path.join(project,craftedName),'// synthetic filename XSS canary');
const server=spawn(process.execPath,['--import','tsx','server.ts'],{cwd:root,env:{...process.env,KROM_HOME:home,KROM_PROJECT_ROOT:project,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(base+'/ide/api/tools')).ok)return;}catch{}if(server.exitCode!==null)throw Error(logs.slice(-1000));await delay(100);}throw Error('Startup timeout');}
const json=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
async function rpc(method,params){const t=Date.now();const r=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const text=await r.text();const parsed=text.startsWith('event:')?JSON.parse(text.split('\n').find(x=>x.startsWith('data:')).slice(5)):JSON.parse(text);return {status:r.status,data:parsed,bytes:Buffer.byteLength(text),ms:Date.now()-t};}
try{
 await ready();const list=await rpc('tools/list',{});events.push({name:'live-tools-list',status:list.status,count:list.data.result?.tools.length,bytes:list.bytes,ms:list.ms});
 await fs.writeFile('reports/full-audit/live-tool-catalog.json',JSON.stringify(list.data.result?.tools,null,2));
 const secret=await json('/ide/api/file?path='+encodeURIComponent('.krom-secrets/provider-secrets.env'));events.push({name:'HTTP-secret-canary-readable',status:secret.status,exposed:secret.data.content?.includes('AUDIT_FAKE_SECRET_ONLY')});
 const linked=await json('/ide/api/file?path='+encodeURIComponent('linked-outside/canary.txt'));events.push({name:'HTTP-junction-escape',status:linked.status,escaped:linked.data.content?.includes('AUDIT_OUTSIDE_CANARY')});
 for(const origin of ['https://attacker.invalid',`http://127.0.0.1:${port}`]){const r=await fetch(base+'/ide/api/tools',{headers:{origin}});events.push({name:'origin-check',origin,status:r.status});}
 const invalid=await rpc('tools/call',{name:'search_code',arguments:{query:42}});events.push({name:'invalid-MCP-input',status:invalid.status,isError:invalid.data.result?.isError,protocolError:invalid.data.error?.code});
 const first=await json('/ide/api/dev/chat','POST',{message:'My fixture project is Atlas.'});const second=await json('/ide/api/dev/chat','POST',{message:'What did I call the project?'});
 events.push({name:'mock-provider-chat',first:first.status,second:second.status,requests:conversations.length,historyIncluded:conversations[1]?.some(m=>m.role==='user'&&m.content==='My fixture project is Atlas.')});
 const html=await(await fetch(base+'/ide')).text();const unsafeInlineHandler=html.includes('onclick="openFile(');events.push({name:'inline-filename-handler',containsUnsafeInlineHandler:unsafeInlineHandler,filenameCreated:true});if(unsafeInlineHandler)throw Error('unsafe inline filename handler remains in /ide HTML');
 await fs.writeFile('reports/full-audit/http-results.json',JSON.stringify({base,fixture:temp,events},null,2));
 console.log(JSON.stringify({base,events},null,2));
 // Keep this isolated server available for browser confirmation; Ctrl+C stops it.
 const shutdown=()=>{server.kill();mock.close();};process.on('SIGINT',()=>{shutdown();process.exit(0)});process.on('SIGTERM',()=>{shutdown();process.exit(0)});
}catch(e){server.kill();mock.close();throw e;}
