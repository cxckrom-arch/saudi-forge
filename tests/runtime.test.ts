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
import { createProjectContext } from '../src/project-context.js';
import { LOOPBACK_HOST, createNetworkPolicy } from '../src/network-policy.js';
import { createProviderStore } from '../src/provider-store.js';
import { createProviderService } from '../src/provider-service.js';
import { latencyScore, taskAffinity } from '../src/adaptive-model-service.js';
import { classifyTask } from '../src/provider-routing.js';
import { createSecretManager } from '../src/secret-manager.js';
import { createAiControlService } from '../src/ai-control-service.js';
import { APP_VERSION, APP_DISPLAY_VERSION } from '../src/release-info.js';
import { renderDeveloperPlatformHtml } from '../src/developer-platform-ui.js';
import { registerModelControlTools } from '../src/model-control-tools.js';
import { createDeveloperPlatformService } from '../src/developer-platform-service.js';
import { registerCoreProjectTools } from '../src/core-project-tools.js';
import { registerPrecisionExecutionTools } from '../src/precision-execution-tools.js';
import { createPrecisionExecutionService, EXECUTION_DIR, EXECUTION_FILE } from '../src/precision-execution-service.js';
import { registerPromptStudioTools } from '../src/prompt-studio-tools.js';
import { registerVisualDesignerTools } from '../src/visual-designer-tools.js';
import { registerV3CoreTools } from '../src/v3-core-tools.js';
import { registerV31BrowserTools } from '../src/v31-browser-tools.js';
import { registerV32RepairTools } from '../src/v32-repair-tools.js';
import { registerV33CodeIntelligenceTools } from '../src/v33-code-intelligence-tools.js';
import { registerV34ContextDecisionTools } from '../src/v34-context-decision-tools.js';
import { registerV35AdaptiveRuntimeTools } from '../src/v35-adaptive-runtime-tools.js';
import { createPredictiveEngineeringService } from '../src/predictive-engineering-service.js';
import { createLearningMemoryService } from '../src/learning-memory-service.js';
import { createCodeIntelligenceService } from '../src/code-intelligence-service.js';
import { createSmartContextService } from '../src/smart-context-service.js';
import { createRepairService } from '../src/repair-service.js';
import { registerV16V20Tools } from '../src/v16-v20-tools.js';
import { registerV21V25Tools } from '../src/v21-v25-tools.js';
import { registerV26V31Tools } from '../src/v26-v31-tools.js';
import { registerV36LearningTools } from '../src/v36-learning-tools.js';
import { registerV37AutopilotTools } from '../src/v37-autopilot-tools.js';
import { createAutopilotService } from '../src/autopilot-service.js';
import { createCouncilService } from '../src/council-service.js';
import { registerV38CouncilTools } from '../src/v38-council-tools.js';
import { registerV39PredictiveTools } from '../src/v39-predictive-tools.js';
import { registerV4ProductTools } from '../src/v4-product-tools.js';
import { registerV5EngineeringSuiteTools } from '../src/v5-engineering-suite-tools.js';
import { registerV6IdeCoreTools } from '../src/v6-ide-core-tools.js';
import { registerV7VisualIdeTools } from '../src/v7-visual-ide-tools.js';
import { registerV8WorkbenchTools } from '../src/v8-workbench-tools.js';
import { registerV9EngineeringOpsTools } from '../src/v9-engineering-ops-tools.js';
import { registerV10SoftwareFactoryTools } from '../src/v10-software-factory-tools.js';
import { registerV11ReliabilityTools } from '../src/v11-reliability-tools.js';
import { sanitizePromptName, generatePrompt, scorePrompt, visualReviewScore } from '../src/prompt-design-service.js';
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


test('project context blocks traversal and skips local/generated directories', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-project-context-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'fixture',packageManager:'npm@10.0.0'}));
  await fs.mkdir(path.join(root,'src'),{recursive:true});
  await fs.writeFile(path.join(root,'src','index.ts'),'export {};');
  await fs.mkdir(path.join(root,'node_modules','pkg'),{recursive:true});
  await fs.writeFile(path.join(root,'node_modules','pkg','index.js'),'ignored');
  await fs.mkdir(path.join(root,'.krom-secrets'),{recursive:true});
  await fs.writeFile(path.join(root,'.krom-secrets','provider.env'),'ignored');

  const project=createProjectContext(root);
  assert.throws(()=>project.safePath('../outside'),/outside KROM_PROJECT_ROOT/);
  assert.equal(project.safePath('src'),path.join(root,'src'));
  assert.equal(await project.detectPackageManager(),'npm');

  const files=(await project.walkProject()).map(file=>path.relative(root,file).replaceAll('\\','/'));
  assert.ok(files.includes('src/index.ts'));
  assert.ok(!files.some(file=>file.startsWith('node_modules/')));
  assert.ok(!files.some(file=>file.startsWith('.krom-secrets/')));
});


test('network policy remains loopback-only unless an explicit public host is allowlisted',()=>{
 const local=createNetworkPolicy();
 assert.equal(local.host,LOOPBACK_HOST);
 assert.deepEqual(local.allowedHosts,['127.0.0.1','localhost','[::1]']);
 assert.deepEqual(local.allowedOrigins,local.allowedHosts);
 const extended=createNetworkPolicy('forge.example.test');
 assert.ok(extended.allowedHosts.includes('forge.example.test'));
 assert.ok(extended.allowedOrigins.includes('forge.example.test'));
 assert.equal(extended.host,'127.0.0.1');
});


test('provider store sanitizes credential headers and builds model URLs',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-provider-store-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  const stateDir=path.join(root,'state');
  const profilesFile=path.join(stateDir,'profiles.json');
  const store=createProviderStore({
    stateDir,
    profilesFile,
    exists:async target=>{try{await fs.access(target);return true;}catch{return false;}},
    env:{TEST_PROVIDER_KEY:'secret-value'}
  });

  const profile:any={
    id:'test',
    name:'Test',
    kind:'openai-compatible',
    baseUrl:'https://example.test/v1/',
    apiKeyEnv:'TEST_PROVIDER_KEY',
    enabled:true,
    priority:1,
    timeoutMs:1000,
    headers:{'x-trace':'allowed','api-key':'blocked','Authorization':'blocked'}
  };

  const headers=store.authHeaders(profile);
  assert.equal(headers.authorization,'Bearer secret-value');
  assert.equal(headers['x-trace'],'allowed');
  assert.equal(headers['api-key'],undefined);
  assert.equal(headers.Authorization,undefined);
  assert.equal(store.modelsUrl(profile),'https://example.test/v1/models');
  assert.equal(store.modelsUrl({...profile,kind:'ollama',baseUrl:'http://127.0.0.1:11434/'}),'http://127.0.0.1:11434/api/tags');
  assert.equal(store.modelsUrl({...profile,kind:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai/'}),'https://generativelanguage.googleapis.com/v1beta/openai/models');
});


test('adaptive routing classification and scoring stay deterministic',()=>{
  assert.equal(classifyTask('fix TypeScript component bug'),'coding');
  assert.equal(classifyTask('design responsive RTL dashboard'),'design');
  assert.equal(classifyTask('plan schema migration architecture'),'planning');
  assert.equal(classifyTask('summarize this text'),'general');

  assert.equal(latencyScore(250),100);
  assert.equal(latencyScore(700),90);
  assert.equal(latencyScore(1500),75);
  assert.equal(latencyScore(7000),15);
  assert.ok(taskAffinity('gemini','planning')>taskAffinity('gpt4all','planning'));
  assert.equal(taskAffinity('custom','general'),70);
});


test('secret manager validates names and strips line breaks',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-secret-manager-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  const env:any={};
  const manager=createSecretManager({
    kromHome:root,
    readProfiles:async()=>[],
    providerHealth:async()=>({results:[]}),
    selectModel:async()=>({}),
    providerControl:async()=>({}),
    env
  });

  await assert.rejects(()=>manager.persistSecret('bad-key','12345678'),/Invalid secret environment variable name/);
  await assert.rejects(()=>manager.persistSecret('GOOD_KEY','short'),/too short/);
  const saved=await manager.persistSecret('GOOD_KEY','abc12345\r\n');
  assert.equal(saved.configured,true);
  assert.equal(env.GOOD_KEY,'abc12345');
  const text=await fs.readFile(manager.secretsFile(),'utf8');
  assert.equal(text,'GOOD_KEY=abc12345\n');
});

test('AI control banner audit ignores legacy comments but catches visible stale UI', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'krom-ai-control-'));
  const stateDir = path.join(root, '.krom');
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const service = createAiControlService({
    stateDir,
    kromHome: root,
    projectRoot: root,
    port: 3001,
    routingFile: path.join(root, 'routing.json'),
    profiles: async () => ({ profiles: [] }),
    reliability: async () => ({ providers: [] }),
    readProfiles: async () => [],
    saveProfiles: async () => {},
    selectModel: async () => ({}),
    routingPolicy: async () => ({}),
    routeExplain: async () => ({})
  });

  await fs.writeFile(
    path.join(root, 'server.ts'),
    '// KROM FORGE DEV v11.0 - historical section label\n<title>${APP_NAME} ${APP_DISPLAY_VERSION}</title>\n',
    'utf8'
  );
  const clean = await service.runtimeBannerAudit();
  assert.equal(clean.version, '45.0.0');
  assert.equal(clean.status, 'PASS');
  assert.deepEqual(clean.legacyMentions, []);

  await fs.writeFile(
    path.join(root, 'server.ts'),
    '<title>KROM FORGE DEV v34.5</title>\n',
    'utf8'
  );
  const stale = await service.runtimeBannerAudit();
  assert.equal(stale.status, 'REVIEW');
  assert.deepEqual(stale.legacyMentions, ['KROM FORGE DEV v34.5']);
});

test('release identity stays synchronized across package, lockfile, config, and UI display version', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
  const lockfile = JSON.parse(await fs.readFile(path.resolve('package-lock.json'), 'utf8'));
  const kromConfig = JSON.parse(await fs.readFile(path.resolve('krom.config.json'), 'utf8'));

  assert.equal(packageJson.version, APP_VERSION);
  assert.equal(lockfile.version, APP_VERSION);
  assert.equal(lockfile.packages?.['']?.version, APP_VERSION);
  assert.equal(kromConfig.version, APP_VERSION);
  assert.equal(APP_DISPLAY_VERSION, `v${APP_VERSION.split('.').slice(0, 2).join('.')}`);
});

test('provider and secret APIs expose release version while preserving schema version', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'krom-version-contract-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const profile:any = {
    id: 'mock', name: 'Mock', kind: 'custom', baseUrl: 'http://127.0.0.1:9999',
    apiKeyEnv: 'MOCK_API_KEY', enabled: true, priority: 1, timeoutMs: 1000
  };
  const store:any = {
    normalizeBase: (v:string) => v,
    safeId: (v:string) => v,
    readProfiles: async () => [profile],
    saveProfiles: async () => {},
    authHeaders: () => ({}),
    modelsUrl: () => 'http://127.0.0.1:9999/models',
    extractModels: () => []
  };
  const provider = createProviderService({
    store,
    writeState: async (_name:string, data:any) => data,
    profilesFile: path.join(root, 'providers.json'),
    env: {}
  });
  const profiles = await provider.profiles();
  assert.equal(profiles.version, APP_VERSION);
  assert.equal(profiles.schemaVersion, '32.1.0');

  const env:any = {};
  const secrets = createSecretManager({
    kromHome: root,
    readProfiles: async () => [profile],
    providerHealth: async () => ({ results: [{ ok: true }] }),
    selectModel: async () => ({}),
    providerControl: async () => ({}),
    env
  });
  const saved = await secrets.setCredential({ providerId: 'mock', apiKey: '12345678' });
  assert.equal(saved.version, APP_VERSION);
  assert.equal(saved.schemaVersion, '34.5.0');
});

test('AI route preview cannot be downgraded by nested adaptive module version', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'krom-route-preview-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const service = createAiControlService({
    stateDir: path.join(root, '.krom'),
    kromHome: root,
    projectRoot: root,
    port: 3001,
    routingFile: path.join(root, 'routing.json'),
    profiles: async () => ({ profiles: [] }),
    reliability: async () => ({ providers: [] }),
    readProfiles: async () => [],
    saveProfiles: async () => {},
    selectModel: async () => ({}),
    routingPolicy: async () => ({}),
    routeExplain: async () => ({ version: '33.0.0', status: 'ROUTED', selected: { providerId: 'mock' } })
  });
  const preview = await service.routePreview({ task: 'fix code' });
  assert.equal(preview.version, APP_VERSION);
  assert.equal(preview.schemaVersion, '33.0.0');
  assert.equal(preview.status, 'ROUTED');
});

test('developer platform renderer uses supplied release identity and escapes dynamic content', () => {
  const html = renderDeveloperPlatformHtml({
    state: { providers: [{ enabled: true, name: '<Mock>' }], preview: { url: '' }, chatMessages: [] },
    projectRoot: 'C:\\SAFE<&>',
    appName: 'KSA-FORGE-DEV',
    appDisplayVersion: 'v46.0'
  });
  assert.match(html, /KSA-FORGE-DEV/);
  assert.match(html, /v46\.0/);
  assert.ok(!html.includes('<Mock>'));
  assert.ok(html.includes('&lt;Mock&gt;'));
  assert.ok(html.includes('C:\\SAFE&lt;&amp;&gt;'));
});

test('extracted model-control registration preserves v32-v35 tool catalog', () => {
  const names:string[] = [];
  const server:any = { registerTool: (name:string) => { names.push(name); } };
  registerModelControlTools(server, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error })
  } as any);
  assert.equal(names.length, 30);
  for (const required of [
    'provider_profile_upsert_v32',
    'provider_benchmark_v33',
    'ai_control_center_status_v34',
    'provider_toggle_v342',
    'developer_platform_status_v35',
    'developer_platform_gate_v35'
  ]) assert.ok(names.includes(required), required);
});

test('extracted developer platform service preserves status and preview contracts', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'krom-dev-platform-service-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const previewFile = path.join(root, 'preview.json');
  let previewState:any = null;
  const service = createDeveloperPlatformService({
    kromHome: root,
    projectRoot: root,
    previewFile,
    v310RuntimeDoctor: async () => ({ status: 'PASS', blockers: [] }),
    v320AuthHeaders: () => ({}),
    v320NormalizeBase: (v:string) => v,
    v320ProviderHealth: async () => ({ results: [] }),
    v320ReadProfiles: async () => [],
    v330SmartRoute: async () => ({ selected: null }),
    v340ControlStatus: async () => ({ providers: [] }),
    v60Diagnostics: async () => ({ status: 'PASS', count: 0, diagnostics: [], checks: [] }),
    v60WriteJson: async (_file:string, state:any) => { previewState = state; return state; },
    v80ReadTextFile: async () => '',
    v80WorkbenchState: async () => ({ preview: { url: null }, editor: { activeFile: null } }),
    v90DependencyDoctor: async () => ({ concerns: [] }),
    v90Health: async () => ({ score: 100, grade: 'A' }),
    executeProgram: async () => ({ success: true, stdout: '', stderr: '' })
  });

  const status = await service.platformStatus();
  assert.equal(status.version, APP_VERSION);
  assert.equal(status.status, 'READY');
  assert.equal(status.project, root);

  await assert.rejects(() => service.previewSet({ url: 'file:///tmp/test' }), /http:\/\/ or https:\/\//);
  const saved = await service.previewSet({ url: 'http://127.0.0.1:5173' });
  assert.equal(saved.version, APP_VERSION);
  assert.equal(saved.status, 'SAVED');
  assert.equal(previewState.url, 'http://127.0.0.1:5173');
});

test('developer chat fails over to the next healthy routed provider', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'krom-dev-chat-failover-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const originalFetch = globalThis.fetch;
  const calls:string[] = [];
  globalThis.fetch = (async (url:any) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('primary.example')) {
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'fallback response' } }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as any;
  t.after(() => { globalThis.fetch = originalFetch; });

  const profiles:any[] = [
    { id: 'primary', name: 'Primary', kind: 'openai-compatible', baseUrl: 'https://primary.example/v1', enabled: true, priority: 1, timeoutMs: 1000, defaultModel: 'model-a' },
    { id: 'backup', name: 'Backup', kind: 'openai-compatible', baseUrl: 'https://backup.example/v1', enabled: true, priority: 2, timeoutMs: 1000, defaultModel: 'model-b' }
  ];

  const service = createDeveloperPlatformService({
    kromHome: root,
    projectRoot: root,
    previewFile: path.join(root, 'preview.json'),
    v310RuntimeDoctor: async () => ({ status: 'PASS', blockers: [] }),
    v320AuthHeaders: () => ({}),
    v320NormalizeBase: (v:string) => v,
    v320ProviderHealth: async () => ({ results: [] }),
    v320ReadProfiles: async () => profiles,
    v330SmartRoute: async () => ({
      selected: { providerId: 'primary', provider: 'Primary', model: 'model-a' },
      candidates: [
        { providerId: 'primary', provider: 'Primary', model: 'model-a', healthy: true, score: 95 },
        { providerId: 'backup', provider: 'Backup', model: 'model-b', healthy: true, score: 88 }
      ]
    }),
    v340ControlStatus: async () => ({ providers: profiles }),
    v60Diagnostics: async () => ({ status: 'PASS', count: 0, diagnostics: [], checks: [] }),
    v60WriteJson: async (_file:string, state:any) => state,
    v80ReadTextFile: async () => '',
    v80WorkbenchState: async () => ({ preview: { url: null }, editor: { activeFile: null } }),
    v90DependencyDoctor: async () => ({ concerns: [] }),
    v90Health: async () => ({ score: 100, grade: 'A' }),
    executeProgram: async () => ({ success: true, stdout: '', stderr: '' })
  });

  const reply:any = await service.askModel({ message: 'fix this bug' });
  assert.equal(reply.answer, 'fallback response');
  assert.equal(reply.providerId, 'backup');
  assert.equal(reply.failoverUsed, true);
  assert.deepEqual(reply.attempts.map((x:any) => x.status), ['FAIL','PASS']);
  assert.equal(calls.length, 2);
});

test('extracted core project registration preserves the 14-tool catalog', () => {
  const names:string[] = [];
  const server:any = { registerTool: (name:string) => { names.push(name); } };
  registerCoreProjectTools(server, {
    projectRoot: process.cwd(),
    maxFileSize: 1024 * 1024,
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    safePath: (p:string) => p,
    exists: async () => true,
    backupFile: async () => null,
    walkProject: async () => [],
    readPackageJson: async () => ({}),
    detectPackageManager: async () => 'npm',
    isTextFile: () => true,
    executeProgram: async () => ({ success: true }),
    runPackageScript: async () => ({ available: false, status: 'SKIPPED' }),
    recordChangedFile: async () => {},
    recordCommandEvidence: async () => {}
  });
  assert.deepEqual(names, [
    'inspect_project','list_files','read_file','search_code','write_file','patch_file','run_command',
    'run_build','run_tests','run_lint','run_typecheck','git_status','git_diff','verification_gate'
  ]);
});

test('extracted precision execution registration preserves the four-tool catalog', () => {
  const names:string[] = [];
  const server:any = { registerTool: (name:string) => { names.push(name); } };
  registerPrecisionExecutionTools(server, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    extractRequirementsFromPrompt: () => [],
    precisionProtocol: () => '',
    readExecutionManifest: async () => null,
    writeExecutionManifest: async () => {},
    runPackageScript: async () => ({ available: false, status: 'SKIPPED' }),
    recordCommandEvidence: async () => {},
    executionDir: '.krom-execution',
    executionFile: 'current-task.json'
  });
  assert.deepEqual(names, [
    'start_precise_execution','update_execution_requirement','execution_status','execution_audit'
  ]);
});

test('extracted prompt studio registration preserves the eight-tool catalog', () => {
  const names:string[] = [];
  const server:any = { registerTool: (name:string) => { names.push(name); } };
  registerPromptStudioTools(server, {
    projectRoot: process.cwd(),
    promptLibraryDir: '.krom-prompts',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    generatePrompt: () => '',
    scorePrompt: () => ({ score: 0, checks: [] }),
    uiDesignDirectorBlock: () => '',
    designTokenPreset: () => ({}),
    scoreUIDesignText: () => ({ score: 0, checks: [], missing: [] }),
    sanitizePromptName: (name:string) => name,
    safePath: (p:string) => p,
    readPackageJson: async () => ({}),
    detectPackageManager: async () => 'npm',
    exists: async () => false,
    backupFile: async () => null
  });
  assert.deepEqual(names, [
    'build_prompt','improve_prompt','prompt_from_project','design_ui_prompt',
    'generate_design_system','ui_design_quality_check','prompt_quality_check','prompt_library'
  ]);
});

test('extracted visual designer registration preserves the three-tool catalog', () => {
  const names:string[] = [];
  const server:any = { registerTool: (name:string) => { names.push(name); } };
  registerVisualDesignerTools(server, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    visualDesignerMandate: () => '',
    visualReviewScore: () => ({ score: 0, missing: [] })
  });
  assert.deepEqual(names, ['visual_designer_agent','visual_review','visual_iteration_plan']);
});

test('extracted v3 core registration preserves orchestration and gate catalog', () => {
  const names:string[] = [];
  const server:any = { registerTool: (name:string) => { names.push(name); } };
  registerV3CoreTools(server, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    orchestratorPlan: () => ({}),
    readProjectMemory: async () => ({}),
    writeProjectMemory: async () => {},
    traceabilityFromManifest: () => ({}),
    readExecutionManifest: async () => null,
    runNpmScriptIfPresent: async () => ({ available: false, success: null }),
    recordCommandEvidence: async () => {},
    visualReviewScore: () => ({ score: 100, missing: [] })
  });
  assert.deepEqual(names, [
    'master_orchestrator','project_memory','requirement_traceability',
    'browser_test','screenshot_visual_inspector','release_gate_v3'
  ]);
});

test('extracted v3.1 browser and v3.2 repair catalogs remain stable', () => {
  const browserNames:string[] = [];
  registerV31BrowserTools({ registerTool: (name:string) => { browserNames.push(name); } } as any, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    runLiveBrowserVision: async () => ({}),
    readLatestLiveBrowserReport: async () => null,
    recordCommandEvidence: async () => {},
    runNpmScriptIfPresent: async () => ({ available: false, success: null }),
    readExecutionManifest: async () => null
  });
  assert.deepEqual(browserNames, ['live_browser_vision','live_browser_report','release_gate_v31']);

  const repairNames:string[] = [];
  registerV32RepairTools({ registerTool: (name:string) => { repairNames.push(name); } } as any, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    collectRepairFindings: async () => ({ findings: [], gates: {} }),
    repairFingerprint: () => '00000000',
    readRepairState: async () => null,
    writeRepairState: async () => {},
    locateLikelyFiles: async () => [],
    readExecutionManifest: async () => null
  });
  assert.deepEqual(repairNames, ['autonomous_repair_begin','autonomous_repair_verify','autonomous_repair_status','repair_source_locator']);
});

test('extracted v3.3 code intelligence catalog remains stable', () => {
  const names:string[] = [];
  registerV33CodeIntelligenceTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    buildCodeIntelligenceGraph: async () => ({ nodes: {}, generatedAt: '', stats: {}, unresolvedImports: [] }),
    readCodeIntelligenceGraph: async () => null,
    dependencyReach: () => ({ all: [] }),
    riskForImpact: () => ({ level: 'LOW' }),
    normalizeRel: (v:string) => v,
    readExecutionManifest: async () => null,
    codeIntelFile: 'code-intelligence.json'
  });
  assert.deepEqual(names, ['code_intelligence_scan','impact_analysis','symbol_intelligence','regression_scope']);
});

test('extracted v3.4 context and decision catalog remains stable', () => {
  const names:string[] = [];
  registerV34ContextDecisionTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    projectRoot: process.cwd(),
    smartContextFile: 'smart-context.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    buildSmartContext: async () => ({ selected: [], omittedHighRisk: [], generatedAt: '', estimatedChars: 0, tokenBudgetChars: 0, changedFiles: [], memorySummary: {}, query: '' }),
    kromStatePath: async (file:string) => file,
    decideExecutionStrategy: () => ({}),
    readCodeIntelligenceGraph: async () => null,
    buildCodeIntelligenceGraph: async () => ({ nodes: {}, unresolvedImports: [] })
  });
  assert.deepEqual(names, ['smart_context_build','context_file_pack','decision_engine','context_gap_check']);
});

test('extracted v3.5 adaptive runtime catalog remains stable', () => {
  const names:string[] = [];
  registerV35AdaptiveRuntimeTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    smartContextFile: 'smart-context.json',
    taskGraphFile: 'task-graph.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    kromStatePath: async (file:string) => file,
    buildSmartContext: async () => ({ query: '', selected: [] }),
    decideExecutionStrategy: () => ({}),
    buildTaskGraph: () => ({ nodes: [] }),
    readRuntimeHistory: async () => [],
    writeRuntimeHistory: async () => {},
    chooseAgentForTask: () => ({ selectedAgent: 'developer', reason: 'test' })
  });
  assert.deepEqual(names, ['task_decomposition_graph','task_graph_update','adaptive_agent_route','runtime_outcome','adaptive_runtime_status']);
});

test('extracted v3.6 learning and confidence catalog remains stable', () => {
  const names:string[] = [];
  registerV36LearningTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    smartContextFile: 'smart-context.json',
    learningMemoryFile: 'learning-memory.json',
    decisionLedgerFile: 'decision-ledger.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    readLearningMemory: async () => [],
    writeLearningMemory: async () => {},
    taskTypeOf: () => 'general',
    clampConfidence: (v:number) => v,
    summarizeLessons: () => ({}),
    kromStatePath: async (file:string) => file,
    assessDecisionConfidence: () => ({ band: 'HIGH' }),
    buildSmartContext: async () => ({ query: '', selected: [], omittedHighRisk: [] }),
    decideExecutionStrategy: () => ({ mode: 'SAFE', risk: 'LOW' }),
    readRuntimeHistory: async () => [],
    chooseAgentForTask: () => ({ selectedAgent: 'developer', alternatives: [], reason: 'test' })
  });
  assert.deepEqual(names, ['learning_memory_record','learning_memory_recall','decision_confidence','adaptive_strategy_advisor','learning_memory_status']);
});

test('extracted v3.7 autopilot catalog remains stable', () => {
  const names:string[] = [];
  registerV37AutopilotTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    taskGraphFile: 'task-graph.json',
    autopilotHistoryFile: 'autopilot-history.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    createAutopilotCheckpoint: async () => ({ id: 'cp' }),
    createCouncilSession: async () => ({ id: 'c', requiredAgents: [], status: 'READY' }),
    buildSmartContext: async () => ({ selected: [] }),
    decideExecutionStrategy: () => ({ mode: 'SAFE', risk: 'LOW' }),
    buildChangeSimulation: async () => ({ id: 's', risk: 'LOW', affectedFiles: [], affectedRoutes: [] }),
    evaluatePreflight: async () => ({ status: 'PASS' }),
    buildTaskGraph: () => ({ nodes: [] }),
    kromStatePath: async (file:string) => file,
    writeAutopilotState: async () => {},
    appendAutopilotHistory: async () => {},
    readAutopilotState: async () => null,
    nextAutopilotPhase: () => 'verify',
    restoreAutopilotCheckpoint: async () => []
  });
  assert.deepEqual(names, ['engineering_autopilot_start','autopilot_checkpoint','autopilot_quality_watchdog','autopilot_rollback','engineering_autopilot_status']);
});

test('extracted v3.8 council catalog remains stable', () => {
  const names:string[] = [];
  registerV38CouncilTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    councilHistoryFile: 'council-history.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    createCouncilSession: async () => ({}),
    readCouncilState: async () => null,
    writeCouncilState: async () => {},
    appendCouncilHistory: async () => {},
    resolveCouncilConsensus: () => ({ status: 'BLOCKED' }),
    clampConfidence: (v:number) => v,
    kromStatePath: async (file:string) => file
  });
  assert.deepEqual(names, ['engineering_council_convene','council_submit_opinion','execution_consensus','council_conflict_resolver','engineering_council_status']);
});

test('extracted v3.9 predictive engineering catalog remains stable', () => {
  const names:string[] = [];
  registerV39PredictiveTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    preflightHistoryFile: 'preflight-history.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    buildChangeSimulation: async () => ({}),
    readChangeSimulation: async () => null,
    forecastChangeRisk: () => ({}),
    evaluatePreflight: async () => ({ status: 'PASS' }),
    appendPreflightHistory: async () => {},
    kromStatePath: async (file:string) => file
  });
  assert.deepEqual(names, ['change_simulation','risk_forecast','preflight_gate','change_plan','preflight_status']);
});

test('extracted v4 product engineering catalog remains stable', () => {
  const names:string[] = [];
  registerV4ProductTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    productBlueprintFile: 'product-blueprint.json',
    productAcceptanceFile: 'product-acceptance.json',
    productGapFile: 'product-gap.json',
    changeSimulationFile: 'change-simulation.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    createProductBlueprint: async () => ({ id: 'bp', features: [], nonFunctional: [], qualityBars: [] }),
    readProductBlueprint: async () => null,
    scanFeatureEvidence: async () => ({ score: 0, status: 'NO_EVIDENCE', coverage: {} }),
    kromStatePath: async (file:string) => file
  });
  assert.deepEqual(names, ['product_blueprint','acceptance_contract_generate','feature_completeness_matrix','product_gap_detector','product_release_readiness']);
});

test('extracted v5 engineering suite catalog remains stable', () => {
  const names:string[] = [];
  registerV5EngineeringSuiteTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    projectRoot: process.cwd(),
    taskBoardFile: 'task-board.json',
    auditFile: 'audit.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    v50TaskKind: () => 'code',
    runPackageScript: async () => ({ status: 'SKIPPED' }),
    v50ApiContractScan: async () => ({ endpoints: [], clients: [] }),
    v50DatabaseScan: async () => [],
    v50ScanPatterns: async () => [],
    walkProject: async () => [],
    executeProgram: async () => ({ success: true, stdout: '', stderr: '' }),
    readCodeIntelligenceGraph: async () => null,
    normalizeRel: (v:string) => v,
    v50TaskBoard: async () => ({ nodes: [] }),
    readProductBlueprint: async () => null,
    scanFeatureEvidence: async () => ({ score: 0 }),
    kromStatePath: async (file:string) => file
  });
  assert.deepEqual(names, [
    'model_router_v5','diagnostics_intelligence_v5','api_contract_intelligence_v5','database_architect_v5','security_auditor_v5',
    'performance_intelligence_v5','accessibility_auditor_v5','git_regression_guardian_v5','engineering_task_board_v5','engineering_suite_gate_v5'
  ]);
});

test('extracted v6 IDE core catalog remains stable', () => {
  const names:string[] = [];
  registerV6IdeCoreTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    projectRoot: process.cwd(), maxFileSize: 1024*1024, diagnosticsFile:'d.json', workspaceFile:'w.json', pluginsFile:'p.json', gateFile:'g.json', port:3001,
    result:(text:string)=>({content:[{type:'text',text}]}), errorResult:(error:unknown)=>({isError:true,error}),
    v60Diagnostics:async()=>({status:'PASS',count:0,diagnostics:[],byFile:{}}), v60ReadJson:async()=>null, v60WorkspaceIndex:async()=>({count:0,hotspots:[],files:[]}),
    walkProject:async()=>[], isTextFile:()=>true, normalizeRel:(v:string)=>v, v60GitFileDiff:async()=>({diff:''}), readPackageJson:async()=>({scripts:{}}), detectPackageManager:async()=>'npm',
    executeProgram:async()=>({success:true,stdout:'',stderr:''}), v60PluginRegistry:async()=>({plugins:[]}), v60WriteJson:async()=>({}), readCodeIntelligenceGraph:async()=>null, v60ExecutionStream:async()=>({events:[]}), v50TaskBoard:async()=>({nodes:[]})
  });
  assert.equal(names.length,12);
  assert.deepEqual(names, ['lsp_diagnostics_v6','error_markers_v6','smart_file_explorer_v6','workspace_search_v6','diff_editor_v6','terminal_manager_v6','plugin_manager_v6','mcp_manager_v6','refactor_planner_v6','execution_stream_v6','ide_workspace_v6','ide_release_gate_v6']);
});

test('extracted v7 visual IDE catalog remains stable', () => {
  const names:string[] = [];
  registerV7VisualIdeTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    projectRoot: process.cwd(), layoutFile:'layout.json', diagnosticsFile:'diag.json', selectorFile:'selector.json', previewFile:'preview.json', themeFile:'theme.json', visualGateFile:'gate.json',
    result:(text:string)=>({content:[{type:'text',text}]}), errorResult:(error:unknown)=>({isError:true,error}),
    v70WorkspaceState:async()=>({}), v70Layout:async()=>({}), v60WriteJson:async()=>({}), v60Diagnostics:async()=>({status:'PASS',count:0,diagnostics:[],byFile:{}}),
    v60ReadJson:async()=>null, v70SelectorState:async()=>({}), v70PreviewState:async()=>({status:'IDLE',url:null}), executeProgram:async()=>({success:true,stdout:'',stderr:''}),
    v50TaskBoard:async()=>({nodes:[],counts:{}}), v70Theme:async()=>({})
  });
  assert.equal(names.length,11);
  assert.deepEqual(names, ['visual_ide_workspace_v7','panel_layout_v7','problems_panel_v7','agent_model_selector_v7','preview_session_v7','git_panel_v7','task_board_panel_v7','command_palette_v7','ui_theme_v7','workspace_snapshot_v7','visual_ide_gate_v7']);
});

test('extracted v8 workbench catalog remains stable', () => {
  const names:string[] = [];
  registerV8WorkbenchTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    projectRoot:process.cwd(), editorStateFile:'editor.json', editHistoryFile:'history.json', chatContextFile:'chat.json', diagnosticsFile:'diag.json',
    result:(text:string)=>({content:[{type:'text',text}]}), errorResult:(error:unknown)=>({isError:true,error}),
    v80WorkbenchState:async()=>({}), v80ReadTextFile:async()=>'', v80EditorState:async()=>({tabs:[],activeFile:null}), normalizeRel:(v:string)=>v, v60WriteJson:async()=>({}),
    v80WriteTextFile:async()=>({}), v80ApplyReplacement:async()=>({}), v60ReadJson:async()=>[], v80UndoRedo:async()=>({}), v60Diagnostics:async()=>({status:'PASS',diagnostics:[]}),
    readPackageJson:async()=>({scripts:{}}), detectPackageManager:async()=>'npm', executeProgram:async()=>({success:true,stdout:'',stderr:''}), safePath:(v:string)=>v,
    v50TaskBoard:async()=>({nodes:[]}), v70PreviewState:async()=>({url:null})
  });
  assert.equal(names.length,10);
  assert.deepEqual(names, ['workbench_state_v8','editor_open_file_v8','editor_save_file_v8','apply_patch_v8','edit_history_v8','editor_problems_v8','ai_file_context_v8','terminal_script_v8','git_commit_v8','workbench_gate_v8']);
});

test('extracted v9 engineering operations catalog remains stable', () => {
  const names:string[] = [];
  registerV9EngineeringOpsTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    projectRoot:process.cwd(), extensionDir:'.krom/extensions', profileFile:'profile.json', healthFile:'health.json', releaseFile:'release.json',
    result:(text:string)=>({content:[{type:'text',text}]}), errorResult:(error:unknown)=>({isError:true,error}), v90Processes:new Map(), v90TailPush:()=>{},
    v90DeclaredScripts:async()=>({scripts:{},packageManager:'npm'}), v90TestInventory:async()=>({}), v90ApiInventory:async()=>({}), v90DatabaseInventory:async()=>({}), v90EnvAudit:async()=>({}),
    safePath:(v:string)=>v, exists:async()=>false, normalizeRel:(v:string)=>v, v60ReadJson:async()=>({}), v60WriteJson:async()=>({}), v90DependencyDoctor:async()=>({}), v90Health:async()=>({}), v90ReleaseCenter:async()=>({})
  });
  assert.equal(names.length,11);
  assert.deepEqual(names, ['runtime_process_manager_v9','test_explorer_v9','debug_log_center_v9','api_inspector_v9','database_panel_v9','env_secrets_manager_v9','extension_sdk_v9','workspace_profile_v9','dependency_doctor_v9','project_health_dashboard_v9','release_center_v9']);
});

test('extracted v10 software factory catalog remains stable', () => {
  const names:string[] = [];
  registerV10SoftwareFactoryTools({ registerTool: (name:string) => { names.push(name); } } as any, {
    specFile:'spec.json', archFile:'arch.json', migrationFile:'migration.json', e2eFile:'e2e.json', visualRegressionFile:'visual.json', releaseNotesFile:'notes.json', cicdFile:'cicd.json', qualityBudgetFile:'budget.json',
    result:(text:string)=>({content:[{type:'text',text}]}), errorResult:(error:unknown)=>({isError:true,error}),
    v100SpecPipeline:async()=>({}), v100ArchitectureGraph:async()=>({}), v100MigrationPlanner:async()=>({}), v100E2EScenarios:async()=>({}), v100VisualRegression:async()=>({}),
    v100ReleaseNotes:async()=>({}), v100CicdOrchestrator:async()=>({}), v100QualityBudget:async()=>({}), v100TelemetryRecord:async()=>({}), v100Blueprint:async()=>({}), v100FactoryStatus:async()=>({})
  });
  assert.equal(names.length,11);
  assert.deepEqual(names, ['spec_to_code_pipeline_v10','architecture_graph_v10','migration_planner_v10','e2e_scenario_generator_v10','visual_regression_manager_v10','release_notes_generator_v10','cicd_orchestrator_v10','quality_budget_v10','engineering_telemetry_v10','project_blueprints_v10','software_factory_status_v10']);
});

test('extracted v11 reliability catalog remains stable', () => {
  const names:string[]=[];
  registerV11ReliabilityTools({registerTool:(name:string)=>{names.push(name);}} as any,{
    observabilityFile:'o.json',replayFile:'r.json',resilienceFile:'res.json',contractFile:'c.json',deployFile:'d.json',rollbackFile:'rb.json',sloFile:'slo.json',dependencyRiskFile:'dr.json',dataIntegrityFile:'di.json',productionReadinessFile:'pr.json',
    result:(text:string)=>({content:[{type:'text',text}]}),errorResult:(error:unknown)=>({isError:true,error}),
    v110Observability:async()=>({}),v110FailureReplay:async()=>({}),v110Resilience:async()=>({}),v110ContractTests:async()=>({}),v110FeatureFlags:async()=>({}),v110DeploymentStrategy:async()=>({}),v110RollbackPlan:async()=>({}),v110SloGate:async()=>({}),v110DependencyRisk:async()=>({}),v110DataIntegrity:async()=>({}),v110ProductionReadiness:async()=>({})
  });
  assert.equal(names.length,11);
  assert.deepEqual(names,['observability_center_v11','failure_replay_v11','resilience_lab_v11','contract_test_planner_v11','feature_flag_manager_v11','deployment_strategy_v11','rollback_automation_plan_v11','slo_release_gate_v11','dependency_risk_monitor_v11','data_integrity_guard_v11','production_readiness_review_v11']);
});

test('extracted v16-v20 registration preserves the 54-tool catalog', () => {
  const names:string[] = [];
  registerV16V20Tools({ registerTool: (name:string) => { names.push(name); } } as any, {} as any);
  assert.equal(names.length, 54);
  for (const required of [
    'tool_search_v16','workflow_compile_v17','verified_execution_start_v18',
    'refactor_dependency_graph_v19','architecture_drift_scan_v20','self_healing_status_v20'
  ]) assert.ok(names.includes(required), required);
});

test('extracted v21-v25 registration preserves the 63-tool catalog', () => {
  const names:string[] = [];
  registerV21V25Tools({ registerTool: (name:string) => { names.push(name); } } as any, {} as any);
  assert.equal(names.length, 63);
  for (const required of [
    'test_impact_intelligence_v21','quality_policy_init_v22','architecture_fitness_v23',
    'knowledge_graph_build_v24','design_token_audit_v25','design_intelligence_status_v25'
  ]) assert.ok(names.includes(required), required);
});

test('extracted v26-v31 registration preserves the 64-tool catalog', () => {
  const names:string[] = [];
  registerV26V31Tools({ registerTool: (name:string) => { names.push(name); } } as any, {} as any);
  assert.equal(names.length, 64);
  for (const required of [
    'design_system_tokens_v26','feature_spec_v27','feature_dependency_map_v28',
    'journey_map_v29','experiment_plan_v30','workspace_bootstrap_v31','install_status_v31'
  ]) assert.ok(names.includes(required), required);
});

test('server composition root contains no inline MCP tool registrations', async () => {
  const source = await fs.readFile(path.resolve('server.ts'), 'utf8');
  assert.equal((source.match(/server\.registerTool\(/g) || []).length, 0);
});

test('extracted prompt design service preserves generation and scoring behavior', () => {
  assert.equal(sanitizePromptName('  Safety Board / V45  '), 'Safety-Board-V45');
  const prompt = generatePrompt({
    goal: 'Build a responsive safety dashboard',
    projectType: 'Safety Board',
    mode: 'full',
    language: 'en',
    autonomy: 'strong',
    requirements: ['Preserve authentication'],
    constraints: ['Do not weaken security'],
    deliverables: ['Working dashboard'],
    includeVerification: true
  });
  assert.match(prompt, /KROM FORGE EXECUTION PROMPT/);
  assert.match(prompt, /VERIFICATION GATE/);
  assert.ok(scorePrompt(prompt).score >= 80);
  const visual = visualReviewScore('responsive hierarchy spacing typography contrast accessibility loading empty error mobile');
  assert.ok(typeof visual.score === 'number');
});

test('precision execution service persists requirements, changed files, and command evidence', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'krom-precision-service-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  const service = createPrecisionExecutionService({ safePath: (rel:string) => path.join(root, rel) });
  const requirements = service.extractRequirementsFromPrompt('- Build dashboard\n- Test mobile layout');
  assert.deepEqual(requirements, ['Build dashboard','Test mobile layout']);
  const now = new Date().toISOString();
  await service.writeExecutionManifest({
    version: 1, taskId: 't1', prompt: 'demo', createdAt: now, updatedAt: now,
    requirements: [{ id: 'R001', text: 'Build dashboard', status: 'pending' }],
    changedFiles: [], commandEvidence: [], blockers: []
  });
  await service.recordChangedFile('src\\app.ts');
  await service.recordCommandEvidence('typecheck', true, 'PASS');
  const saved = await service.readExecutionManifest();
  assert.ok(saved);
  assert.deepEqual(saved?.changedFiles, ['src/app.ts']);
  assert.equal(saved?.commandEvidence[0]?.command, 'typecheck');
  assert.equal(path.basename(await service.executionManifestPath()), EXECUTION_FILE);
  assert.equal(path.basename(path.dirname(await service.executionManifestPath())), EXECUTION_DIR);
});

test('v3.7 autopilot start uses the injected state bindings', async () => {
  const handlers = new Map<string, any>();
  const server:any = { registerTool: (name:string, _config:any, handler:any) => { handlers.set(name, handler); } };
  let written:any = null;
  registerV37AutopilotTools(server, {
    taskGraphFile: 'task-graph.json',
    autopilotHistoryFile: 'autopilot-history.json',
    result: (text:string) => ({ content: [{ type: 'text', text }] }),
    errorResult: (error:unknown) => ({ isError: true, error }),
    createAutopilotCheckpoint: async () => ({ id: 'CP-1' }),
    createCouncilSession: async () => ({ id: 'C-1', requiredAgents: [], status: 'READY' }),
    buildSmartContext: async () => ({ selected: [], omittedHighRisk: [] }),
    decideExecutionStrategy: () => ({ mode: 'NARROW', risk: 'LOW' }),
    buildChangeSimulation: async () => ({ id: 'SIM-1', risk: 'LOW', affectedFiles: [], affectedRoutes: [] }),
    evaluatePreflight: async () => ({ status: 'READY' }),
    buildTaskGraph: () => ({ nodes: [] }),
    kromStatePath: async (file:string) => path.join(os.tmpdir(), file),
    writeAutopilotState: async (state:any) => { written = state; },
    appendAutopilotHistory: async () => {},
    readAutopilotState: async () => written,
    nextAutopilotPhase: () => 'verify',
    restoreAutopilotCheckpoint: async () => ({ restored: 1 })
  });
  const response = await handlers.get('engineering_autopilot_start')({ task: 'Fix project safely', maxIterations: 3, checkpointFiles: [] });
  assert.ok(!response.isError);
  assert.equal(written?.status, 'ACTIVE');
  assert.equal(written?.checkpointId, 'CP-1');
});

test('autopilot service persists state, checkpoints files, and enforces phase rules', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-autopilot-service-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  await fs.writeFile(path.join(root,'a.txt'),'before','utf8');
  const stateRoot=path.join(root,'.krom');
  const service=createAutopilotService({
    projectRoot:root,
    maxFileSize:1024*1024,
    kromStatePath:async(file:string)=>{const p=path.join(stateRoot,file);await fs.mkdir(path.dirname(p),{recursive:true});return p;},
    safePath:(rel:string)=>path.join(root,rel),
    walkProject:async()=>[path.join(root,'a.txt')],
    isTextFile:()=>true
  });
  const state:any={id:'AP-1',task:'test',startedAt:new Date().toISOString(),updatedAt:'',phase:'execute',qualityScore:0,iteration:0,maxIterations:2,blockers:[],evidence:[],status:'ACTIVE'};
  await service.writeState(state);
  assert.equal((await service.readState())?.id,'AP-1');
  const cp=await service.createCheckpoint('before');
  await fs.writeFile(path.join(root,'a.txt'),'after','utf8');
  await service.restoreCheckpoint(cp.id);
  assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'before');
  assert.equal(service.nextPhase({...state,iteration:2},40,['x']),'blocked');
  assert.equal(service.nextPhase(state,95,[]),'release');
});

test('council service persists sessions and resolves evidence-weighted consensus', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-council-service-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  const service=createCouncilService({
    kromStatePath:async(file:string)=>{const p=path.join(root,file);await fs.mkdir(path.dirname(p),{recursive:true});return p;},
    taskTypeOf:()=> 'general',
    clampConfidence:(v:number)=>Math.max(0,Math.min(100,v))
  });
  const state:any=await service.createSession('Refactor safely');
  assert.ok(state.requiredAgents.includes('architect'));
  state.opinions=state.requiredAgents.map((agent:string)=>({agent,recommendation:'Proceed with narrow patch',risks:[],evidence:['test'],confidence:90,submittedAt:new Date().toISOString()}));
  const consensus:any=service.resolveConsensus(state);
  assert.equal(consensus.status,'CONSENSUS');
  await service.writeState({...state,status:'CONSENSUS',consensus});
  assert.equal((await service.readState())?.status,'CONSENSUS');
});

test('predictive engineering service builds scoped simulation and enforces checkpoint preflight', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-predictive-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  const service=createPredictiveEngineeringService({
    kromStatePath: async (file:string)=>path.join(root,file),
    readCodeIntelligenceGraph: async ()=>({
      nodes:{
        'src/a.ts':{file:'src/a.ts',imports:['src/b.ts'],importedBy:['src/c.ts'],routes:['/a'],kind:'source'},
        'src/b.ts':{file:'src/b.ts',imports:[],importedBy:['src/a.ts'],routes:[],kind:'source'},
        'src/c.ts':{file:'src/c.ts',imports:['src/a.ts'],importedBy:[],routes:['/c'],kind:'source'}
      },
      unresolvedImports:[]
    }),
    buildCodeIntelligenceGraph: async ()=>({nodes:{},unresolvedImports:[]}),
    buildSmartContext: async ()=>({selected:[{file:'src/a.ts'}]}),
    dependencyReach: (_g:any,starts:string[],direction:string)=>({all:direction==='dependencies'?['src/b.ts']:['src/c.ts']}),
    riskForImpact: ()=>({score:20,level:'LOW',reasons:[]}),
    normalizeRel: (v:string)=>v.replace(/\\/g,'/'),
    readAutopilotState: async ()=>null,
    decideExecutionStrategy: ()=>({mode:'FOCUSED_CHANGE',risk:'LOW',agents:['Developer']})
  });
  const sim=await service.buildChangeSimulation('change a',['src/a.ts'],2);
  assert.deepEqual(sim.targetFiles,['src/a.ts']);
  assert.ok(sim.affectedFiles.includes('src/b.ts'));
  assert.ok(sim.affectedFiles.includes('src/c.ts'));
  assert.equal(sim.risk.level,'LOW');
  const preflight=await service.evaluatePreflight(sim,true);
  assert.equal(preflight.status,'BLOCKED');
  assert.ok(preflight.blockers.some((x:string)=>x.includes('checkpoint')));
});

test('learning memory service persists bounded evidence and scores confidence conservatively', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-learning-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  const service=createLearningMemoryService({kromStatePath:async(file:string)=>path.join(root,file)});
  assert.equal(service.taskTypeOf('Fix login auth permission bug'),'repair');
  await service.writeLearningMemory([{
    id:'L1',at:new Date().toISOString(),taskType:'repair',task:'fix bug',outcome:'success',
    evidence:['test:pass'],lesson:'verify the failing path first',tags:['bug'],confidence:85,source:'runtime'
  }]);
  const rows=await service.readLearningMemory();
  assert.equal(rows.length,1);
  assert.equal(rows[0].confidence,85);
  const low=service.assessDecisionConfidence({contextFiles:0,evidence:[],unresolvedGaps:2,priorFailures:2,highRisk:true});
  assert.equal(low.band,'LOW');
  const high=service.assessDecisionConfidence({contextFiles:5,evidence:['a','b'],unresolvedGaps:0,priorSuccesses:3});
  assert.equal(high.band,'HIGH');
  const summary=service.summarizeLessons(rows,'fix another bug');
  assert.equal(summary.taskType,'repair');
  assert.equal(summary.successes,1);
});

test('code intelligence service builds local dependency graph and impact risk', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-code-intel-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'src'),{recursive:true});
  await fs.writeFile(path.join(root,'src','a.ts'),"import { b } from './b'; export const a=b;",'utf8');
  await fs.writeFile(path.join(root,'src','b.ts'),"export const b=1;",'utf8');
  const service=createCodeIntelligenceService({
    projectRoot:root,
    maxFileSize:1024*1024,
    walkProject:async()=>[path.join(root,'src','a.ts'),path.join(root,'src','b.ts')],
    isTextFile:()=>true,
    kromStatePath:async(file:string)=>path.join(root,file)
  });
  const graph=await service.buildCodeIntelligenceGraph();
  assert.equal(graph.stats.files,2);
  assert.ok(graph.nodes['src/a.ts'].imports.includes('src/b.ts'));
  assert.ok(graph.nodes['src/b.ts'].importedBy.includes('src/a.ts'));
  const reach=service.dependencyReach(graph,['src/a.ts'],'dependencies',2);
  assert.ok(reach.all.includes('src/b.ts'));
  const risk=service.riskForImpact(['src/a.ts'],['src/b.ts'],['/a'],false,false);
  assert.ok(['LOW','MEDIUM','HIGH'].includes(risk.level));
});

test('smart context service selects relevant files and produces conservative strategy', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-smart-context-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  const graph={
    nodes:{
      'src/auth.ts':{file:'src/auth.ts',imports:[],importedBy:['src/page.tsx'],exports:['login'],symbols:['login'],routes:[],kind:'service'},
      'src/page.tsx':{file:'src/page.tsx',imports:['src/auth.ts'],importedBy:[],exports:['Page'],symbols:['Page'],routes:['/login'],kind:'route-or-page'}
    },
    unresolvedImports:[]
  };
  const service=createSmartContextService({
    projectRoot:root,
    readProjectMemory:async()=>({stack:['ts'],conventions:[],designRules:[],recentDecisions:[]}),
    readExecutionManifest:async()=>({changedFiles:['src/auth.ts']}),
    readCodeIntelligenceGraph:async()=>graph,
    buildCodeIntelligenceGraph:async()=>graph,
    dependencyReach:()=>({all:[]}),
    kromStatePath:async(file:string)=>path.join(root,file)
  });
  const bundle=await service.buildSmartContext('fix login auth',10,50000,false);
  assert.ok(bundle.selected.some((x:any)=>x.file==='src/auth.ts'));
  const strategy=service.decideExecutionStrategy('fix login auth bug',bundle);
  assert.equal(strategy.mode,'REPAIR');
  assert.ok(strategy.agents.includes('Developer'));
});

test('repair service persists cycle state, fingerprints findings, and locates likely files', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'krom-repair-service-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'src'),{recursive:true});
  await fs.writeFile(path.join(root,'src','login.ts'),'export const loginError = true;','utf8');
  const service=createRepairService({
    projectRoot:root,
    kromStatePath:async(file:string)=>path.join(root,file),
    runNpmScriptIfPresent:async()=>({available:false,success:null,stdout:'',stderr:''}),
    readLatestLiveBrowserReport:async()=>null,
    readExecutionManifest:async()=>null,
    walkProject:async()=>[path.join(root,'src','login.ts')],
    isTextFile:()=>true
  });
  const state:any={version:1,cycleId:'R1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),maxIterations:3,iteration:1,status:'ACTIVE',lastFingerprint:'',repeatedFingerprintCount:0,findings:[],history:[]};
  await service.writeRepairState(state);
  assert.equal((await service.readRepairState())?.cycleId,'R1');
  const findings:any[]=[{id:'F1',source:'typecheck',severity:'major',message:'loginError undefined'}];
  assert.equal(service.repairFingerprint(findings),service.repairFingerprint(findings));
  const likely=await service.locateLikelyFiles(findings,5);
  assert.ok(likely.some((x:any)=>x.file==='src/login.ts'));
});
