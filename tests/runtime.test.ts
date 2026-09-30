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
import { registerPromptStudioTools } from '../src/prompt-studio-tools.js';
import { registerVisualDesignerTools } from '../src/visual-designer-tools.js';
import { registerV3CoreTools } from '../src/v3-core-tools.js';
import { registerV31BrowserTools } from '../src/v31-browser-tools.js';
import { registerV32RepairTools } from '../src/v32-repair-tools.js';
import { registerV33CodeIntelligenceTools } from '../src/v33-code-intelligence-tools.js';
import { registerV34ContextDecisionTools } from '../src/v34-context-decision-tools.js';
import { registerV35AdaptiveRuntimeTools } from '../src/v35-adaptive-runtime-tools.js';
import { registerV36LearningTools } from '../src/v36-learning-tools.js';
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
    appDisplayVersion: 'v45.0'
  });
  assert.match(html, /KSA-FORGE-DEV/);
  assert.match(html, /v45\.0/);
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
    detectPackageManager: async () => 'npm'
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
    runNpmScriptIfPresent: async () => ({ available: false, success: null })
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
    readLatestLiveBrowserReport: async () => null
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
    locateLikelyFiles: async () => []
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
