import * as z from "zod/v4";
import { APP_VERSION } from "./release-info.js";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerModelControlTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
  v320FallbackPlan: (...args: any[]) => Promise<any>;
  v320ModelDiscover: (...args: any[]) => Promise<any>;
  v320ModelRoute: (...args: any[]) => Promise<any>;
  v320ProfileUpsert: (...args: any[]) => Promise<any>;
  v320Profiles: (...args: any[]) => Promise<any>;
  v320ProviderHealth: (...args: any[]) => Promise<any>;
  v320RoutingPolicy: (...args: any[]) => Promise<any>;
  v320SelectModel: (...args: any[]) => Promise<any>;
  v320Status: (...args: any[]) => Promise<any>;
  v330FallbackChain: (...args: any[]) => Promise<any>;
  v330ProviderBenchmark: (...args: any[]) => Promise<any>;
  v330QualityBenchmarkPlan: (...args: any[]) => Promise<any>;
  v330Reliability: (...args: any[]) => Promise<any>;
  v330RouteExplain: (...args: any[]) => Promise<any>;
  v330SmartRoute: (...args: any[]) => Promise<any>;
  v330Status: (...args: any[]) => Promise<any>;
  v340ControlStatus: (...args: any[]) => Promise<any>;
  v340ProviderControl: (...args: any[]) => Promise<any>;
  v340QuickSelect: (...args: any[]) => Promise<any>;
  v340RoutePreview: (...args: any[]) => Promise<any>;
  v340RuntimeBannerAudit: (...args: any[]) => Promise<any>;
  v340Status: (...args: any[]) => Promise<any>;
  v342SetDefault: (...args: any[]) => Promise<any>;
  v342TestProvider: (...args: any[]) => Promise<any>;
  v342ToggleProvider: (...args: any[]) => Promise<any>;
  v350AskModel: (...args: any[]) => Promise<any>;
  v350FullScan: (...args: any[]) => Promise<any>;
  v350PlatformStatus: (...args: any[]) => Promise<any>;
  v350PreviewSet: (...args: any[]) => Promise<any>;
  }
) {
  const {
    result,
    errorResult,
    v320FallbackPlan,
    v320ModelDiscover,
    v320ModelRoute,
    v320ProfileUpsert,
    v320Profiles,
    v320ProviderHealth,
    v320RoutingPolicy,
    v320SelectModel,
    v320Status,
    v330FallbackChain,
    v330ProviderBenchmark,
    v330QualityBenchmarkPlan,
    v330Reliability,
    v330RouteExplain,
    v330SmartRoute,
    v330Status,
    v340ControlStatus,
    v340ProviderControl,
    v340QuickSelect,
    v340RoutePreview,
    v340RuntimeBannerAudit,
    v340Status,
    v342SetDefault,
    v342TestProvider,
    v342ToggleProvider,
    v350AskModel,
    v350FullScan,
    v350PlatformStatus,
    v350PreviewSet
  } = deps;

// ===== v32.0 MODEL & PROVIDER ORCHESTRATOR REGISTRATION =====
  server.registerTool("provider_profile_upsert_v32",{title:"Provider Profile Upsert v32",description:"Create or update a local/OpenAI-compatible provider profile without storing secret values.",inputSchema:z.object({id:z.string().optional(),name:z.string().min(2),kind:z.enum(['ollama','gpt4all','gemini','openai-compatible','custom']),baseUrl:z.string().min(7),apiKeyEnv:z.string().optional(),defaultModel:z.string().optional(),enabled:z.boolean().optional(),priority:z.number().int().min(1).max(999).optional(),timeoutMs:z.number().int().min(1000).max(60000).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v320ProfileUpsert(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_profiles_v32",{title:"Provider Profiles v32",description:"List configured model providers and whether required credentials are available, without exposing secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v320Profiles(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_health_v32",{title:"Provider Health v32",description:"Check configured provider model endpoints and latency.",inputSchema:z.object({providerId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v320ProviderHealth(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_discover_v32",{title:"Model Discover v32",description:"Discover models exposed by healthy configured providers.",inputSchema:z.object({providerId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v320ModelDiscover(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_select_v32",{title:"Model Select v32",description:"Set a provider default model in the local KROM profile registry.",inputSchema:z.object({providerId:z.string().min(1),model:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v320SelectModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_routing_policy_v32",{title:"Model Routing Policy v32",description:"Configure provider/model routes for coding, planning, general and design tasks.",inputSchema:z.object({codingProvider:z.string().optional(),codingModel:z.string().optional(),planningProvider:z.string().optional(),planningModel:z.string().optional(),generalProvider:z.string().optional(),generalModel:z.string().optional(),designProvider:z.string().optional(),designModel:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v320RoutingPolicy(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_route_v32",{title:"Model Route v32",description:"Route a task to the configured provider/model and optionally require a live health check.",inputSchema:z.object({task:z.string().min(2),requireHealthy:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v320ModelRoute(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_fallback_plan_v32",{title:"Provider Fallback Plan v32",description:"Build a health-aware fallback chain using enabled provider priorities.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:true}},async()=>{try{return result(JSON.stringify(await v320FallbackPlan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_orchestrator_status_v32",{title:"Provider Orchestrator Status v32",description:"Show provider registry and routing-policy status without exposing secrets.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v320Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v32.0 REGISTRATION =====

  // ===== v33.0 ADAPTIVE MULTI-MODEL INTELLIGENCE REGISTRATION =====
  server.registerTool("provider_benchmark_v33",{title:"Provider Benchmark v33",description:"Measure live provider availability and model-endpoint latency without fabricating model-quality scores.",inputSchema:z.object({providerId:z.string().optional(),runs:z.number().int().min(1).max(5).optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330ProviderBenchmark(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_reliability_v33",{title:"Provider Reliability v33",description:"Summarize historical availability, latency and reliability from real provider benchmark runs.",inputSchema:z.object({providerId:z.string().optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v330Reliability(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("smart_model_route_v33",{title:"Smart Model Route v33",description:"Rank enabled providers for a task using live health, reliability, task affinity, priority and optional local preference.",inputSchema:z.object({task:z.string().min(2),preferLocal:z.boolean().optional(),maxCandidates:z.number().int().min(1).max(10).optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330SmartRoute(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("adaptive_fallback_v33",{title:"Adaptive Fallback v33",description:"Build a task-specific fallback chain containing only healthy ranked providers.",inputSchema:z.object({task:z.string().min(2),preferLocal:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330FallbackChain(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("route_explain_v33",{title:"Route Explain v33",description:"Explain why a provider/model route was selected and show ranked alternatives.",inputSchema:z.object({task:z.string().min(2)}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v330RouteExplain(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("quality_benchmark_plan_v33",{title:"Quality Benchmark Plan v33",description:"Create an evidence-based model quality benchmark plan without inventing performance scores.",inputSchema:z.object({taskClass:z.enum(['coding','planning','design','general']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v330QualityBenchmarkPlan(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_intelligence_status_v33",{title:"Model Intelligence Status v33",description:"Show v33 adaptive multi-model intelligence readiness and benchmark history count.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v330Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v33.0 REGISTRATION =====





  // ===== v34.0 AI CONTROL CENTER REGISTRATION =====
  server.registerTool("ai_control_center_status_v34",{title:"AI Control Center Status v34",description:"Show configured model providers, routing and runtime endpoints without exposing secret values.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v340ControlStatus(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_control_v34",{title:"Provider Control v34",description:"Enable/disable a model provider or adjust its priority.",inputSchema:z.object({providerId:z.string().min(1),enabled:z.boolean().optional(),priority:z.number().int().min(1).max(999).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v340ProviderControl(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("model_quick_select_v34",{title:"Model Quick Select v34",description:"Select a provider model and optionally bind it to a task class.",inputSchema:z.object({providerId:z.string().min(1),model:z.string().min(1),taskClass:z.enum(['coding','planning','design','general']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v340QuickSelect(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("route_preview_v34",{title:"Route Preview v34",description:"Preview and explain adaptive routing for a task.",inputSchema:z.object({task:z.string().min(2),preferLocal:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v340RoutePreview(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("runtime_banner_audit_v34",{title:"Runtime Banner Audit v34",description:"Audit stale KROM version banners in the runtime source.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v340RuntimeBannerAudit(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_toggle_v342",{title:"Provider Toggle v34.2",description:"Enable or disable an AI provider profile.",inputSchema:z.object({providerId:z.string().min(1),enabled:z.boolean()}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v342ToggleProvider(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_test_v342",{title:"Provider Test v34.2",description:"Test one provider connection and return health without exposing credentials.",inputSchema:z.object({providerId:z.string().min(1)}),annotations:{readOnlyHint:true,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v342TestProvider(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("provider_default_model_v342",{title:"Provider Default Model v34.2",description:"Set the default model for a provider.",inputSchema:z.object({providerId:z.string().min(1),model:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},async(input)=>{try{return result(JSON.stringify(await v342SetDefault(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("runtime_console_status_v34",{title:"Runtime Console Status v34",description:"Show unified v34 runtime console readiness.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v340Status(),null,2));}catch(e){return errorResult(e);}});
  // ===== END v34.0 REGISTRATION =====

  // ===== END v19.0 REGISTRATION =====


server.registerTool("developer_platform_status_v35",{title:"Developer Platform Status v35",description:"Return chat, preview, provider and workspace status for the v35 developer platform.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v350PlatformStatus(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("developer_chat_v35",{title:"Developer Chat v35",description:"Ask the routed AI provider about the current project and optional active file.",inputSchema:z.object({message:z.string().min(1),activeFile:z.string().optional(),preferLocal:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v350AskModel(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("full_project_scan_v35",{title:"Full Project Scan v35",description:"Run runtime, diagnostics, dependency, project health and Git checks and return one consolidated report.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v350FullScan(),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("preview_control_v35",{title:"Preview Control v35",description:"Set or clear the live preview URL used by the developer platform.",inputSchema:z.object({url:z.string()}),annotations:{readOnlyHint:false,openWorldHint:true}},async(input)=>{try{return result(JSON.stringify(await v350PreviewSet(input),null,2));}catch(e){return errorResult(e);}});
  server.registerTool("developer_platform_gate_v35",{title:"Developer Platform Gate v35",description:"Check whether provider, workspace and preview prerequisites are ready.",inputSchema:z.object({requirePreview:z.boolean().optional()}),annotations:{readOnlyHint:true,openWorldHint:false}},async({requirePreview})=>{try{const s:any=await v350PlatformStatus();const blockers:string[]=[];if(!(s.providers||[]).some((p:any)=>p.enabled))blockers.push('no enabled AI provider');if(requirePreview&&!s.preview?.url)blockers.push('preview URL not configured');return result(JSON.stringify({version:APP_VERSION,status:blockers.length?'BLOCKED':'PASS',blockers,project:s.project,preview:s.preview},null,2));}catch(e){return errorResult(e);}});

}
