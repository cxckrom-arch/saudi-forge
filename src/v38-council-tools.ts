import fs from "node:fs/promises";
import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV38CouncilTools(
  server: any,
  deps: {
    councilHistoryFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    createCouncilSession: (...args: any[]) => Promise<any>;
    readCouncilState: () => Promise<any>;
    writeCouncilState: (state: any) => Promise<void>;
    appendCouncilHistory: (entry: any) => Promise<void>;
    resolveCouncilConsensus: (state: any) => any;
    clampConfidence: (value: number) => number;
    kromStatePath: (file: string) => Promise<string>;
  }
) {
  const {
    councilHistoryFile,
    result,
    errorResult,
    createCouncilSession,
    readCouncilState,
    writeCouncilState,
    appendCouncilHistory,
    resolveCouncilConsensus,
    clampConfidence,
    kromStatePath
  } = deps;

  // =========================================================
  // v3.8 MULTI-AGENT ENGINEERING COUNCIL TOOLS
  // =========================================================
  server.registerTool(
    "engineering_council_convene",
    {
      title:"Engineering Council Convene",
      description:"Create a multi-agent engineering council for a complex task. Selects the required specialist roles based on task risk and domain and persists the session for evidence-backed consensus.",
      inputSchema:z.object({task:z.string().min(5)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({task})=>{try{const state=await createCouncilSession(task);return result(JSON.stringify({status:"OK",council:state,agenda:["Each required agent must submit a recommendation.","Every recommendation needs confidence, risks, and evidence.","High-confidence dissent blocks execution until resolved.","Consensus does not replace build/test/browser/release evidence."]},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "council_submit_opinion",
    {
      title:"Council Submit Opinion",
      description:"Submit or replace one specialist opinion in the active engineering council. Evidence and explicit risks are preserved for consensus and conflict resolution.",
      inputSchema:z.object({agent:z.enum(["architect","developer","qa","security","visual-designer","devops"]),recommendation:z.string().min(5),risks:z.array(z.string()).default([]),evidence:z.array(z.string()).default([]),confidence:z.number().min(0).max(100).default(70)}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ({agent,recommendation,risks,evidence,confidence})=>{try{const st=await readCouncilState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_COUNCIL"},null,2));const op:any={agent:agent as any,recommendation,risks,evidence,confidence:clampConfidence(confidence),submittedAt:new Date().toISOString()};st.opinions=st.opinions.filter(o=>o.agent!==agent);st.opinions.push(op);st.status="OPEN";delete st.consensus;await writeCouncilState(st);await appendCouncilHistory({type:"opinion",councilId:st.id,opinion:op});const pending=st.requiredAgents.filter(a=>!st.opinions.some(o=>o.agent===a));return result(JSON.stringify({status:"OK",opinion:op,pendingAgents:pending,readyForConsensus:pending.length===0},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "execution_consensus",
    {
      title:"Execution Consensus",
      description:"Resolve council recommendations using task-aware role weights, confidence, evidence, and risk dissent. Blocks execution when required opinions are missing or high-confidence risk conflicts remain unresolved.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:false,openWorldHint:false}
    },
    async ()=>{try{const st=await readCouncilState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_COUNCIL"},null,2));const decision=resolveCouncilConsensus(st);if(decision.status==="CONSENSUS"){st.status="CONSENSUS";st.consensus={recommendation:decision.recommendation,confidence:decision.confidence,supportingAgents:decision.supportingAgents,dissentingAgents:decision.dissentingAgents,unresolvedRisks:decision.unresolvedRisks,rationale:decision.rationale};}else if(decision.status==="CONFLICT")st.status="CONFLICT";else st.status="BLOCKED";await writeCouncilState(st);await appendCouncilHistory({type:"consensus",councilId:st.id,decision});return result(JSON.stringify({status:decision.status,decision,rule:decision.status==="CONSENSUS"?"Use the consensus as the execution plan, then still require normal verification gates.":"Do not begin broad or irreversible execution until the conflict or missing opinions are resolved."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "council_conflict_resolver",
    {
      title:"Council Conflict Resolver",
      description:"Analyze unresolved council disagreement and produce the minimum evidence needed to break the tie safely instead of choosing an arbitrary winner.",
      inputSchema:z.object({additionalEvidence:z.array(z.string()).default([])}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ({additionalEvidence})=>{try{const st=await readCouncilState();if(!st)return result(JSON.stringify({status:"NO_ACTIVE_COUNCIL"},null,2));const d=resolveCouncilConsensus(st);const conflicts=st.opinions.flatMap(o=>o.risks.map(r=>({agent:o.agent,risk:r,confidence:o.confidence}))).filter(x=>x.confidence>=70);const evidenceNeeded=["Direct code/runtime evidence for the disputed behavior","Impact analysis for shared/high-risk files","Targeted regression or browser test for the disputed path",...additionalEvidence];return result(JSON.stringify({status:d.status,conflicts,existingEvidence:[...new Set(st.opinions.flatMap(o=>o.evidence))],evidenceNeeded:[...new Set(evidenceNeeded)],nextAction:d.status==="CONSENSUS"?"Consensus already available.":"Collect the missing evidence, update the relevant specialist opinions, then rerun execution_consensus."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "engineering_council_status",
    {
      title:"Engineering Council Status",
      description:"Show the active council, specialist participation, consensus/conflict status, unresolved risks, and recent council history.",
      inputSchema:z.object({}),
      annotations:{readOnlyHint:true,openWorldHint:false}
    },
    async ()=>{try{const st=await readCouncilState();let hist:any[]=[];try{hist=JSON.parse(await fs.readFile(await kromStatePath(councilHistoryFile),"utf8"));}catch{}return result(JSON.stringify({status:"OK",council:st,recentHistory:hist.slice(-30),rules:["No consensus without every required role","High-confidence risk dissent blocks broad execution","Evidence outranks preference","Consensus still requires release verification"]},null,2));}catch(error){return errorResult(error);}}
  );



}
