import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';

export const automationInput = z.object({
  name: z.string().trim().min(1).max(100),
  steps: z.array(z.object({ tool: z.string().min(1), arguments: z.record(z.string(), z.unknown()).default({}) })).min(1).max(12),
  intervalSeconds: z.number().int().min(60).max(604800).nullable().default(null),
  enabled: z.boolean().default(false),
}).strict();
type Definition = z.infer<typeof automationInput>;
type Tool = { name: string; title?: string; description?: string; inputSchema: z.ZodType; handler: (args: any) => Promise<any> };
type Run = { id: string; automationId?: string; name: string; status: string; startedAt: string; finishedAt?: string; cancelRequested?: boolean; steps: any[] };
type Job = Definition & { id: string; nextRunAt: string | null };
const exposed = new Set(['inspect_project','list_files','search_code','run_typecheck','run_tests','run_lint','run_build','git_status','full_project_scan_v35','developer_platform_status_v35']);

export function outcome(result: any): 'PASS' | 'FAIL' | 'SKIPPED' {
  if (result?.isError) return 'FAIL';
  let data = result;
  try { if (result?.content?.[0]?.type === 'text') data = JSON.parse(result.content[0].text); } catch {}
  if (data?.success === false || ['FAIL','ERROR','ERRORS','BLOCKED','ISSUES_FOUND','NEEDS_REPAIR'].includes(data?.status)) return 'FAIL';
  if (data?.available === false || ['SKIPPED','REVIEW','UNKNOWN'].includes(data?.status)) return 'SKIPPED';
  return 'PASS';
}

export class ToolRuntime {
  private tools = new Map<string, Tool>();
  private jobs: Job[] = [];
  private runs: Run[] = [];
  private active: Run | null = null;
  private writes: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private fault: string | null = null;
  constructor(private directory: string) {}
  capture(name: string, config: any, handler: Tool['handler']) {
    if (exposed.has(name)) this.tools.set(name, { name, ...config, handler });
  }
  catalog() {
    return [...this.tools.values()].map(({name,title,description,inputSchema}) => ({name,title,description,inputSchema:z.toJSONSchema(inputSchema),connected:true}));
  }
  private validate(steps: Definition['steps']) {
    for (const step of steps) {
      const tool = this.tools.get(step.tool);
      if (!tool) throw new Error(`Tool is not connected to this runner: ${step.tool}`);
      tool.inputSchema.parse(step.arguments);
    }
  }
  async init() {
    await fs.mkdir(this.directory,{recursive:true});
    try {
      const saved = JSON.parse(await fs.readFile(path.join(this.directory,'state.json'),'utf8'));
      this.jobs = (saved.jobs || []).map((j: any) => ({...automationInput.parse(j.definition),id:z.string().parse(j.id),nextRunAt:j.nextRunAt || null}));
      this.runs = saved.runs || [];
      for (const run of this.runs) if (run.status === 'RUNNING') {
        run.status = 'INTERRUPTED'; run.finishedAt = new Date().toISOString();
        for (const step of run.steps) if (step.status === 'RUNNING') step.status = 'INTERRUPTED';
      }
      // Never replay an overdue effect after an outage. Start a fresh interval.
      for (const job of this.jobs) job.nextRunAt = job.enabled && job.intervalSeconds ? new Date(Date.now()+job.intervalSeconds*1000).toISOString() : null;
    } catch (error: any) { if (error.code !== 'ENOENT') throw new Error(`Cannot load automation state: ${error.message}`); }
    await this.save();
  }
  private save() {
    const data = JSON.stringify({version:1,jobs:this.jobs.map(({id,nextRunAt,...definition})=>({id,nextRunAt,definition})),runs:this.runs.slice(-100)},null,2);
    const write = this.writes.then(async()=>{
      const temporary = path.join(this.directory,`state-${randomUUID()}.tmp`);
      await fs.writeFile(temporary,data,'utf8');
      await fs.rename(temporary,path.join(this.directory,'state.json'));
    });
    this.writes = write.catch((error)=>{this.fault=error.message;});
    return write;
  }
  snapshot() { return structuredClone({jobs:this.jobs,runs:this.runs.slice(-30).reverse(),activeRunId:this.active?.id || null,fault:this.fault,schedulerRunning:!!this.timer}); }
  async upsert(input: unknown, id?: string) {
    const definition = automationInput.parse(input); this.validate(definition.steps);
    if (id && !this.jobs.some(j=>j.id===id)) throw new Error('Automation not found');
    const job: Job = {...definition,id:id || randomUUID(),nextRunAt:definition.enabled && definition.intervalSeconds ? new Date(Date.now()+definition.intervalSeconds*1000).toISOString():null};
    this.jobs = this.jobs.filter(j=>j.id!==job.id).concat(job); await this.save(); return structuredClone(job);
  }
  async remove(id: string) {
    if (this.active?.automationId===id) throw new Error('Wait for the active run to finish before deleting');
    if (!this.jobs.some(j=>j.id===id)) throw new Error('Automation not found');
    this.jobs=this.jobs.filter(j=>j.id!==id); await this.save(); return {removed:true};
  }
  async startJob(id: string) {
    const job=this.jobs.find(j=>j.id===id); if(!job) throw new Error('Automation not found');
    return this.start(job.name,job.steps,id);
  }
  async start(name: string, steps: Definition['steps'], automationId?: string) {
    if(this.fault) throw new Error(`Automation storage needs attention: ${this.fault}`);
    if(this.active) throw new Error('Another run is already active');
    this.validate(steps);
    const run: Run={id:randomUUID(),automationId,name,status:'RUNNING',startedAt:new Date().toISOString(),steps:steps.map(s=>({...structuredClone(s),status:'PENDING'}))};
    this.active=run; this.runs.push(run); this.runs=this.runs.slice(-100);
    try { await this.save(); } catch(error) { this.active=null; run.status='FAIL'; throw error; }
    void this.execute(run).catch(error=>{this.fault=error.message;run.status='FAIL';this.active=null;});
    return structuredClone(run);
  }
  async cancel(id: string) {
    if(this.active?.id!==id) throw new Error('Run is not active');
    this.active.cancelRequested=true; await this.save();
    return {status:'CANCELLING',message:'The current step will finish; remaining steps will not start.'};
  }
  private async execute(run: Run) {
    try {
      for (const step of run.steps) {
        if(run.cancelRequested) break;
        step.status='RUNNING'; step.startedAt=new Date().toISOString(); await this.save();
        try {
          const tool=this.tools.get(step.tool)!;
          const result=await tool.handler(tool.inputSchema.parse(step.arguments));
          step.status=outcome(result);
          const output=JSON.stringify(result); step.output=output.slice(0,40000); step.outputTruncated=output.length>40000;
        } catch(error: any) { step.status='FAIL'; step.output=error.message; }
        step.finishedAt=new Date().toISOString(); await this.save();
        if(step.status==='FAIL') break;
      }
      run.status=run.cancelRequested?'CANCELLED':run.steps.some(s=>s.status==='FAIL')?'FAIL':run.steps.some(s=>s.status==='SKIPPED')?'PARTIAL':'PASS';
    } finally {
      for (const step of run.steps) if(step.status==='PENDING') step.status='NOT_RUN';
      run.finishedAt=new Date().toISOString(); await this.save(); this.active=null;
    }
  }
  async tick(now=Date.now()) {
    if(this.ticking || this.active || this.fault) return;
    this.ticking=true;
    try {
      const due=this.jobs.find(j=>j.enabled && j.intervalSeconds && j.nextRunAt && Date.parse(j.nextRunAt)<=now);
      if(due) { due.nextRunAt=new Date(now+due.intervalSeconds!*1000).toISOString(); await this.save(); if(!this.active) await this.startJob(due.id); }
    } finally { this.ticking=false; }
  }
  startScheduler() { if(!this.timer) { this.timer=setInterval(()=>{void this.tick().catch(e=>{this.fault=e.message;});},5000); this.timer.unref(); } }
  stopScheduler() { if(this.timer) clearInterval(this.timer); this.timer=undefined; }
}
