import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV5EngineeringSuiteTools(
  server: any,
  deps: {
    projectRoot: string;
    taskBoardFile: string;
    auditFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    v50TaskKind: (task: string) => string;
    runPackageScript: (...args: any[]) => Promise<any>;
    v50ApiContractScan: () => Promise<any>;
    v50DatabaseScan: () => Promise<any[]>;
    v50ScanPatterns: (...args: any[]) => Promise<any[]>;
    walkProject: (...args: any[]) => Promise<string[]>;
    executeProgram: (...args: any[]) => Promise<any>;
    readCodeIntelligenceGraph: () => Promise<any>;
    normalizeRel: (value: string) => string;
    v50TaskBoard: () => Promise<any>;
    readProductBlueprint: () => Promise<any>;
    scanFeatureEvidence: (...args: any[]) => Promise<any>;
    kromStatePath: (file: string) => Promise<string>;
  }
) {
  const {
    projectRoot,
    taskBoardFile,
    auditFile,
    result,
    errorResult,
    v50TaskKind,
    runPackageScript,
    v50ApiContractScan,
    v50DatabaseScan,
    v50ScanPatterns,
    walkProject,
    executeProgram,
    readCodeIntelligenceGraph,
    normalizeRel,
    v50TaskBoard,
    readProductBlueprint,
    scanFeatureEvidence,
    kromStatePath
  } = deps;

  // =========================================================
  // v5.0 AUTONOMOUS ENGINEERING SUITE TOOLS
  // =========================================================
  server.registerTool(
    "model_router_v5",
    {
      title:"Adaptive Model Router v5",
      description:"Classify the current engineering task and recommend model capability, reasoning depth, context strategy, and fallback policy without assuming any provider is configured.",
      inputSchema:z.object({task:z.string().min(3),availableModels:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({task,availableModels})=>{try{const kind=v50TaskKind(task);const complexity=(task.length>1200||/multiple|full|complete|entire|كامل|شامل/.test(task.toLowerCase()))?"HIGH":task.length>300?"MEDIUM":"LOW";const capability=kind==="ui"?"coding + visual reasoning":kind==="architecture"?"high reasoning + code intelligence":kind==="debug"?"coding + diagnostic reasoning":kind==="security"?"security reasoning + code audit":"coding + tool use";return result(JSON.stringify({status:"OK",kind,complexity,requiredCapability:capability,recommendedReasoning:complexity==="HIGH"?"high":"medium",availableModels,selectionRule:availableModels.length?"Choose the strongest available model matching the required capability; fall back only after a recorded failure.":"No model inventory supplied; return capability requirements instead of inventing a model.",contextPolicy:"Use smart_context_build first; expand only when context_gap_check identifies missing evidence.",fallbackPolicy:"Do not repeat the same failed model/strategy without new evidence."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "diagnostics_intelligence_v5",
    {
      title:"Diagnostics Intelligence v5",
      description:"Run available typecheck/lint/test scripts and normalize failures into an actionable diagnostics report with file/line hints when present.",
      inputSchema:z.object({includeTests:z.boolean().default(false)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({includeTests})=>{try{const tc=await runPackageScript(["typecheck","type-check","check:types"]);const lint=await runPackageScript(["lint"]);const tests=includeTests?await runPackageScript(["test","test:unit"]):{status:"SKIPPED",reason:"includeTests=false"};const raw=[tc,lint,tests].map((x:any)=>[x.stdout,x.stderr,x.message].filter(Boolean).join("\n")).join("\n");const refs=[...raw.matchAll(/([^\s:]+\.(?:ts|tsx|js|jsx|vue|svelte))[:(](\d+)(?::(\d+))?/g)].slice(0,120).map(m=>({file:m[1],line:Number(m[2]),column:m[3]?Number(m[3]):null}));const status=[tc,lint,tests].some((x:any)=>x.status==='FAIL')?'FAIL':'PASS_OR_SKIPPED';return result(JSON.stringify({status,typecheck:tc,lint,tests,diagnosticLocations:refs,nextAction:status==='FAIL'?"Use repair_source_locator + impact_analysis before patching.":"Continue to targeted regression/browser gates."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "api_contract_intelligence_v5",
    {
      title:"API Contract Intelligence v5",
      description:"Map server endpoints and client fetch calls, flag likely unmatched API contracts, and produce integration review targets.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const scan=await v50ApiContractScan();const epPaths=new Set(scan.endpoints.map((e:any)=>e.path));const unmatched=scan.clients.filter((c:any)=>c.path.startsWith('/')&&!Array.from(epPaths).some((p:any)=>c.path.startsWith(String(p).replace(/:\w+/g,''))));return result(JSON.stringify({status:"OK",endpointCount:scan.endpoints.length,clientCallCount:scan.clients.length,endpoints:scan.endpoints,clientCalls:scan.clients,reviewTargets:unmatched.slice(0,100),warning:"Static matching cannot prove runtime compatibility; verify auth, validation, payloads and responses with executable tests."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "database_architect_v5",
    {
      title:"Database Architect v5",
      description:"Inspect database and Supabase-related files for schema, indexes, RLS and migration evidence, then return architecture gaps without mutating production data.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const signals=await v50DatabaseScan();const totals=signals.reduce((a:any,x:any)=>({tables:a.tables+x.tables,policies:a.policies+x.policies,rls:a.rls+x.rls,indexes:a.indexes+x.indexes}),{tables:0,policies:0,rls:0,indexes:0});const risks:any[]=[];if(totals.tables>0&&totals.rls===0)risks.push("Tables detected but no ENABLE ROW LEVEL SECURITY evidence found in scanned files.");if(totals.tables>3&&totals.indexes===0)risks.push("Multiple tables detected with no explicit index evidence; review query patterns before release.");return result(JSON.stringify({status:risks.length?"REVIEW_REQUIRED":"OK",totals,files:signals,risks,rules:["Use migrations for schema changes","Do not disable RLS to make errors disappear","Validate foreign keys and uniqueness","Add indexes based on actual query patterns"]},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "security_auditor_v5",
    {
      title:"Security Auditor v5",
      description:"Perform a focused static security audit for exposed secrets, weak RLS patterns, dangerous HTML injection, broad CORS/auth bypass markers, and service-role exposure.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const findings=await v50ScanPatterns([{name:"Supabase service role in source",re:/service_role|SUPABASE_SERVICE_ROLE/i,severity:"CRITICAL"},{name:"Permissive RLS policy",re:/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i,severity:"MAJOR"},{name:"Dangerous HTML injection",re:/dangerouslySetInnerHTML|innerHTML\s*=/i,severity:"MAJOR"},{name:"Wildcard CORS",re:/access-control-allow-origin[^\n]*\*/i,severity:"MAJOR"},{name:"Hardcoded secret-like token",re:/(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}/i,severity:"CRITICAL"}],2200);const critical=findings.filter(f=>f.severity==='CRITICAL').length;return result(JSON.stringify({status:critical?"BLOCKED":findings.length?"REVIEW_REQUIRED":"NO_STATIC_FINDINGS",critical,count:findings.length,findings,rule:"Static findings require review; absence of findings is not proof of security. Never expose service-role keys in frontend code."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "performance_intelligence_v5",
    {
      title:"Performance Intelligence v5",
      description:"Inspect source for common frontend/data performance risks such as oversized assets, unbounded fetch patterns, eager imports and large source files.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const files=await walkProject(projectRoot,[],2600);const large:any[]=[];for(const f of files){try{const st=await fs.stat(f);if(st.size>400000&&!/lock|\.map$/.test(f))large.push({file:path.relative(projectRoot,f),bytes:st.size});}catch{}}const patterns=await v50ScanPatterns([{name:"Potential unbounded data fetch",re:/select\s*\(\s*["'`]\*["'`]\s*\)|\.select\(\s*["'`]\*["'`]\s*\)/i,severity:"MEDIUM"},{name:"Large inline base64 asset",re:/data:image\/[a-z+]+;base64,[A-Za-z0-9+/]{5000,}/i,severity:"MAJOR"},{name:"Window resize listener",re:/addEventListener\(\s*["']resize["']/i,severity:"LOW"}],1800);return result(JSON.stringify({status:(large.length||patterns.length)?"REVIEW_REQUIRED":"OK",largeFiles:large.slice(0,80),sourceSignals:patterns.slice(0,120),recommendations:["Measure before optimizing","Paginate large datasets","Lazy-load heavy routes/assets","Verify bundle and network behavior in production build"]},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "accessibility_auditor_v5",
    {
      title:"Accessibility Auditor v5",
      description:"Run a static accessibility review for common React/HTML issues and return targets for browser-level verification.",
      inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const findings=await v50ScanPatterns([{name:"Image may lack alt",re:/<img(?![^>]*\balt=)[^>]*>/i,severity:"MAJOR"},{name:"Clickable div without obvious keyboard semantics",re:/<div[^>]*onClick=/i,severity:"MEDIUM"},{name:"Input may lack accessible label",re:/<input(?![^>]*aria-label)(?![^>]*aria-labelledby)[^>]*>/i,severity:"MEDIUM"},{name:"Outline disabled",re:/outline\s*:\s*none/i,severity:"MEDIUM"}],1800);return result(JSON.stringify({status:findings.length?"REVIEW_REQUIRED":"NO_STATIC_FINDINGS",count:findings.length,findings,requiredRuntimeChecks:["keyboard navigation","focus visibility","dialog focus trap","contrast","screen-reader names","mobile touch targets"],warning:"Static scan is incomplete; browser accessibility verification remains required."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "git_regression_guardian_v5",
    {
      title:"Git Regression Guardian v5",
      description:"Inspect git working changes, combine them with impact analysis, and produce a regression verification scope before commit or release.",
      inputSchema:z.object({baseRef:z.string().default("HEAD")}),annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({baseRef})=>{try{const st=await executeProgram('git',['status','--short'],projectRoot,60000);const diff=await executeProgram('git',['diff','--name-only',baseRef],projectRoot,60000);const changed=(diff.stdout||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const graph=await readCodeIntelligenceGraph();const impacted=new Set<string>();if(graph)for(const f of changed){impacted.add(f);const node=graph.nodes[normalizeRel(f)];if(node)for(const dep of node.importedBy||[])impacted.add(dep);}return result(JSON.stringify({status:st.success?'OK':'GIT_UNAVAILABLE',workingTree:st.stdout,changedFiles:changed,impactedFiles:Array.from(impacted).slice(0,300),requiredChecks:["typecheck","targeted tests","affected routes browser test","visual review for UI changes","security/database review when applicable"],rule:"Do not auto-commit when required gates are failing."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_task_board_v5",
    {
      title:"Engineering Task Board v5",
      description:"Build a consolidated task board from the task graph, precise-execution requirements and Autopilot state for clear progress visibility.",
      inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ()=>{try{const board=await v50TaskBoard();return result(JSON.stringify({status:"OK",board,file:`.krom/${taskBoardFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_suite_gate_v5",
    {
      title:"Engineering Suite Gate v5",
      description:"Aggregate product readiness, security, diagnostics, task completion and preflight evidence into a final v5 engineering decision. This does not replace runtime/browser evidence.",
      inputSchema:z.object({minimumProductScore:z.number().int().min(0).max(100).default(75)}),annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({minimumProductScore})=>{try{const board=await v50TaskBoard();let bp=await readProductBlueprint();const featureRows:any[]=[];if(bp)for(const f of bp.features)featureRows.push(await scanFeatureEvidence(f));const productBlockers=featureRows.filter(x=>x.score<minimumProductScore);const security=await v50ScanPatterns([{name:"service role exposure",re:/service_role|SUPABASE_SERVICE_ROLE/i,severity:"CRITICAL"},{name:"permissive RLS",re:/using\s*\(\s*true\s*\)/i,severity:"MAJOR"}],1800);const taskBlockers=(board.nodes||[]).filter((n:any)=>['blocked','in_progress','pending','ready'].includes(n.status));const decision=(productBlockers.length||security.some(x=>x.severity==='CRITICAL')||taskBlockers.length)?'BLOCKED':'READY_FOR_RUNTIME_RELEASE_GATES';const audit={at:new Date().toISOString(),decision,productBlockers,securityCritical:security.filter(x=>x.severity==='CRITICAL'),taskBlockers,rule:"READY here still requires executable build/test/browser/release evidence before deployment."};await fs.writeFile(await kromStatePath(auditFile),JSON.stringify(audit,null,2),'utf8');return result(JSON.stringify({status:decision,audit,file:`.krom/${auditFile}`},null,2));}catch(error){return errorResult(error);}}
  );



}
