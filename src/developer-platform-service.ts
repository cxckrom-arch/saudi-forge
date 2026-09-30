import fs from "node:fs/promises";
import path from "node:path";
import { APP_VERSION } from "./release-info.js";
import { chatMessages, completionUrl } from "./chat-context.js";

export function createDeveloperPlatformService(options: {
  kromHome: string;
  projectRoot: string;
  previewFile: string;
  v310RuntimeDoctor: (...args: any[]) => Promise<any> | any;
  v320AuthHeaders: (...args: any[]) => Promise<any> | any;
  v320NormalizeBase: (...args: any[]) => Promise<any> | any;
  v320ProviderHealth: (...args: any[]) => Promise<any> | any;
  v320ReadProfiles: (...args: any[]) => Promise<any> | any;
  v330SmartRoute: (...args: any[]) => Promise<any> | any;
  v340ControlStatus: (...args: any[]) => Promise<any> | any;
  v60Diagnostics: (...args: any[]) => Promise<any> | any;
  v60WriteJson: (...args: any[]) => Promise<any> | any;
  v80ReadTextFile: (...args: any[]) => Promise<any> | any;
  v80WorkbenchState: (...args: any[]) => Promise<any> | any;
  v90DependencyDoctor: (...args: any[]) => Promise<any> | any;
  v90Health: (...args: any[]) => Promise<any> | any;
  executeProgram: (...args: any[]) => Promise<any> | any;
  now?: () => number;
}) {
  const {
    kromHome,
    projectRoot,
    previewFile,
    v310RuntimeDoctor,
    v320AuthHeaders,
    v320NormalizeBase,
    v320ProviderHealth,
    v320ReadProfiles,
    v330SmartRoute,
    v340ControlStatus,
    v60Diagnostics,
    v60WriteJson,
    v80ReadTextFile,
    v80WorkbenchState,
    v90DependencyDoctor,
    v90Health,
    executeProgram
  } = options;
  const now = options.now || (() => Date.now());

// ===== v35.0 DEVELOPER PLATFORM: CHAT + PREVIEW =====
const V350_STATE_DIR = path.join(kromHome, ".krom", "v35-developer-platform");
const V350_CHAT_FILE = path.join(V350_STATE_DIR, "chat-history.json");
async function v350Ensure(){ await fs.mkdir(V350_STATE_DIR,{recursive:true}); }
async function v350ReadChat(){ await v350Ensure(); try{return JSON.parse(await fs.readFile(V350_CHAT_FILE,'utf8'));}catch{return {messages:[]};} }
async function v350WriteChat(messages:any[]){ await v350Ensure(); const out={version:APP_VERSION,updatedAt:new Date().toISOString(),messages:messages.slice(-80)}; await fs.writeFile(V350_CHAT_FILE,JSON.stringify(out,null,2),'utf8'); return out; }
function v350ContentFromOpenAI(data:any){ return String(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '').trim(); }
let v350ChatBusy=false;
const V350_CIRCUIT_FAILURE_THRESHOLD=2;
const V350_CIRCUIT_COOLDOWN_MS=60_000;
type V350CircuitState={failures:number;openUntil:number;lastError?:string;updatedAt:string;phase:'CLOSED'|'OPEN'|'HALF_OPEN';lastProbeAt?:string};
const v350ProviderCircuits=new Map<string,V350CircuitState>();

function v350CircuitSnapshot(){
  const current=now();
  return [...v350ProviderCircuits.entries()].map(([providerId,state])=>({
    providerId,
    failures:state.failures,
    phase:state.phase,
    open:state.phase==='OPEN'&&state.openUntil>current,
    openUntil:state.openUntil?new Date(state.openUntil).toISOString():null,
    cooldownRemainingMs:Math.max(0,state.openUntil-current),
    lastError:state.lastError||null,
    lastProbeAt:state.lastProbeAt||null,
    updatedAt:state.updatedAt
  }));
}

async function v350CircuitAdmission(providerId:string){
  const state=v350ProviderCircuits.get(providerId);
  if(!state || state.phase==='CLOSED') return {allowed:true,recovered:false};
  const current=now();
  if(state.phase==='OPEN' && state.openUntil>current){
    return {allowed:false,recovered:false,reason:'COOLDOWN',openUntil:state.openUntil};
  }

  const probing:V350CircuitState={
    ...state,
    phase:'HALF_OPEN',
    lastProbeAt:new Date(current).toISOString(),
    updatedAt:new Date(current).toISOString()
  };
  v350ProviderCircuits.set(providerId,probing);

  try{
    const health:any=await v320ProviderHealth({providerId});
    const ok=!!health?.results?.[0]?.ok;
    if(ok){
      v350ProviderCircuits.delete(providerId);
      return {allowed:true,recovered:true,reason:'HEALTH_PROBE_PASS'};
    }
    const reopened:V350CircuitState={
      ...probing,
      phase:'OPEN',
      openUntil:current+V350_CIRCUIT_COOLDOWN_MS,
      lastError:'Recovery health probe failed.',
      updatedAt:new Date(current).toISOString()
    };
    v350ProviderCircuits.set(providerId,reopened);
    return {allowed:false,recovered:false,reason:'HEALTH_PROBE_FAIL',openUntil:reopened.openUntil};
  }catch(error){
    const reopened:V350CircuitState={
      ...probing,
      phase:'OPEN',
      openUntil:current+V350_CIRCUIT_COOLDOWN_MS,
      lastError:v350SafeError(error),
      updatedAt:new Date(current).toISOString()
    };
    v350ProviderCircuits.set(providerId,reopened);
    return {allowed:false,recovered:false,reason:'HEALTH_PROBE_ERROR',openUntil:reopened.openUntil};
  }
}

function v350CircuitFailure(providerId:string,error:unknown){
  const current=v350ProviderCircuits.get(providerId)||{failures:0,openUntil:0,phase:'CLOSED' as const,updatedAt:new Date(now()).toISOString()};
  const failures=current.failures+1;
  const opened=failures>=V350_CIRCUIT_FAILURE_THRESHOLD;
  v350ProviderCircuits.set(providerId,{
    failures,
    phase:opened?'OPEN':'CLOSED',
    openUntil:opened?now()+V350_CIRCUIT_COOLDOWN_MS:0,
    lastError:v350SafeError(error),
    lastProbeAt:current.lastProbeAt,
    updatedAt:new Date(now()).toISOString()
  });
}

function v350CircuitSuccess(providerId:string){
  v350ProviderCircuits.delete(providerId);
}
async function v350AskModel(input:{message:string;activeFile?:string|null;preferLocal?:boolean}){
  if(v350ChatBusy) throw new Error('A chat request is already running. Wait for its response.');
  v350ChatBusy=true;
  try{return await v350AskModelImpl(input);}finally{v350ChatBusy=false;}
}
async function v350CallProvider(profile:any, model:string, messagesForModel:any[]){
  const started=Date.now();
  let answer=''; let httpStatus=0;
  if(profile.kind==='ollama'){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),Math.max(15000,profile.timeoutMs||30000));
    try{
      const r=await fetch(`${v320NormalizeBase(profile.baseUrl)}/api/chat`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({model,messages:messagesForModel,stream:false}),
        signal:ctrl.signal
      });
      httpStatus=r.status;
      const d:any=await r.json();
      if(!r.ok) throw new Error(d?.error||`Ollama HTTP ${r.status}`);
      answer=String(d?.message?.content||d?.response||'').trim();
    } finally { clearTimeout(timer); }
  } else {
    const url=completionUrl(profile.baseUrl,profile.kind);
    const headers={...v320AuthHeaders(profile),'content-type':'application/json'};
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),Math.max(15000,profile.timeoutMs||30000));
    try{
      const r=await fetch(url,{
        method:'POST',
        headers,
        body:JSON.stringify({model,messages:messagesForModel,temperature:0.2}),
        signal:ctrl.signal
      });
      httpStatus=r.status;
      const text=await r.text();
      let d:any={};
      try{ d=JSON.parse(text); } catch { d={error:text.slice(0,500)}; }
      if(!r.ok) throw new Error(d?.error?.message||d?.error||`Provider HTTP ${r.status}`);
      answer=v350ContentFromOpenAI(d);
    } finally { clearTimeout(timer); }
  }
  if(!answer) throw new Error('The provider returned an empty response.');
  return {answer,httpStatus,latencyMs:Date.now()-started};
}

function v350SafeError(error:unknown){
  const raw=error instanceof Error?error.message:String(error);
  return raw.replace(/(?:sk-|AIza|Bearer\s+)[A-Za-z0-9._-]{8,}/g,'[redacted]').slice(0,300);
}

async function v350AskModelImpl(input:{message:string;activeFile?:string|null;preferLocal?:boolean}){
  const message=String(input.message||'').trim();
  if(!message) throw new Error('message is required');

  const routed:any=await v330SmartRoute({task:message,preferLocal:!!input.preferLocal,maxCandidates:5});
  const profiles=await v320ReadProfiles();

  const candidateIds=[routed.selected?.providerId,...(routed.candidates||[]).filter((x:any)=>x.healthy).map((x:any)=>x.providerId)]
    .filter(Boolean)
    .filter((id:string,index:number,all:string[])=>all.indexOf(id)===index)
    .slice(0,3);

  if(!candidateIds.length) throw new Error('No enabled healthy provider is available. Enable Gemini, an OpenAI-compatible provider, or Ollama first.');

  let fileContext='';
  if(input.activeFile){
    try{
      const txt=await v80ReadTextFile(String(input.activeFile));
      fileContext=txt.slice(0,14000);
    }catch{}
  }

  const system=`You are KSA FORGE Developer Agent working on ${projectRoot}. Be concise and implementation-oriented. Analyze the current project before making broad claims. When code changes are requested, identify files, risks, verification steps and concrete edits. Do not claim commands/tests passed unless evidence is provided.${input.activeFile?` Current file: ${input.activeFile}`:''}`;
  const previousChat=await v350ReadChat();
  const user=fileContext?`${message}\n\nCURRENT FILE CONTEXT (${input.activeFile}):\n${fileContext}`:message;
  const messagesForModel=chatMessages(system,previousChat.messages||[],user);
  const attempts:any[]=[];

  for(const providerId of candidateIds){
    const admission:any=await v350CircuitAdmission(providerId);
    if(!admission.allowed){
      attempts.push({
        providerId,
        status:'CIRCUIT_OPEN',
        error:admission.reason==='COOLDOWN'?'Provider temporarily skipped during circuit cooldown.':'Provider recovery probe did not pass.',
        recoveryProbe:admission.reason,
        openUntil:admission.openUntil?new Date(admission.openUntil).toISOString():null
      });
      continue;
    }

    if(admission.recovered){
      attempts.push({
        providerId,
        status:'RECOVERED',
        recoveryProbe:admission.reason
      });
    }

    const profile=profiles.find((p:any)=>p.id===providerId);
    if(!profile){
      attempts.push({providerId,status:'SKIPPED',error:'Provider profile was not found.'});
      continue;
    }

    const routeCandidate=(routed.candidates||[]).find((x:any)=>x.providerId===providerId);
    let model=profile.defaultModel||routeCandidate?.model||'';
    if(!model){
      try{
        const h:any=await v320ProviderHealth({providerId:profile.id});
        model=String(h.results?.[0]?.models?.[0]||'');
      }catch{}
    }
    if(!model){
      attempts.push({providerId:profile.id,provider:profile.name,status:'SKIPPED',error:'No model is available.'});
      continue;
    }

    try{
      const response=await v350CallProvider(profile,model,messagesForModel);
      v350CircuitSuccess(profile.id);
      attempts.push({
        providerId:profile.id,
        provider:profile.name,
        model,
        status:'PASS',
        httpStatus:response.httpStatus,
        latencyMs:response.latencyMs
      });
      const history=await v350ReadChat();
      const messages=[
        ...(history.messages||[]),
        {role:'user',content:message,at:new Date().toISOString(),activeFile:input.activeFile||null},
        {
          role:'assistant',
          content:response.answer,
          at:new Date().toISOString(),
          providerId:profile.id,
          provider:profile.name,
          model,
          latencyMs:response.latencyMs,
          failoverUsed:attempts.length>1,
          attempts:attempts.map(({providerId,provider,model,status,httpStatus,error})=>({providerId,provider,model,status,httpStatus,error}))
        }
      ];
      await v350WriteChat(messages);
      return {
        version:APP_VERSION,
        status:'OK',
        answer:response.answer,
        providerId:profile.id,
        provider:profile.name,
        model,
        latencyMs:response.latencyMs,
        httpStatus:response.httpStatus,
        route:routed.selected,
        failoverUsed:attempts.length>1,
        attempts
      };
    }catch(error){
      v350CircuitFailure(profile.id,error);
      attempts.push({
        providerId:profile.id,
        provider:profile.name,
        model,
        status:'FAIL',
        error:v350SafeError(error)
      });
    }
  }

  const summary=attempts.map((x:any)=>`${x.provider||x.providerId}: ${x.error||x.status}`).join(' | ');
  throw new Error(`All provider attempts failed. ${summary}`);
}

async function v350FullScan(){
  const [runtime,diag,deps,git]=await Promise.all([v310RuntimeDoctor(),v60Diagnostics(),v90DependencyDoctor(),executeProgram('git',['status','--short'],projectRoot,30000)]);
  const health=await v90Health(diag);
  const errors=(diag.diagnostics||[]).filter((x:any)=>x.severity==='error');
  const warnings=(diag.diagnostics||[]).filter((x:any)=>x.severity!=='error');
  const failedChecks=(diag.checks||[]).filter((x:any)=>x.available!==false && x.success===false);
  const blockers=[...(runtime.blockers||[]),...failedChecks.map((x:any)=>x.name)];
  if(errors.length) blockers.push('diagnostic errors');
  if(health.score<80) blockers.push('project health');
  const needsReview=!git.success || deps.concerns.some((x:any)=>x.severity==='warning') || diag.checks.some((x:any)=>x.available===false);
  return {version:APP_VERSION,status:blockers.length?'ISSUES_FOUND':needsReview?'REVIEW':'READY',projectRoot:projectRoot,blockers,checks:diag.checks,summary:{runtime:runtime.status,diagnostics:diag.status,errorCount:errors.length,warningCount:warnings.length,dependencyStatus:deps.concerns.some((x:any)=>x.severity==='warning')?'REVIEW':'READY',healthStatus:health.grade||'UNKNOWN',gitStatus:git.success?'AVAILABLE':'UNAVAILABLE',gitDirty:git.success?!!String(git.stdout||'').trim():null},errors:errors.slice(0,100),warnings:warnings.slice(0,100),dependencies:deps,health,git:git.success?git.stdout:(git.stderr||git.message)};
}
async function v350PreviewSet(input:{url:string}){ const url=String(input.url||'').trim(); if(url && !/^https?:\/\//i.test(url)) throw new Error('Preview URL must start with http:// or https://'); const state={status:url?'CONFIGURED':'IDLE',url:url||null,viewport:{width:1440,height:900},lastChecked:new Date().toISOString()}; await v60WriteJson(previewFile,state); return {version:APP_VERSION,status:'SAVED',preview:state}; }
async function v350PlatformStatus(){ const [state,control,chat]=await Promise.all([v80WorkbenchState(),v340ControlStatus(),v350ReadChat()]); return {version:APP_VERSION,status:'READY',project:projectRoot,preview:state.preview,providers:control.providers,providerCircuits:v350CircuitSnapshot(),chatMessages:(chat.messages||[]).slice(-30),activeFile:state.editor?.activeFile||null}; }


  return {
    ensure: v350Ensure,
    readChat: v350ReadChat,
    writeChat: v350WriteChat,
    askModel: v350AskModel,
    fullScan: v350FullScan,
    previewSet: v350PreviewSet,
    platformStatus: v350PlatformStatus
  };
}
