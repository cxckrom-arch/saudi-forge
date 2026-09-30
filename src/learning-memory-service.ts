import fs from "node:fs/promises";

export type LearningRecord = {
  id: string;
  at: string;
  taskType: string;
  task: string;
  agent?: string;
  strategy?: string;
  outcome: "success" | "failed" | "partial" | "blocked";
  evidence: string[];
  failureFingerprint?: string;
  lesson: string;
  tags: string[];
  confidence: number;
  source: "runtime" | "manual" | "repair" | "release";
};

export type ConfidenceAssessment = {
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  missingEvidence: string[];
  recommendedAction: string;
};

export function createLearningMemoryService(options:{
  kromStatePath:(file:string)=>Promise<string>;
  learningMemoryFile?:string;
  decisionLedgerFile?:string;
}) {
  const {
    kromStatePath,
    learningMemoryFile="learning-memory.json",
    decisionLedgerFile="decision-ledger.json"
  }=options;

  function clampConfidence(n:number){ return Math.max(0, Math.min(100, Math.round(n))); }

  function taskTypeOf(task:string){
    const t=task.toLowerCase();
    if (/ui|ux|design|واجهة|تصميم|responsive|rtl/.test(t)) return "ui";
    if (/fix|bug|error|repair|صلح|خطأ|مشكلة/.test(t)) return "repair";
    if (/database|supabase|sql|rls|migration|قاعدة/.test(t)) return "database";
    if (/deploy|vercel|ci|release|نشر/.test(t)) return "deployment";
    if (/security|auth|permission|صلاح|امن|أمان/.test(t)) return "security";
    if (/test|qa|playwright|cypress|اختبار/.test(t)) return "qa";
    return "engineering";
  }

  async function readLearningMemory(): Promise<LearningRecord[]> {
    try { return JSON.parse(await fs.readFile(await kromStatePath(learningMemoryFile), "utf8")); }
    catch { return []; }
  }

  async function writeLearningMemory(rows:LearningRecord[]){
    await fs.writeFile(await kromStatePath(learningMemoryFile), JSON.stringify(rows.slice(-1000), null, 2), "utf8");
  }

  function assessDecisionConfidence(args:{contextFiles?:number; evidence?:string[]; unresolvedGaps?:number; priorSuccesses?:number; priorFailures?:number; highRisk?:boolean;}): ConfidenceAssessment {
    let score=45;
    const reasons:string[]=[];
    const missingEvidence:string[]=[];
    const ev=args.evidence || [];
    if ((args.contextFiles||0) >= 3) { score+=12; reasons.push("Relevant project context is available."); } else { score-=12; missingEvidence.push("More task-relevant files/context"); }
    if (ev.length >= 2) { score+=15; reasons.push("Multiple evidence items support the decision."); } else { score-=10; missingEvidence.push("At least two independent evidence items"); }
    if ((args.unresolvedGaps||0)===0) { score+=10; reasons.push("No known critical context gaps."); } else { score-=15; missingEvidence.push("Resolve known context gaps"); }
    score += Math.min(15,(args.priorSuccesses||0)*5);
    score -= Math.min(25,(args.priorFailures||0)*8);
    if (args.highRisk) { score-=10; reasons.push("High-risk change requires stronger verification."); }
    score=clampConfidence(score);
    const band=score>=80?"HIGH":score>=55?"MEDIUM":"LOW";
    const recommendedAction=band==="HIGH"?"Proceed with normal verification.":band==="MEDIUM"?"Proceed cautiously and add targeted verification before irreversible changes.":"Do not make broad or irreversible changes; gather more evidence or narrow the task first.";
    return {score,band,reasons,missingEvidence,recommendedAction};
  }

  function summarizeLessons(rows:LearningRecord[], task:string){
    const type=taskTypeOf(task);
    const related=rows.filter(r=>r.taskType===type);
    const successes=related.filter(r=>r.outcome==="success");
    const failures=related.filter(r=>r.outcome==="failed");
    const tagCounts=new Map<string,number>();
    for (const r of related) for (const t of r.tags) tagCounts.set(t,(tagCounts.get(t)||0)+1);
    return {
      taskType:type,
      relatedCount:related.length,
      successes:successes.length,
      failures:failures.length,
      strongestLessons:[...related].sort((a,b)=>b.confidence-a.confidence).slice(-30).reverse().slice(0,8).map(r=>({lesson:r.lesson,outcome:r.outcome,confidence:r.confidence,tags:r.tags})),
      commonTags:[...tagCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([tag,count])=>({tag,count}))
    };
  }

  return {
    learningMemoryFile,
    decisionLedgerFile,
    clampConfidence,
    taskTypeOf,
    readLearningMemory,
    writeLearningMemory,
    assessDecisionConfidence,
    summarizeLessons
  };
}
