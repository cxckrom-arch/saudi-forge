import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as z from 'zod/v4';

const root=process.cwd();
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ksa-full-audit-'));
const project=path.join(temp,'project');const outside=path.join(temp,'outside');const home=path.join(temp,'home');
await Promise.all([fs.mkdir(project),fs.mkdir(outside),fs.mkdir(home)]);
process.env.KROM_PROJECT_ROOT=project;process.env.KROM_HOME=home;
const fixturePackage={name:'audit-fixture',version:'1.0.0',scripts:{typecheck:'node -e "process.exit(0)"',test:'node -e "process.exit(0)"',dev:'node -e "setTimeout(()=>{},30000)"'}};
await fs.writeFile(path.join(project,'package.json'),JSON.stringify(fixturePackage));
await fs.writeFile(path.join(project,'sample.ts'),'export const audit = "auth api test workflow";\n');
await fs.writeFile(path.join(outside,'canary.txt'),'AUDIT_OUTSIDE_CANARY');
await fs.mkdir(path.join(project,'.krom-secrets'));
await fs.writeFile(path.join(project,'.krom-secrets','provider-secrets.env'),'FAKE_API_KEY=AUDIT_FAKE_SECRET_ONLY');
await fs.mkdir(path.join(home,'.krom','v32-providers'),{recursive:true});
const original=await fs.readFile('server.ts','utf8');
let subject=original.slice(0,original.indexOf('const catalogServer = createServer();'));
subject=subject.replaceAll("'./src/","'../src/");
subject=subject.replace('function createServer() {','export const auditTools = new Map<string,any>();\nfunction createServer() {');
subject=subject.replace('toolRuntime.capture(name,config,invoke);','auditTools.set(name,{...config,handler:invoke});\n    toolRuntime.capture(name,config,invoke);');
subject+='\nexport const auditServer=createServer();\nexport {v80WriteTextFile,v80UndoRedo,v350Html,v350AskModel,v320SaveProfiles,v330SmartRoute,v320ModelRoute,v60Diagnostics,v90ReleaseCenter,v350FullScan};\n';
const subjectPath=path.join(root,'tests','.full-audit-subject.ts');await fs.writeFile(subjectPath,subject);
const report={at:new Date().toISOString(),sourceHash:crypto.createHash('sha256').update(original).digest('hex'),fixture:temp,counts:{},schemas:[],executions:[],probes:[],excluded:[]};
const check=(name,observed,detail)=>{report.probes.push({name,observed,detail});console.log(name,JSON.stringify({observed,detail}));};
const unpack=r=>{try{return JSON.parse(r.content?.find(c=>c.type==='text')?.text)}catch{return r.content?.[0]?.text}};
let module;
try {
 module=await import(pathToFileURL(subjectPath).href);await module.v320SaveProfiles([]);
 const tools=module.auditTools;
 report.counts.registered=tools.size;
 const call=async(name,args={})=>{const t=tools.get(name);if(!t)throw Error('Missing tool '+name);return t.handler(t.inputSchema.parse(args));};
 for(const [name,t] of tools){try{const schema=z.toJSONSchema(t.inputSchema);report.schemas.push({name,valid:schema.type==='object',rejectsNull:!t.inputSchema.safeParse(null).success,required:schema.required||[],readOnly:!!t.annotations?.readOnlyHint,openWorld:!!t.annotations?.openWorldHint});}catch(e){report.schemas.push({name,valid:false,error:e.message});}}
 const families=[...tools.keys()].filter(name=>/_v(12|13|14|15)$/.test(name)&&tools.get(name).inputSchema.safeParse({scope:'.',writeReport:false}).success&&'writeReport' in (z.toJSONSchema(tools.get(name).inputSchema).properties||{}));
 for(const name of families){const started=Date.now();try{const r=await call(name,{scope:'.',writeReport:false});const d=unpack(r);report.executions.push({name,kind:'generated-static-analysis',ok:!r.isError&&!!d?.capability,ms:Date.now()-started});}catch(e){report.executions.push({name,ok:false,error:e.message});}}
 report.counts.generatedExecuted=families.length;
 console.log('Generated family checks',families.length,'failed',report.executions.filter(x=>!x.ok).length);
 const candidates=[...tools].filter(([name,t])=>t.annotations?.readOnlyHint&&!t.annotations?.openWorldHint&&t.inputSchema.safeParse({}).success&&!families.includes(name));
 console.log('Read-only candidates',candidates.map(x=>x[0]).join(', '));
 for(const [name] of candidates){const started=Date.now();try{const r=await call(name);const d=unpack(r);report.executions.push({name,kind:'read-only-default',ok:!r.isError,status:d?.status??d?.decision??null,ms:Date.now()-started,summary:r.isError?String(typeof d==='string'?d:JSON.stringify(d)).slice(0,200):undefined});}catch(e){report.executions.push({name,kind:'read-only-default',ok:false,error:e.message});}}
 // Controlled probes use only fake data and a disposable project.
 const skillRegistry=unpack(await call('skills_registry_v50'));const skillIds=(skillRegistry?.skills||[]).map(x=>x.id);
 const skillCompliance=unpack(await call('skills_compliance_gate_v50',{skillIds}));check('skill-pack-compliance',skillCompliance?.status==='PASS'&&skillIds.length===24,{count:skillIds.length,status:skillCompliance?.status});
 const duplicateSkillCompliance=unpack(await call('skills_compliance_gate_v50',{skillIds:[...skillIds,skillIds[0]]}));check('skill-pack-duplicate-blocked',duplicateSkillCompliance?.status==='BLOCKED',{status:duplicateSkillCompliance?.status});
 const specialistRoute=unpack(await call('skills_for_task_v50',{task:'Supabase migration with RLS and rollback'}));check('specialist-route-selects-database-and-auth',(specialistRoute?.selected||[]).some(x=>x.id==='ksa-database-schema-migration-architect')&&(specialistRoute?.selected||[]).some(x=>x.id==='ksa-auth-rbac-rls-security-engineer'),{selected:(specialistRoute?.selected||[]).map(x=>x.id)});
 const secret=await call('read_file',{path:'.krom-secrets/provider-secrets.env'});check('secret-blocked-through-MCP',!!secret.isError&&!JSON.stringify(secret).includes('AUDIT_FAKE_SECRET_ONLY'),'Only a synthetic canary was used');
 const traversal=await call('read_file',{path:'../outside/canary.txt'});check('lexical-traversal-blocked',!!traversal.isError);
 try{await fs.symlink(outside,path.join(project,'linked-outside'),'junction');const linked=await call('read_file',{path:'linked-outside/canary.txt'});check('junction-blocked',!!linked.isError&&!JSON.stringify(linked).includes('AUDIT_OUTSIDE_CANARY'));}catch(e){check('junction-probe-unavailable',true,e.message);}
 await module.v80WriteTextFile('undo.txt','A');await module.v80WriteTextFile('undo.txt','B');await module.v80WriteTextFile('undo.txt','C');
 await module.v80UndoRedo('undo','undo.txt');const firstUndo=await fs.readFile(path.join(project,'undo.txt'),'utf8');await module.v80UndoRedo('undo','undo.txt');const secondUndo=await fs.readFile(path.join(project,'undo.txt'),'utf8');check('repeated-undo',secondUndo==='A',{expected:'A',firstUndo,secondUndo});
 await module.v320SaveProfiles([{id:'offline',name:'Offline fixture',kind:'ollama',baseUrl:'http://127.0.0.1:1',enabled:true,priority:1,timeoutMs:1000,defaultModel:'fake'}]);
 const legacyRoute=await module.v320ModelRoute({task:'code',requireHealthy:true});const modernRoute=await module.v330SmartRoute({task:'code'});check('legacy-router-blocks-offline',legacyRoute.status==='NO_PROVIDER'&&legacyRoute.providerId===null,{legacy:legacyRoute.status,modern:modernRoute.status});
 const gate=unpack(await call('developer_platform_gate_v35'));check('platform-gate-blocks-offline-provider',gate.status==='BLOCKED');
 await module.v320SaveProfiles([]);
 // A failing command must invalidate every release gate, including unparsed stderr.
 fixturePackage.scripts.typecheck='node -e "console.error(\'opaque failure\');process.exit(1)"';await fs.writeFile(path.join(project,'package.json'),JSON.stringify(fixturePackage));
 const diagnostics=await module.v60Diagnostics();const release=await module.v90ReleaseCenter();check('release-center-blocks-failed-typecheck',release.decision==='BLOCKED',{diagnostics:diagnostics.status,decision:release.decision,score:release.health.score});
 report.counts.executed=report.executions.length;report.counts.invalidSchemas=report.schemas.filter(x=>!x.valid).length;report.counts.nullAccepted=report.schemas.filter(x=>!x.rejectsNull).length;
 const ran=new Set(report.executions.map(x=>x.name));report.excluded=[...tools].filter(([name])=>!ran.has(name)).map(([name,t])=>({name,reason:t.annotations?.openWorldHint?'requires external side effects / explicit fixture':t.inputSchema.safeParse({}).success?'state-changing or targeted tool':'requires scenario-specific inputs'}));
 await fs.mkdir('reports/full-audit',{recursive:true});await fs.writeFile('reports/full-audit/local-results.json',JSON.stringify(report,null,2));
 console.log('SUMMARY',JSON.stringify(report.counts));
} finally {await module?.auditServer?.close();await fs.unlink(subjectPath);}
