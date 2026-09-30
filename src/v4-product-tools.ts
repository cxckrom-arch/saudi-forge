import fs from "node:fs/promises";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV4ProductTools(
  server: any,
  deps: {
    productBlueprintFile: string;
    productAcceptanceFile: string;
    productGapFile: string;
    changeSimulationFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    createProductBlueprint: (...args: any[]) => Promise<any>;
    readProductBlueprint: () => Promise<any>;
    scanFeatureEvidence: (...args: any[]) => Promise<any>;
    kromStatePath: (file: string) => Promise<string>;
  }
) {
  const {
    productBlueprintFile,
    productAcceptanceFile,
    productGapFile,
    changeSimulationFile,
    result,
    errorResult,
    createProductBlueprint,
    readProductBlueprint,
    scanFeatureEvidence,
    kromStatePath
  } = deps;

  // =========================================================
  // v4.0 AUTONOMOUS PRODUCT ENGINEERING TOOLS
  // =========================================================
  server.registerTool(
    "product_blueprint",
    {
      title:"Product Blueprint Engine",
      description:"Convert a product prompt into an implementation-oriented blueprint of actors, features, product surfaces, non-functional requirements, quality bars, and acceptance criteria before coding.",
      inputSchema:z.object({task:z.string().min(5)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{const blueprint=await createProductBlueprint(task);return result(JSON.stringify({status:"OK",blueprint,file:`.krom/${productBlueprintFile}`,nextAction:"Run feature_completeness_matrix against the current project before broad implementation."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "acceptance_contract_generate",
    {
      title:"Acceptance Contract Generator",
      description:"Generate a strict acceptance contract for every product feature, including functional, UI, state, permission, responsive, and evidence requirements.",
      inputSchema:z.object({task:z.string().optional()}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{let bp=await readProductBlueprint();if(task||!bp)bp=await createProductBlueprint(task||"Complete the current product according to its existing requirements");const contract={id:`AC-${Date.now()}`,createdAt:new Date().toISOString(),blueprintId:bp.id,features:bp.features.map(f=>({featureId:f.id,name:f.name,criteria:f.acceptance,requiredEvidence:["source implementation evidence","runtime or test evidence","permission/validation evidence when applicable","responsive/browser evidence for visible UI"]})),globalCriteria:[...bp.nonFunctional,...bp.qualityBars,"No feature is complete solely because a route, button, or placeholder exists"],doneRule:"DONE requires every critical feature to satisfy its acceptance criteria with evidence."};await fs.writeFile(await kromStatePath(productAcceptanceFile),JSON.stringify(contract,null,2),"utf8");return result(JSON.stringify({status:"OK",contract,file:`.krom/${productAcceptanceFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "feature_completeness_matrix",
    {
      title:"Feature Completeness Matrix",
      description:"Inspect the current project for implementation evidence for every feature in the active product blueprint. Scores UI, data/integration and tests without treating source presence as runtime proof.",
      inputSchema:z.object({task:z.string().optional()}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{let bp=await readProductBlueprint();if(task||!bp)bp=await createProductBlueprint(task||"Assess the current product");const rows:any[]=[];for(const f of bp.features)rows.push(await scanFeatureEvidence(f));const avg=rows.length?Math.round(rows.reduce((a,x)=>a+x.score,0)/rows.length):0;const gaps=rows.filter(x=>x.status!=="EVIDENCE_STRONG");const matrix={at:new Date().toISOString(),blueprintId:bp.id,averageEvidenceScore:avg,features:rows,gapCount:gaps.length,warning:"Static/source evidence is not runtime verification. Browser, API, database and release gates are still required."};await fs.writeFile(await kromStatePath(productGapFile),JSON.stringify(matrix,null,2),"utf8");return result(JSON.stringify({status:gaps.length?"GAPS_FOUND":"SOURCE_EVIDENCE_STRONG",matrix,file:`.krom/${productGapFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "product_gap_detector",
    {
      title:"Product Gap Detector",
      description:"Find product-level gaps such as UI-only features, missing data integration, missing tests, missing states, or capabilities requested in the prompt that lack evidence in the project.",
      inputSchema:z.object({task:z.string().optional()}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({task})=>{try{let bp=await readProductBlueprint();if(task||!bp)bp=await createProductBlueprint(task||"Assess product gaps");const rows:any[]=[];for(const f of bp.features)rows.push(await scanFeatureEvidence(f));const gaps=rows.flatMap(x=>{const out:any[]=[];if(!x.coverage.ui)out.push({featureId:x.featureId,feature:x.name,severity:"MAJOR",gap:"No clear UI/product-surface evidence"});if(!x.coverage.dataOrIntegration)out.push({featureId:x.featureId,feature:x.name,severity:"MAJOR",gap:"No clear data/API/integration evidence"});if(!x.coverage.test)out.push({featureId:x.featureId,feature:x.name,severity:"MAJOR",gap:"No targeted test evidence"});return out;});return result(JSON.stringify({status:gaps.length?"GAPS_FOUND":"NO_STATIC_GAPS",gapCount:gaps.length,gaps,nextActions:["Implement missing product surfaces, not placeholders","Connect visible actions to real data/logic","Add targeted verification for each critical flow","Run browser/release gates after source gaps are closed"],rule:"A missing static signal is a review target, not absolute proof that a feature is absent."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "product_release_readiness",
    {
      title:"Product Release Readiness Gate",
      description:"Gate product completion using feature completeness, acceptance contracts, existing preflight/release state, and evidence coverage. It refuses a product-level DONE when critical feature gaps remain.",
      inputSchema:z.object({minimumFeatureScore:z.number().int().min(0).max(100).default(75)}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({minimumFeatureScore})=>{try{const bp=await readProductBlueprint();if(!bp)return result(JSON.stringify({status:"BLOCKED",reason:"No product blueprint. Run product_blueprint first."},null,2));const rows:any[]=[];for(const f of bp.features)rows.push(await scanFeatureEvidence(f));const blockers=rows.filter(x=>x.score<minimumFeatureScore).map(x=>({featureId:x.featureId,name:x.name,score:x.score,status:x.status,missing:Object.entries(x.coverage).filter(([,v])=>!v).map(([k])=>k)}));let sim:any=null;try{sim=JSON.parse(await fs.readFile(await kromStatePath(changeSimulationFile),"utf8"));}catch{}let contract:any=null;try{contract=JSON.parse(await fs.readFile(await kromStatePath(productAcceptanceFile),"utf8"));}catch{}const status=blockers.length||!contract?"BLOCKED":"READY_FOR_RUNTIME_GATES";return result(JSON.stringify({status,blueprintId:bp.id,minimumFeatureScore,blockers,acceptanceContractPresent:!!contract,changeSimulationPresent:!!sim,nextAction:status==="BLOCKED"?"Close feature/acceptance gaps, then rerun this gate.":"Run browser, security, regression and final release gates. Source completeness alone does not authorize release."},null,2));}catch(error){return errorResult(error);}}
  );



}
