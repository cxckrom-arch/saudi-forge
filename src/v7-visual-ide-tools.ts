import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerV7VisualIdeTools(
  server: any,
  deps: {
    projectRoot: string;
    layoutFile: string;
    diagnosticsFile: string;
    selectorFile: string;
    previewFile: string;
    themeFile: string;
    visualGateFile: string;
    result: ResultFn;
    errorResult: ErrorResultFn;
    v70WorkspaceState: () => Promise<any>;
    v70Layout: () => Promise<any>;
    v60WriteJson: (...args: any[]) => Promise<any>;
    v60Diagnostics: () => Promise<any>;
    v60ReadJson: (...args: any[]) => Promise<any>;
    v70SelectorState: () => Promise<any>;
    v70PreviewState: () => Promise<any>;
    executeProgram: (...args: any[]) => Promise<any>;
    v50TaskBoard: () => Promise<any>;
    v70Theme: () => Promise<any>;
  }
) {
  const {
    projectRoot,
    layoutFile,
    diagnosticsFile,
    selectorFile,
    previewFile,
    themeFile,
    visualGateFile,
    result,
    errorResult,
    v70WorkspaceState,
    v70Layout,
    v60WriteJson,
    v60Diagnostics,
    v60ReadJson,
    v70SelectorState,
    v70PreviewState,
    executeProgram,
    v50TaskBoard,
    v70Theme
  } = deps;

  // =========================================================
  // v7.0 VISUAL IDE + AI WORKSPACE TOOLS
  // =========================================================
  server.registerTool(
    "visual_ide_workspace_v7",
    {title:"Visual IDE Workspace v7",description:"Return the unified Visual IDE workspace model for Explorer, Problems, Tasks, Git, Preview, selector state and execution stream.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{return result(JSON.stringify(await v70WorkspaceState(),null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "panel_layout_v7",
    {title:"Panel Layout v7",description:"Read or update Visual IDE panel visibility and sizes.",inputSchema:z.object({action:z.enum(['get','update']).default('get'),patch:z.record(z.string(), z.any()).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,patch})=>{try{let layout=await v70Layout();if(action==='update'&&patch){layout={...layout,...patch};await v60WriteJson(layoutFile,layout);}return result(JSON.stringify({status:'OK',layout,file:`.krom/${layoutFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "problems_panel_v7",
    {title:"Problems Panel v7",description:"Return normalized IDE problems grouped by file and severity.",inputSchema:z.object({refresh:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({refresh})=>{try{const d=refresh?await v60Diagnostics():await v60ReadJson(diagnosticsFile,null)||await v60Diagnostics();const counts={errors:d.diagnostics.filter((x:any)=>x.severity==='error').length,warnings:d.diagnostics.filter((x:any)=>x.severity==='warning').length};return result(JSON.stringify({status:d.status,counts,byFile:d.byFile,items:d.diagnostics},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "agent_model_selector_v7",
    {title:"Agent / Model Selector v7",description:"Persist the selected KROM agent strategy, model label and reasoning level for the workspace without inventing provider availability.",inputSchema:z.object({action:z.enum(['get','set']).default('get'),agent:z.string().optional(),model:z.string().optional(),reasoning:z.enum(['low','medium','high']).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,agent,model,reasoning})=>{try{let state=await v70SelectorState();if(action==='set'){state={...state,...(agent?{agent}:{}),...(model?{model}:{}),...(reasoning?{reasoning}:{}),updatedAt:new Date().toISOString()};await v60WriteJson(selectorFile,state);}return result(JSON.stringify({status:'OK',selector:state,rule:'Selection is workspace metadata; actual provider/model execution must be verified by the connected runtime.'},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "preview_session_v7",
    {title:"Preview Session v7",description:"Manage Preview/Browser session metadata for the Visual IDE and optionally verify a local URL using Live Browser Vision when available.",inputSchema:z.object({action:z.enum(['get','set','clear']).default('get'),url:z.string().url().optional(),width:z.number().int().min(240).max(3840).optional(),height:z.number().int().min(240).max(2160).optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,url,width,height})=>{try{let state=await v70PreviewState();if(action==='clear'){state={status:'IDLE',url:null,viewport:{width:1440,height:900},lastChecked:null};await v60WriteJson(previewFile,state);}if(action==='set'){if(!url)throw new Error('url is required for set');state={status:'CONFIGURED',url,viewport:{width:width||1440,height:height||900},lastChecked:new Date().toISOString()};await v60WriteJson(previewFile,state);}return result(JSON.stringify({status:'OK',preview:state,nextAction:state.url?'Run live_browser_vision for runtime verification.':'Set a preview URL after starting the project dev server.'},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "git_panel_v7",
    {title:"Git Panel v7",description:"Return Git status, changed files and diff summary for the Visual IDE source-control panel.",inputSchema:z.object({includeDiffStat:z.boolean().default(true)}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({includeDiffStat})=>{try{const [status,diff]=await Promise.all([executeProgram('git',['status','--short'],projectRoot,60000),includeDiffStat?executeProgram('git',['diff','--stat'],projectRoot,60000):Promise.resolve({success:true,stdout:'',stderr:'',code:0})]);const changed=(status.stdout||'').split(/\r?\n/).filter(Boolean).map((line:string)=>({code:line.slice(0,2),file:line.slice(3)}));return result(JSON.stringify({status:status.success?'OK':'UNAVAILABLE',changed,diffStat:diff.stdout||'',raw:status.stdout||status.stderr||''},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "task_board_panel_v7",
    {title:"Task Board Panel v7",description:"Return the live KROM task board grouped for Backlog, Ready, In Progress, Blocked and Verified UI columns.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{const b=await v50TaskBoard();const cols:any={backlog:[],ready:[],in_progress:[],blocked:[],verified:[]};for(const n of (b.nodes||[])){const k=n.status==='pending'?'backlog':n.status==='verified'||n.status==='done'?'verified':n.status==='in_progress'?'in_progress':n.status==='blocked'?'blocked':'ready';cols[k].push(n);}return result(JSON.stringify({status:'OK',columns:cols,counts:b.counts,autopilot:b.autopilot,requirements:b.requirements},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "command_palette_v7",
    {title:"Command Palette v7",description:"Return discoverable KROM/IDE commands and matching workspace actions for Ctrl+K style navigation.",inputSchema:z.object({query:z.string().default('')}),annotations:{readOnlyHint:true,openWorldHint:false}},
    async({query})=>{try{const commands=[['Files: Explore','smart_file_explorer_v6'],['Files: Search','workspace_search_v6'],['Problems: Refresh','problems_panel_v7'],['Terminal: Scripts','terminal_manager_v6'],['Git: Status','git_panel_v7'],['Preview: Configure','preview_session_v7'],['Tasks: Board','task_board_panel_v7'],['Execution: Stream','execution_stream_v6'],['Autopilot: Status','engineering_autopilot_status'],['Release: IDE Gate','ide_release_gate_v6'],['Release: Engineering Gate','engineering_suite_gate_v5'],['Release: Product Readiness','product_release_readiness']].map(([title,tool])=>({title,tool}));const q=query.trim().toLowerCase();const out=q?commands.filter(c=>(c.title+' '+c.tool).toLowerCase().includes(q)):commands;return result(JSON.stringify({status:'OK',commands:out},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "ui_theme_v7",
    {title:"UI Theme v7",description:"Read or update Visual IDE appearance metadata including mode, density, font sizes and RTL preference.",inputSchema:z.object({action:z.enum(['get','set']).default('get'),mode:z.enum(['dark','light']).optional(),density:z.enum(['compact','comfortable']).optional(),fontSize:z.number().int().min(11).max(18).optional(),editorFontSize:z.number().int().min(11).max(22).optional(),rtl:z.boolean().optional()}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({action,...patch})=>{try{let theme=await v70Theme();if(action==='set'){theme={...theme,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};await v60WriteJson(themeFile,theme);}return result(JSON.stringify({status:'OK',theme,file:`.krom/${themeFile}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "workspace_snapshot_v7",
    {title:"Workspace Snapshot v7",description:"Create a compact IDE snapshot of project files, diagnostics, Git, tasks, preview and execution state for resume/review.",inputSchema:z.object({}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async()=>{try{const snap=await v70WorkspaceState();const file=`v7-workspace-snapshot-${Date.now()}.json`;await v60WriteJson(file,snap);return result(JSON.stringify({status:'OK',summary:{files:snap.files.count,diagnostics:snap.diagnostics.count,tasks:(snap.tasks.nodes||[]).length,preview:snap.preview.status},file:`.krom/${file}`},null,2));}catch(error){return errorResult(error);}}
  );

  server.registerTool(
    "visual_ide_gate_v7",
    {title:"Visual IDE Gate v7",description:"Gate the Visual IDE workspace on diagnostics, blocked tasks, preview readiness for UI work, and existing IDE release state.",inputSchema:z.object({requirePreview:z.boolean().default(false)}),annotations:{readOnlyHint:false,openWorldHint:false}},
    async({requirePreview})=>{try{const [diag,board,preview]=await Promise.all([v60Diagnostics(),v50TaskBoard(),v70PreviewState()]);const blockers:any[]=[];const errors=diag.diagnostics.filter((d:any)=>d.severity==='error');if(errors.length)blockers.push({type:'diagnostics',count:errors.length});const blocked=(board.nodes||[]).filter((n:any)=>n.status==='blocked');if(blocked.length)blockers.push({type:'tasks',count:blocked.length});if(requirePreview&&!preview.url)blockers.push({type:'preview',reason:'Preview URL is not configured'});const decision=blockers.length?'BLOCKED':'READY_FOR_DEEP_RELEASE_GATES';const audit={at:new Date().toISOString(),decision,blockers,preview,diagnostics:{status:diag.status,count:diag.count},taskCounts:board.counts};await v60WriteJson(visualGateFile,audit);return result(JSON.stringify({status:decision,audit,file:`.krom/${visualGateFile}`,nextAction:decision==='BLOCKED'?'Resolve IDE blockers.':'Run browser/security/product/release gates.'},null,2));}catch(error){return errorResult(error);}}
  );



}
