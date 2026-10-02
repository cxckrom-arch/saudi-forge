import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { SkillRecord, Finding, ValidationReport } from "./types.js";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_EXT = new Set([".md", ".json", ".yaml", ".yml", ".txt", ".ts", ".js", ".mjs", ".cjs", ".py", ".sh"]);
const SECRET_PATTERNS = [/AKIA[0-9A-Z]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{12,}/i];
const DANGEROUS = [/\bcurl\b.*\|\s*(?:sh|bash)/i, /\bwget\b.*\|\s*(?:sh|bash)/i, /\brm\s+-rf\b/i, /child_process|exec\s*\(|spawn\s*\(/, /\beval\s*\(/, /base64\s+-d/i];

export async function sha256File(file: string) { return createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
export function canonicalSkillId(input: string) { return input.trim().toLowerCase(); }
export function safeSkillId(input: string) { return ID.test(input) && !input.includes("..") && !input.includes("/") && !input.includes("\\"); }

export async function validateSkillPackage(root: string, skillDir: string): Promise<ValidationReport> {
  const checkedAt = new Date().toISOString(); const errors: string[] = []; const warnings: string[] = []; const securityFindings: Finding[] = []; const conflicts: string[] = [];
  const absolute = path.resolve(root, skillDir); const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    errors.push("skill path escapes project root");
    return { valid: false, errors, warnings, securityFindings, conflicts, checkedAt };
  }
  const skillFile = path.join(absolute, "SKILL.md");
  let text = "";
  try { text = await fs.readFile(skillFile, "utf8"); } catch { errors.push("SKILL.md is missing or unreadable"); return { valid:false, errors, warnings, securityFindings, conflicts, checkedAt }; }
  const match = text.match(/^---\s*\nname:\s*([^\n]+)\ndescription:\s*([^\n]+)\n---/);
  if (!match) errors.push("SKILL.md frontmatter requires name and description");
  const name = match?.[1]?.trim() ?? ""; const description = match?.[2]?.trim() ?? "";
  if (name && !safeSkillId(name)) errors.push("canonical skill name is invalid");
  if (description.length < 30) warnings.push("description is too short for reliable routing");
  if (text.split("\n").length > 500) warnings.push("SKILL.md exceeds the recommended 500-line progressive-disclosure budget");
  const entries = await walk(absolute);
  for (const file of entries) {
    const rel = path.relative(absolute, file).replaceAll("\\", "/");
    if (rel.split("/").some((part) => part === "..")) securityFindings.push({code:"PATH_TRAVERSAL",severity:"high",message:"skill resource path contains traversal",path:rel});
    if (!ALLOWED_EXT.has(path.extname(file).toLowerCase()) && path.basename(file) !== "SKILL.md") warnings.push(`unsupported resource extension: ${rel}`);
    const content = await fs.readFile(file, "utf8").catch(() => "");
    if (SECRET_PATTERNS.some((p) => p.test(content))) securityFindings.push({code:"SECRET_PATTERN",severity:"critical",message:"possible credential or private-key material detected; content redacted",path:rel,redacted:true});
    if (/https?:\/\//i.test(content) && !/https?:\/\/(?:github\.com|docs\.github\.com|localhost|127\.0\.0\.1)/i.test(content)) warnings.push(`external URL requires review: ${rel}`);
    if (path.extname(file).match(/\.(sh|js|mjs|cjs|py|ts)$/i)) for (const pattern of DANGEROUS) if (pattern.test(content)) securityFindings.push({code:"DANGEROUS_SCRIPT",severity:"high",message:"script contains a supply-chain or command-execution pattern",path:rel});
  }
  const critical = securityFindings.some((f) => f.severity === "critical");
  return { valid: errors.length === 0 && !critical, errors, warnings, securityFindings, conflicts, checkedAt };
}

async function walk(dir: string): Promise<string[]> { const out: string[] = []; for (const entry of await fs.readdir(dir,{withFileTypes:true})) { const full=path.join(dir,entry.name); if (entry.isDirectory()) out.push(...await walk(full)); else out.push(full); } return out; }

export async function readRegistry(root: string): Promise<{version:string; skills:SkillRecord[]; hash:string}> {
  const file=path.join(root,"skills","manifest.json"); const raw=await fs.readFile(file,"utf8"); const manifest=JSON.parse(raw); const skills:SkillRecord[]=[];
  for (const item of manifest.skills ?? []) { const dir=path.join(root,"skills",item.id); const skill=await fs.readFile(path.join(dir,"SKILL.md"),"utf8").catch(()=>""); const description=skill.match(/^description:\s*(.+)$/m)?.[1]?.trim(); skills.push({id:item.id,name:item.id,version:item.version??"1.0.0",ownerDomain:item.ownerDomain??"unassigned",status:item.status??"ACTIVE",source:item.source??"local",hash:createHash("sha256").update(skill).digest("hex"),canonical:item.canonical??item.class!=="optional",dependencies:item.dependencies??[],securityLevel:item.securityLevel??"medium",description,lastValidation:item.lastValidation,lastSecurityScan:item.lastSecurityScan}); }
  return {version:manifest.registryVersion??"2026.10",skills,hash:createHash("sha256").update(raw).digest("hex")};
}

export function registryCompliance(registry:{version:string;skills:SkillRecord[]}) { const ids=registry.skills.map(s=>s.id); const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i); const owners=registry.skills.filter(s=>s.canonical&&s.status==="ACTIVE").map(s=>s.ownerDomain); const ownerDuplicates=owners.filter((x,i)=>owners.indexOf(x)!==i); const missingDeps=registry.skills.flatMap(s=>s.dependencies.filter(d=>!ids.includes(d)).map(d=>`${s.id}->${d}`)); const blocked=registry.skills.filter(s=>s.canonical&&["BLOCKED","QUARANTINED"].includes(s.status)).map(s=>s.id); return {status:duplicates.length||ownerDuplicates.length||missingDeps.length||blocked.length?"BLOCKED":"PASS",duplicates:[...new Set(duplicates)],ownerDuplicates:[...new Set(ownerDuplicates)],missingDependencies:missingDeps,blocked,registryVersion:registry.version}; }

export function analyzeGap(task:string, registry:{skills:SkillRecord[]}, toolNames:string[], failures:string[]) { const q=task.toLowerCase(); const candidates=registry.skills.filter(s=>`${s.id} ${s.description??""}`.toLowerCase().split(/\W+/).some(token=>token.length>3&&q.includes(token))); const failureSignals=failures.filter(f=>q.split(/\W+/).some(t=>t.length>3&&f.toLowerCase().includes(t))); const hasTools=toolNames.some(t=>q.split(/\W+/).some(token=>token.length>3&&t.toLowerCase().includes(token))); return {task,candidates:candidates.map(s=>s.id),failureSignals,toolCoverage:hasTools,decision:candidates.length?"reuse_or_extend":"create_or_discover",confidence:candidates.length?0.8:0.35}; }
