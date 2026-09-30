import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV8WorkbenchTools(
  server: any,
  deps: {
    projectRoot: string;
    editorStateFile: string;
    editHistoryFile: string;
    chatContextFile: string;
    diagnosticsFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    v80WorkbenchState: () => Promise<any>;
    v80ReadTextFile: (file: string) => Promise<string>;
    v80EditorState: () => Promise<any>;
    normalizeRel: (value: string) => string;
    v60WriteJson: (...args: any[]) => Promise<any>;
    v80WriteTextFile: (...args: any[]) => Promise<any>;
    v80ApplyReplacement: (...args: any[]) => Promise<any>;
    v60ReadJson: (...args: any[]) => Promise<any>;
    v80UndoRedo: (...args: any[]) => Promise<any>;
    v60Diagnostics: () => Promise<any>;
    readPackageJson: () => Promise<any>;
    detectPackageManager: () => Promise<any>;
    executeProgram: (...args: any[]) => Promise<any>;
    safePath: (relativePath: string) => string;
    v50TaskBoard: () => Promise<any>;
    v70PreviewState: () => Promise<any>;
  }
) {
  const {
    projectRoot,
    editorStateFile,
    editHistoryFile,
    chatContextFile,
    diagnosticsFile,
    result,
    errorResult,
    v80WorkbenchState,
    v80ReadTextFile,
    v80EditorState,
    normalizeRel,
    v60WriteJson,
    v80WriteTextFile,
    v80ApplyReplacement,
    v60ReadJson,
    v80UndoRedo,
    v60Diagnostics,
    readPackageJson,
    detectPackageManager,
    executeProgram,
    safePath,
    v50TaskBoard,
    v70PreviewState
  } = deps;

  // =========================================================
  // KROM FORGE DEV CORE - AUTONOMOUS SOFTWARE FACTORY TOOLS
  // =========================================================
  server.registerTool(
    "workbench_state_v8",
    {title:"Workbench State v8",description:"Return the unified v8 coding-workbench state: files, diagnostics, tasks, Git, preview, editor tabs, history and AI context.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v80WorkbenchState(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "editor_open_file_v8",
    {title:"Editor Open File v8",description:"Open a project text file and persist it as the active editor tab.",inputSchema:z.object({file:z.string().min(1)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({file})=>{try{const content=await v80ReadTextFile(file);let st=await v80EditorState();const tabs=Array.from(new Set([...(st.tabs||[]),normalizeRel(file)]));st={...st,tabs,activeFile:normalizeRel(file),updatedAt:new Date().toISOString()};await v60WriteJson(editorStateFile,st);return result(JSON.stringify({status:"OK",file:normalizeRel(file),content,editor:st},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "editor_save_file_v8",
    {title:"Editor Save File v8",description:"Save editor content to a project file with automatic backup and edit-history evidence.",inputSchema:z.object({file:z.string().min(1),content:z.string()}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({file,content})=>{try{return result(JSON.stringify({status:"SAVED",...(await v80WriteTextFile(file,content,"editor_save"))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "apply_patch_v8",
    {title:"Apply Patch v8",description:"Apply a deterministic text replacement to one project file with backup and history. Fails if the search text is absent.",inputSchema:z.object({file:z.string().min(1),search:z.string().min(1),replacement:z.string(),replaceAll:z.boolean().default(false)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({file,search,replacement,replaceAll})=>{try{return result(JSON.stringify({status:"PATCHED",...(await v80ApplyReplacement(file,search,replacement,replaceAll))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "edit_history_v8",
    {title:"Edit History v8",description:"Inspect recent file-edit history or perform bounded undo/redo for the current project.",inputSchema:z.object({action:z.enum(["list","undo","redo"]).default("list"),file:z.string().optional(),limit:z.number().int().min(1).max(80).default(30)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({action,file,limit})=>{try{if(action==="list"){const h=(await v60ReadJson(editHistoryFile,[])) as any[];return result(JSON.stringify({status:"OK",history:h.filter(x=>!file||normalizeRel(x.file)===normalizeRel(file)).slice(-limit)},null,2));}return result(JSON.stringify({status:"OK",...(await v80UndoRedo(action,file))},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "editor_problems_v8",
    {title:"Editor Problems v8",description:"Return live diagnostics grouped for editor markers and Problems panel, optionally scoped to one file.",inputSchema:z.object({file:z.string().optional(),refresh:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({file,refresh})=>{try{const d=refresh?await v60Diagnostics():await v60ReadJson(diagnosticsFile,null)||await v60Diagnostics();const items=(d.diagnostics||[]).filter((x:any)=>!file||normalizeRel(x.file)===normalizeRel(file));return result(JSON.stringify({status:d.status,count:items.length,file:file||null,markers:items},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ai_file_context_v8",
    {title:"AI File Context v8",description:"Persist or read AI-workbench instructions linked to the active file. This stores context only and does not fabricate model execution.",inputSchema:z.object({action:z.enum(["get","add","clear"]).default("get"),message:z.string().optional(),activeFile:z.string().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,message,activeFile})=>{try{let st=await v60ReadJson(chatContextFile,{messages:[],activeFile:null});if(action==="clear")st={messages:[],activeFile:activeFile||null};if(action==="add"){if(!message?.trim())throw new Error("message is required");st.activeFile=activeFile||st.activeFile||null;st.messages=[...(st.messages||[]),{at:new Date().toISOString(),message:message.trim(),activeFile:activeFile||st.activeFile||null}].slice(-100);}await v60WriteJson(chatContextFile,st);return result(JSON.stringify({status:"OK",...st,rule:"Context storage does not imply an LLM call; use the connected agent/model runtime for generation."},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "terminal_script_v8",
    {title:"Terminal Script v8",description:"Run one declared package.json script and return terminal output for the Workbench. Arbitrary shell strings are not accepted.",inputSchema:z.object({script:z.string().min(1),timeoutSeconds:z.number().int().min(1).max(600).default(180)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
    async({script,timeoutSeconds})=>{try{const pkg=await readPackageJson()||{};if(!pkg.scripts||typeof pkg.scripts[script]!=="string")throw new Error(`Unknown package script: ${script}`);const pm=await detectPackageManager();const ex=await executeProgram(pm,["run",script],projectRoot,timeoutSeconds*1000);return result(JSON.stringify({status:ex.success?"PASS":"FAIL",script,command:`${pm} run ${script}`,code:ex.code??0,stdout:ex.stdout,stderr:ex.stderr},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "git_commit_v8",
    {title:"Git Commit v8",description:"Stage explicitly listed project files and create a Git commit with an explicit message. Refuses an empty file list or message.",inputSchema:z.object({message:z.string().min(3),files:z.array(z.string().min(1)).min(1)}),annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
    async({message,files})=>{try{const rels=files.map(normalizeRel);for(const f of rels)safePath(f);const add=await executeProgram("git",["add","--",...rels],projectRoot,60000);if(!add.success)throw new Error(add.stderr||"git add failed");const commit=await executeProgram("git",["commit","-m",message],projectRoot,120000);return result(JSON.stringify({status:commit.success?"COMMITTED":"FAILED",files:rels,message,stdout:commit.stdout,stderr:commit.stderr,code:commit.code??0},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workbench_gate_v8",
    {title:"Workbench Gate v8",description:"Gate v8 on diagnostics, blocked tasks, editor state and existing visual/IDE readiness before deeper release gates.",inputSchema:z.object({requireOpenFile:z.boolean().default(false),requirePreview:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({requireOpenFile,requirePreview})=>{try{const [diag,board,editor,preview]=await Promise.all([v60Diagnostics(),v50TaskBoard(),v80EditorState(),v70PreviewState()]);const blockers:any[]=[];const errors=(diag.diagnostics||[]).filter((x:any)=>x.severity==="error");if(errors.length)blockers.push({type:"diagnostics",count:errors.length});const blocked=(board.nodes||[]).filter((x:any)=>x.status==="blocked");if(blocked.length)blockers.push({type:"tasks",count:blocked.length});if(requireOpenFile&&!editor.activeFile)blockers.push({type:"editor",reason:"No active file"});if(requirePreview&&!preview.url)blockers.push({type:"preview",reason:"Preview is not configured"});const decision=blockers.length?"BLOCKED":"READY_FOR_DEEP_RELEASE_GATES";return result(JSON.stringify({status:decision,blockers,editor,preview,nextAction:decision==="BLOCKED"?"Resolve workbench blockers.":"Run product/security/browser/release gates."},null,2));}catch(error){return errorResult(error);}}
  );



}
