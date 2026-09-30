import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV9EngineeringOpsTools(
  server: any,
  deps: {
    projectRoot: string;
    extensionDir: string;
    profileFile: string;
    healthFile: string;
    releaseFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    v90Processes: Map<string, any>;
    v90TailPush: (...args: any[]) => void;
    v90DeclaredScripts: () => Promise<any>;
    v90TestInventory: () => Promise<any>;
    v90ApiInventory: () => Promise<any>;
    v90DatabaseInventory: () => Promise<any>;
    v90EnvAudit: () => Promise<any>;
    safePath: (relativePath: string) => string;
    exists: (target: string) => Promise<boolean>;
    normalizeRel: (value: string) => string;
    v60ReadJson: (...args: any[]) => Promise<any>;
    v60WriteJson: (...args: any[]) => Promise<any>;
    v90DependencyDoctor: () => Promise<any>;
    v90Health: (...args: any[]) => Promise<any>;
    v90ReleaseCenter: () => Promise<any>;
  }
) {
  const {
    projectRoot,
    extensionDir,
    profileFile,
    healthFile,
    releaseFile,
    result,
    errorResult,
    v90Processes,
    v90TailPush,
    v90DeclaredScripts,
    v90TestInventory,
    v90ApiInventory,
    v90DatabaseInventory,
    v90EnvAudit,
    safePath,
    exists,
    normalizeRel,
    v60ReadJson,
    v60WriteJson,
    v90DependencyDoctor,
    v90Health,
    v90ReleaseCenter
  } = deps;

  // =========================================================
  // KROM FORGE DEV v9.0 - ENGINEERING OPERATIONS TOOLS
  // =========================================================
  server.registerTool(
    "runtime_process_manager_v9",
    {title:"Runtime Process Manager v9",description:"Start, inspect, and stop declared package.json scripts as managed long-running workspace processes.",inputSchema:z.object({action:z.enum(["list","start","stop"]).default("list"),name:z.string().optional(),script:z.string().optional()}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
    async({action,name,script})=>{try{if(action==="list")return result(JSON.stringify({processes:[...v90Processes.entries()].map(([id,x])=>({id,command:x.command,startedAt:x.startedAt,running:x.process.exitCode===null,exitCode:x.process.exitCode,stdout:x.stdout.slice(-40),stderr:x.stderr.slice(-40)}))},null,2)); if(action==="start"){const {scripts,packageManager}=await v90DeclaredScripts(); const key=name||script||"runtime"; if(!script||typeof scripts[script]!=="string")throw new Error(`Unknown package script: ${script||''}`); if(v90Processes.has(key)&&v90Processes.get(key)!.process.exitCode===null)throw new Error(`Process already running: ${key}`); const cp=spawn(packageManager,["run",script],{cwd:projectRoot,stdio:["ignore","pipe","pipe"],shell:false}); const rec={process:cp,command:`${packageManager} run ${script}`,startedAt:new Date().toISOString(),stdout:[] as string[],stderr:[] as string[]}; cp.stdout?.on("data",c=>v90TailPush(rec.stdout,c)); cp.stderr?.on("data",c=>v90TailPush(rec.stderr,c)); v90Processes.set(key,rec); return result(JSON.stringify({status:"STARTED",id:key,pid:cp.pid,command:rec.command},null,2));} const key=name||script; if(!key||!v90Processes.has(key))throw new Error(`Unknown process: ${key||''}`); const rec=v90Processes.get(key)!; if(rec.process.exitCode===null)rec.process.kill(); return result(JSON.stringify({status:"STOP_REQUESTED",id:key,pid:rec.process.pid},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "test_explorer_v9",
    {title:"Test Explorer v9",description:"Discover project tests and declared test/e2e scripts for an IDE-style Test Explorer.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90TestInventory())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "debug_log_center_v9",
    {title:"Debug & Log Center v9",description:"Return bounded logs from KROM-managed runtime processes without exposing unrelated system processes.",inputSchema:z.object({process:z.string().optional(),limit:z.number().int().min(1).max(200).default(80)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({process:proc,limit})=>{try{const rows=[...v90Processes.entries()].filter(([id])=>!proc||id===proc).map(([id,x])=>({id,command:x.command,running:x.process.exitCode===null,exitCode:x.process.exitCode,stdout:x.stdout.slice(-limit),stderr:x.stderr.slice(-limit)}));return result(JSON.stringify({status:"OK",processes:rows},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "api_inspector_v9",
    {title:"API Inspector v9",description:"Inspect likely frontend API clients and backend route handlers to support contract review and request debugging.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90ApiInventory())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "database_panel_v9",
    {title:"Database Panel v9",description:"Inventory SQL migrations, Supabase-related files and redacted database environment signals for the IDE.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90DatabaseInventory())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "env_secrets_manager_v9",
    {title:"Environment & Secrets Manager v9",description:"Audit required environment-variable names against the current process while always redacting secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90EnvAudit())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "extension_sdk_v9",
    {title:"Extension SDK v9",description:"Create or inspect a safe local KROM extension manifest scaffold under .krom/extensions. Does not execute extension code.",inputSchema:z.object({action:z.enum(["list","scaffold"]).default("list"),id:z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional(),name:z.string().optional(),capabilities:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,id,name,capabilities})=>{try{const dir=safePath(extensionDir);await fs.mkdir(dir,{recursive:true});if(action==="list"){const items=await fs.readdir(dir,{withFileTypes:true});const manifests:any[]=[];for(const x of items.filter(x=>x.isDirectory())){const f=path.join(dir,x.name,"manifest.json");try{manifests.push(JSON.parse(await fs.readFile(f,"utf8")))}catch{}}return result(JSON.stringify({status:"OK",extensions:manifests},null,2));}if(!id)throw new Error("id is required");const extDir=path.join(dir,id);await fs.mkdir(extDir,{recursive:true});const manifest={schemaVersion:1,id,name:name||id,capabilities,enabled:false,createdAt:new Date().toISOString(),entry:"index.ts"};await fs.writeFile(path.join(extDir,"manifest.json"),JSON.stringify(manifest,null,2));const entry=path.join(extDir,"index.ts");if(!(await exists(entry)))await fs.writeFile(entry,"// KROM extension scaffold. Register capabilities explicitly before execution.\n");return result(JSON.stringify({status:"SCAFFOLDED",manifest,path:normalizeRel(path.relative(projectRoot,extDir))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workspace_profile_v9",
    {title:"Workspace Profile v9",description:"Read or update a persistent workspace profile for preferred scripts, preview URL, quality gates and required environment names.",inputSchema:z.object({action:z.enum(["get","set"]).default("get"),profile:z.object({devScript:z.string().optional(),testScript:z.string().optional(),buildScript:z.string().optional(),previewUrl:z.string().url().optional(),requiredEnv:z.array(z.string()).optional(),notes:z.array(z.string()).optional()}).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,profile})=>{try{let cur=await v60ReadJson(profileFile,{});if(action==="set"){cur={...cur,...(profile||{}),updatedAt:new Date().toISOString()};await v60WriteJson(profileFile,cur);}return result(JSON.stringify({status:"OK",profile:cur,file:`.krom/${profileFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "dependency_doctor_v9",
    {title:"Dependency Doctor v9",description:"Inspect package manager, Node engine, lockfiles and dependency reproducibility signals.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90DependencyDoctor())},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "project_health_dashboard_v9",
    {title:"Project Health Dashboard v9",description:"Compute an evidence-based project-health score from diagnostics, tests, env requirements, dependencies, API/database footprint and Git state.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90Health()),file:`.krom/${healthFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "release_center_v9",
    {title:"Release Center v9",description:"Aggregate project health and available gate evidence into one release-readiness decision before final deployment.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify({status:"OK",...(await v90ReleaseCenter()),file:`.krom/${releaseFile}`},null,2));}catch(error){return errorResult(error);}}
  );


  
}
