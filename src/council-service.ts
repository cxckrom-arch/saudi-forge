import fs from "node:fs/promises";

export type CouncilAgent="architect"|"developer"|"qa"|"security"|"visual-designer"|"devops";
export type CouncilOpinion={
  agent:CouncilAgent;
  recommendation:string;
  risks:string[];
  evidence:string[];
  confidence:number;
  submittedAt:string;
};
export type CouncilState={
  id:string;
  task:string;
  createdAt:string;
  updatedAt:string;
  status:"OPEN"|"CONSENSUS"|"CONFLICT"|"BLOCKED";
  requiredAgents:CouncilAgent[];
  opinions:CouncilOpinion[];
  consensus?:{
    recommendation:string;
    confidence:number;
    supportingAgents:CouncilAgent[];
    dissentingAgents:CouncilAgent[];
    unresolvedRisks:string[];
    rationale:string[];
  };
};

export function createCouncilService(options:{
  kromStatePath:(file:string)=>Promise<string>;
  taskTypeOf:(task:string)=>string;
  clampConfidence:(value:number)=>number;
}) {
  const {kromStatePath,taskTypeOf,clampConfidence}=options;
  const stateFile="engineering-council.json";
  const historyFile="engineering-council-history.json";

  function agentsForTask(task:string):CouncilAgent[]{
    const type=taskTypeOf(task);
    const base:CouncilAgent[]=["architect","developer","qa"];
    if(type==="ui")base.push("visual-designer");
    if(type==="security"||type==="database")base.push("security");
    if(type==="deployment")base.push("devops");
    if(/deploy|release|vercel|نشر/i.test(task)&&!base.includes("devops"))base.push("devops");
    if(/auth|permission|security|rls|صلاح|أمان/i.test(task)&&!base.includes("security"))base.push("security");
    if(/ui|ux|واجهة|تصميم|responsive|rtl/i.test(task)&&!base.includes("visual-designer"))base.push("visual-designer");
    return [...new Set(base)];
  }
  async function readState():Promise<CouncilState|null>{
    try{return JSON.parse(await fs.readFile(await kromStatePath(stateFile),"utf8"));}catch{return null;}
  }
  async function writeState(state:CouncilState){
    state.updatedAt=new Date().toISOString();
    await fs.writeFile(await kromStatePath(stateFile),JSON.stringify(state,null,2),"utf8");
  }
  async function appendHistory(event:any){
    const fp=await kromStatePath(historyFile);let rows:any[]=[];
    try{rows=JSON.parse(await fs.readFile(fp,"utf8"));}catch{}
    rows.push({at:new Date().toISOString(),...event});
    await fs.writeFile(fp,JSON.stringify(rows.slice(-1000),null,2),"utf8");
  }
  async function createSession(task:string):Promise<CouncilState>{
    const state:CouncilState={id:`COUNCIL-${Date.now()}`,task,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:"OPEN",requiredAgents:agentsForTask(task),opinions:[]};
    await writeState(state);await appendHistory({type:"convene",state});return state;
  }
  function normalizeRecommendation(text:string){return text.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g," ").trim();}
  function roleWeight(agent:CouncilAgent,task:string){
    const type=taskTypeOf(task);
    if(agent==="security"&&(type==="security"||type==="database"))return 1.25;
    if(agent==="visual-designer"&&type==="ui")return 1.25;
    if(agent==="devops"&&type==="deployment")return 1.25;
    if(agent==="qa")return 1.15;
    if(agent==="architect")return 1.1;
    return 1.0;
  }
  function resolveConsensus(state:CouncilState){
    const required=new Set(state.requiredAgents);
    const submitted=new Set(state.opinions.map(o=>o.agent));
    const missing=[...required].filter(a=>!submitted.has(a));
    if(missing.length)return {status:"BLOCKED" as const,reason:"Missing required council opinions",missing};
    const groups=new Map<string,{key:string;score:number;opinions:CouncilOpinion[]}>();
    for(const op of state.opinions){
      const key=normalizeRecommendation(op.recommendation).slice(0,220);
      const g=groups.get(key)||{key,score:0,opinions:[]};
      g.score+=clampConfidence(op.confidence)*roleWeight(op.agent,state.task)+Math.min(20,op.evidence.length*4);
      g.opinions.push(op);groups.set(key,g);
    }
    const ranked=[...groups.values()].sort((a,b)=>b.score-a.score);
    const top=ranked[0],second=ranked[1];
    if(!top)return {status:"BLOCKED" as const,reason:"No opinions"};
    const margin=second?top.score-second.score:top.score;
    const avg=Math.round(top.opinions.reduce((n,o)=>n+o.confidence,0)/top.opinions.length);
    const highRiskDissent=state.opinions.filter(o=>!top.opinions.includes(o)&&o.confidence>=80&&o.risks.length>0);
    if((second&&margin<20)||highRiskDissent.length){
      return {status:"CONFLICT" as const,reason:highRiskDissent.length?"High-confidence dissent with unresolved risks":"Consensus margin too narrow",ranked:ranked.slice(0,5).map(g=>({recommendation:g.opinions[0].recommendation,score:Math.round(g.score),agents:g.opinions.map(o=>o.agent)})),highRiskDissent:highRiskDissent.map(o=>({agent:o.agent,risks:o.risks,recommendation:o.recommendation}))};
    }
    const supporters=top.opinions.map(o=>o.agent);
    const dissenters=state.opinions.filter(o=>!supporters.includes(o.agent)).map(o=>o.agent);
    const unresolved=[...new Set(state.opinions.filter(o=>!supporters.includes(o.agent)).flatMap(o=>o.risks))];
    return {status:"CONSENSUS" as const,recommendation:top.opinions[0].recommendation,confidence:avg,supportingAgents:supporters,dissentingAgents:dissenters,unresolvedRisks:unresolved,rationale:[`Selected by weighted evidence score ${Math.round(top.score)}.`,`Consensus margin ${Math.round(margin)}.`,`Supporting agents: ${supporters.join(", ")}.`]};
  }

  return {stateFile,historyFile,agentsForTask,readState,writeState,appendHistory,createSession,resolveConsensus};
}
