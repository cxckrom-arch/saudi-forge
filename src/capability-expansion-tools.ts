import * as z from "zod/v4";

type ResultFn = (text: string) => any;
type ErrorResultFn = (error: unknown) => any;

export function registerCapabilityExpansionTools(
  server: any,
  deps: {
    result: ResultFn;
    errorResult: ErrorResultFn;
    V120_CAPABILITIES: any[];
    V130_CAPABILITIES: any[];
    V140_CAPABILITIES: any[];
    V150_CAPABILITIES: any[];
    v120RunCapability: (...args: any[]) => Promise<any>;
    v120MegaStatus: () => Promise<any>;
    v120RunMegaAudit: (...args: any[]) => Promise<any>;
    v130RunCapability: (...args: any[]) => Promise<any>;
    v140RunCapability: (...args: any[]) => Promise<any>;
    v150RunCapability: (...args: any[]) => Promise<any>;
  }
) {
  const {
    result,errorResult,V120_CAPABILITIES,V130_CAPABILITIES,V140_CAPABILITIES,V150_CAPABILITIES,
    v120RunCapability,v120MegaStatus,v120RunMegaAudit,v130RunCapability,v140RunCapability,v150RunCapability
  } = deps;

// ===== v12.0 MEGA-100 CAPABILITY TOOLS =====
  for (const cap of V120_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v12`,
      {title:`${cap.title} v12`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v120RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  server.registerTool("mega_100_status_v12",{title:"Mega 100 Status v12",description:"Show readiness and report coverage for the 100-capability v12 expansion.",inputSchema:z.object({}),annotations:{readOnlyHint:true,openWorldHint:false}},async()=>{try{return result(JSON.stringify(await v120MegaStatus(),null,2));}catch(error){return errorResult(error);}});
  server.registerTool("mega_100_audit_v12",{title:"Mega 100 Audit v12",description:"Run the complete 100-capability static engineering audit, or selected capability categories.",inputSchema:z.object({categories:z.array(z.string()).default([])}),annotations:{readOnlyHint:false,openWorldHint:false}},async({categories})=>{try{return result(JSON.stringify(await v120RunMegaAudit(categories),null,2));}catch(error){return errorResult(error);}});
  // ===== END v12.0 TOOLS =====

  // ===== v13.0 EXACT-500 TOOL REGISTRATION =====
  for (const cap of V130_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v13`,
      {title:`${cap.title} v13`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v130RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  // ===== END v13.0 TOOL REGISTRATION =====

  // ===== v14.0 EXACT-1000 TOOL REGISTRATION =====
  for (const cap of V140_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v14`,
      {title:`${cap.title} v14`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v140RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  // ===== END v14.0 TOOL REGISTRATION =====

  // ===== v15.0 EXACT-5000 TOOL REGISTRATION =====
  for (const cap of V150_CAPABILITIES) {
    server.registerTool(
      `${cap.id}_v15`,
      {title:`${cap.title} v15`,description:cap.description,inputSchema:z.object({scope:z.string().optional(),writeReport:z.boolean().default(true)}),annotations:{readOnlyHint:false,openWorldHint:false}},
      async({scope,writeReport})=>{try{return result(JSON.stringify(await v150RunCapability(cap,scope,writeReport),null,2));}catch(error){return errorResult(error);}}
    );
  }
  // ===== END v15.0 TOOL REGISTRATION =====


  
}
