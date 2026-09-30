import fs from "node:fs/promises";
import path from "node:path";

export type AutopilotPhase = "context"|"plan"|"execute"|"verify"|"repair"|"release"|"done"|"blocked";
export type AutopilotState = {
  id:string; task:string; startedAt:string; updatedAt:string; phase:AutopilotPhase;
  checkpointId?:string; qualityScore:number; iteration:number; maxIterations:number;
  blockers:string[]; evidence:string[]; lastDecision?:string; status:"ACTIVE"|"PASS"|"BLOCKED"|"ROLLED_BACK";
};

export function createAutopilotService(options:{
  projectRoot:string;
  maxFileSize:number;
  kromStatePath:(file:string)=>Promise<string>;
  safePath:(relativePath:string)=>string;
  walkProject:(...args:any[])=>Promise<string[]>;
  isTextFile:(file:string)=>boolean;
}) {
  const {projectRoot,maxFileSize,kromStatePath,safePath,walkProject,isTextFile}=options;
  const stateFile="autopilot-state.json";
  const historyFile="autopilot-history.json";
  const checkpointDir="autopilot-checkpoints";

  async function readState():Promise<AutopilotState|null>{
    try{return JSON.parse(await fs.readFile(await kromStatePath(stateFile),"utf8"));}catch{return null;}
  }
  async function writeState(state:AutopilotState){
    state.updatedAt=new Date().toISOString();
    await fs.writeFile(await kromStatePath(stateFile),JSON.stringify(state,null,2),"utf8");
  }
  async function appendHistory(event:any){
    const fp=await kromStatePath(historyFile);let rows:any[]=[];
    try{rows=JSON.parse(await fs.readFile(fp,"utf8"));}catch{}
    rows.push({at:new Date().toISOString(),...event});
    await fs.writeFile(fp,JSON.stringify(rows.slice(-1000),null,2),"utf8");
  }
  async function createCheckpoint(label:string,files?:string[]){
    const id=`CP-${Date.now()}`;
    const dir=await kromStatePath(path.join(checkpointDir,id));
    await fs.mkdir(dir,{recursive:true});
    const candidates=files?.length?files.map(safePath):(await walkProject(projectRoot,[],1800)).filter(f=>isTextFile(f));
    const manifest:any[]=[];
    for(const abs of candidates){
      try{
        const rel=path.relative(projectRoot,abs);
        if(!rel||rel.startsWith(".krom"+path.sep)||rel.startsWith(".git"+path.sep))continue;
        const stat=await fs.stat(abs);if(!stat.isFile()||stat.size>maxFileSize)continue;
        const dst=path.join(dir,"files",rel);
        await fs.mkdir(path.dirname(dst),{recursive:true});
        await fs.copyFile(abs,dst);
        manifest.push({path:rel,size:stat.size});
      }catch{}
    }
    const meta={id,label,createdAt:new Date().toISOString(),files:manifest};
    await fs.writeFile(path.join(dir,"manifest.json"),JSON.stringify(meta,null,2),"utf8");
    return meta;
  }
  async function restoreCheckpoint(id:string){
    const dir=await kromStatePath(path.join(checkpointDir,id));
    const meta=JSON.parse(await fs.readFile(path.join(dir,"manifest.json"),"utf8"));
    let restored=0;
    for(const item of meta.files||[]){
      const src=path.join(dir,"files",item.path);const dst=safePath(item.path);
      await fs.mkdir(path.dirname(dst),{recursive:true});await fs.copyFile(src,dst);restored++;
    }
    return {id,restored,label:meta.label,createdAt:meta.createdAt};
  }
  function nextPhase(state:AutopilotState,qualityScore:number,blockers:string[]):AutopilotPhase{
    if(blockers.length&&state.iteration>=state.maxIterations)return "blocked";
    if(blockers.length)return "repair";
    if(qualityScore>=90)return "release";
    if(qualityScore>=70)return "verify";
    return "execute";
  }

  return {
    stateFile,historyFile,checkpointDir,
    readState,writeState,appendHistory,createCheckpoint,restoreCheckpoint,nextPhase
  };
}
