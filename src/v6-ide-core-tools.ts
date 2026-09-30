import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV6IdeCoreTools(
  server: any,
  deps: {
    projectRoot: string;
    maxFileSize: number;
    diagnosticsFile: string;
    workspaceFile: string;
    pluginsFile: string;
    gateFile: string;
    port: number;
    result: ResultFn;
    errorResult: ErrorResultFn;
    v60Diagnostics: () => Promise<any>;
    v60ReadJson: (...args: any[]) => Promise<any>;
    v60WorkspaceIndex: (...args: any[]) => Promise<any>;
    walkProject: (...args: any[]) => Promise<string[]>;
    isTextFile: (file: string) => boolean;
    normalizeRel: (value: string) => string;
    v60GitFileDiff: (...args: any[]) => Promise<any>;
    readPackageJson: () => Promise<any>;
    detectPackageManager: () => Promise<any>;
    executeProgram: (...args: any[]) => Promise<any>;
    v60PluginRegistry: () => Promise<any>;
    v60WriteJson: (...args: any[]) => Promise<any>;
    readCodeIntelligenceGraph: () => Promise<any>;
    v60ExecutionStream: () => Promise<any>;
    v50TaskBoard: () => Promise<any>;
  }
) {
  const {
    projectRoot,
    maxFileSize,
    diagnosticsFile,
    workspaceFile,
    pluginsFile,
    gateFile,
    port,
    result,
    errorResult,
    v60Diagnostics,
    v60ReadJson,
    v60WorkspaceIndex,
    walkProject,
    isTextFile,
    normalizeRel,
    v60GitFileDiff,
    readPackageJson,
    detectPackageManager,
    executeProgram,
    v60PluginRegistry,
    v60WriteJson,
    readCodeIntelligenceGraph,
    v60ExecutionStream,
    v50TaskBoard
  } = deps;

  // =========================================================
  // KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY
  // =========================================================
  server.registerTool(
    "lsp_diagnostics_v6",
    {title:"LSP Diagnostics v6",description:"Run project type/lint diagnostics and normalize file/line markers for IDE-style error rendering.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v60Diagnostics(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "error_markers_v6",
    {title:"Error Markers v6",description:"Return the latest normalized diagnostics as editor gutter markers grouped by file.",inputSchema:z.object({refresh:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh})=>{try{const d=refresh?await v60Diagnostics():await v60ReadJson(diagnosticsFile,null)||await v60Diagnostics();const markers=Object.entries(d.byFile||{}).map(([file,items]:any)=>({file,markers:items.map((x:any)=>({line:x.line,column:x.column,severity:x.severity,code:x.code,message:x.message,source:x.source}))}));return result(JSON.stringify({status:d.status,total:d.count,files:markers.length,markers},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "smart_file_explorer_v6",
    {title:"Smart File Explorer v6",description:"Build an IDE-oriented project index with hotspots, routes, tests, sizes and code-density signals.",inputSchema:z.object({refresh:z.boolean().default(true),limit:z.number().int().min(100).max(6000).default(3500)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh,limit})=>{try{const idx=refresh?await v60WorkspaceIndex(limit):await v60ReadJson(workspaceFile,null)||await v60WorkspaceIndex(limit);return result(JSON.stringify({status:'OK',count:idx.count,hotspots:idx.hotspots,routes:idx.files.filter((x:any)=>x.routeSignal).slice(0,200),tests:idx.files.filter((x:any)=>x.testSignal).slice(0,200),largest:[...idx.files].sort((a:any,b:any)=>b.bytes-a.bytes).slice(0,80),file:`.krom/${workspaceFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workspace_search_v6",
    {title:"Workspace Search v6",description:"Search indexed workspace filenames and source content with ranked results suitable for an IDE command palette.",inputSchema:z.object({query:z.string().min(1),maxResults:z.number().int().min(1).max(200).default(50)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({query,maxResults})=>{try{const files=await walkProject(projectRoot,[],3500);const q=query.toLowerCase();const hits:any[]=[];for(const abs of files){if(!isTextFile(abs))continue;const rel=normalizeRel(path.relative(projectRoot,abs));let score=0;if(rel.toLowerCase().includes(q))score+=100;try{const st=await fs.stat(abs);if(st.size>maxFileSize)continue;const txt=await fs.readFile(abs,'utf8');const low=txt.toLowerCase();const idx=low.indexOf(q);if(idx>=0){score+=40;const before=txt.slice(0,idx).split(/\r?\n/).length;hits.push({file:rel,score,line:before,preview:txt.slice(Math.max(0,idx-120),Math.min(txt.length,idx+query.length+180)).replace(/\s+/g,' ')});}else if(score)hits.push({file:rel,score,line:null,preview:null});}catch{}}hits.sort((a,b)=>b.score-a.score);return result(JSON.stringify({query,count:hits.length,results:hits.slice(0,maxResults)},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "diff_editor_v6",
    {title:"Diff Editor v6",description:"Return a structured git diff for one project file for before/after IDE review.",inputSchema:z.object({file:z.string().min(1)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({file})=>{try{const d=await v60GitFileDiff(file);const added=(d.diff.match(/^\+(?!\+)/gm)||[]).length;const removed=(d.diff.match(/^-(?!--)/gm)||[]).length;return result(JSON.stringify({...d,added,removed,hasChanges:!!d.diff.trim()},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "terminal_manager_v6",
    {title:"Terminal Manager v6",description:"Inspect package scripts and optionally run one declared project script without arbitrary shell evaluation.",inputSchema:z.object({action:z.enum(['list','run']).default('list'),script:z.string().optional(),timeoutSeconds:z.number().int().min(1).max(300).default(180)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
    async({action,script,timeoutSeconds})=>{try{const pkg=await readPackageJson()||{};const scripts=pkg.scripts||{};if(action==='list')return result(JSON.stringify({packageManager:await detectPackageManager(),scripts},null,2));if(!script||typeof scripts[script]!=='string')throw new Error(`Unknown package script: ${script||''}`);const pm=await detectPackageManager();const ex=await executeProgram(pm,['run',script],projectRoot,timeoutSeconds*1000);return result(JSON.stringify({script,command:`${pm} run ${script}`,success:ex.success,code:ex.code??0,stdout:ex.stdout,stderr:ex.stderr},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "plugin_manager_v6",
    {title:"Plugin Manager v6",description:"Manage KROM local plugin metadata/enablement. This registry does not download or execute untrusted plugins.",inputSchema:z.object({action:z.enum(['list','register','enable','disable','remove']).default('list'),id:z.string().optional(),name:z.string().optional(),entry:z.string().optional(),capabilities:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,id,name,entry,capabilities})=>{try{const reg=await v60PluginRegistry();if(action==='list')return result(JSON.stringify(reg,null,2));if(!id)throw new Error('id is required');const i=reg.plugins.findIndex((p:any)=>p.id===id);if(action==='register'){const item={id,name:name||id,entry:entry||null,capabilities,enabled:false,registeredAt:new Date().toISOString()};if(i>=0)reg.plugins[i]={...reg.plugins[i],...item};else reg.plugins.push(item);}else if(action==='remove'){if(i>=0)reg.plugins.splice(i,1);}else{if(i<0)throw new Error(`Plugin not registered: ${id}`);reg.plugins[i].enabled=action==='enable';reg.plugins[i].updatedAt=new Date().toISOString();}await v60WriteJson(pluginsFile,reg);return result(JSON.stringify({status:'OK',registry:reg,file:`.krom/${pluginsFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "mcp_manager_v6",
    {title:"MCP Manager v6",description:"Discover MCP configuration signals and KROM server endpoint metadata without exposing secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{const files=await walkProject(projectRoot,[],2500);const candidates=files.filter(f=>/mcp|\.cursor|claude|codex|settings\.json/i.test(path.basename(f))).slice(0,100).map(f=>normalizeRel(path.relative(projectRoot,f)));const envNames=Object.keys(process.env).filter(k=>/MCP|KROM|SUPABASE|VERCEL|GITHUB/i.test(k)).map(k=>({name:k,present:true,value:'[REDACTED]'}));return result(JSON.stringify({server:{name:'KSA-FORGE-DEV',version:'6.0.0',endpoint:`http://127.0.0.1:${port}/mcp`,project:projectRoot},configCandidates:candidates,environmentSignals:envNames,rule:'Secret values are never returned.'},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "refactor_planner_v6",
    {title:"Refactor Planner v6",description:"Create a low-risk refactor plan from code-intelligence impact, git state and diagnostics before structural edits.",inputSchema:z.object({files:z.array(z.string()).min(1).max(50),goal:z.string().min(3)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({files,goal})=>{try{const graph=await readCodeIntelligenceGraph();const rows:any[]=[];for(const f0 of files){const f=normalizeRel(f0);const node=graph?.nodes?.[f];rows.push({file:f,importedBy:(node?.importedBy||[]).slice(0,80),imports:(node?.imports||[]).slice(0,80),blastRadius:(node?.importedBy||[]).length,risk:(node?.importedBy||[]).length>15?'HIGH':(node?.importedBy||[]).length>5?'MEDIUM':'LOW'});}const plan={goal,targets:rows,steps:['Create/verify checkpoint','Run baseline diagnostics/tests','Refactor smallest dependency layer first','Re-run diagnostics after each structural step','Run impacted route/browser checks','Review diff and regression scope before release'],rule:'Do not mix unrelated refactors with feature changes.'};return result(JSON.stringify(plan,null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "execution_stream_v6",
    {title:"Execution Stream v6",description:"Return a Codex-style public execution status stream from Autopilot, task graph, diagnostics and preflight state without exposing hidden reasoning.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v60ExecutionStream(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ide_workspace_v6",
    {title:"IDE Workspace v6",description:"Build a consolidated IDE workspace model: files, diagnostics, tasks, git changes, scripts, plugins and execution status.",inputSchema:z.object({refresh:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh})=>{try{const idx=refresh?await v60WorkspaceIndex():await v60ReadJson(workspaceFile,null)||await v60WorkspaceIndex();const diag=refresh?await v60Diagnostics():await v60ReadJson(diagnosticsFile,null)||await v60Diagnostics();const board=await v50TaskBoard();const git=await executeProgram('git',['status','--short'],projectRoot,60000);const pkg=await readPackageJson()||{};const plugins=await v60PluginRegistry();const stream=await v60ExecutionStream();return result(JSON.stringify({status:'OK',project:projectRoot,files:{count:idx.count,hotspots:idx.hotspots.slice(0,30)},diagnostics:{status:diag.status,count:diag.count},tasks:board,git:{success:git.success,status:git.stdout},scripts:pkg.scripts||{},plugins,execution:stream.events,file:`.krom/${workspaceFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ide_release_gate_v6",
    {title:"IDE Release Gate v6",description:"Aggregate IDE diagnostics, task state, git regression scope and v5 engineering gate into a strict v6 pre-release decision.",inputSchema:z.object({allowWarnings:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({allowWarnings})=>{try{const diag=await v60Diagnostics();const board=await v50TaskBoard();const git=await executeProgram('git',['status','--short'],projectRoot,60000);const blockers:any[]=[];if(diag.diagnostics.some((d:any)=>d.severity==='error'))blockers.push({type:'diagnostics',count:diag.diagnostics.filter((d:any)=>d.severity==='error').length});if(!allowWarnings&&diag.diagnostics.some((d:any)=>d.severity==='warning'))blockers.push({type:'warnings',count:diag.diagnostics.filter((d:any)=>d.severity==='warning').length});const openTasks=(board.nodes||[]).filter((n:any)=>n.status!=='verified'&&n.status!=='done');if(openTasks.length)blockers.push({type:'tasks',count:openTasks.length,items:openTasks.slice(0,30)});const decision=blockers.length?'BLOCKED':'READY_FOR_RUNTIME_RELEASE_GATE';const audit={at:new Date().toISOString(),decision,blockers,diagnostics:{status:diag.status,count:diag.count},gitDirty:!!(git.stdout||'').trim(),rule:'This gate does not replace browser, security, database, product-readiness, or deployment verification.'};await v60WriteJson(gateFile,audit);return result(JSON.stringify({status:decision,audit,file:`.krom/${gateFile}`},null,2));}catch(error){return errorResult(error);}}
  );



}
