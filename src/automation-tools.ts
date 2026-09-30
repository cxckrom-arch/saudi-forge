import * as z from "zod/v4";
import { automationInput, ToolRuntime } from "./tool-runtime.js";

type ResultFactory = (text: string) => any;
type ErrorFactory = (error: unknown) => any;

export function registerAutomationTools(
  server: any,
  toolRuntime: ToolRuntime,
  result: ResultFactory,
  errorResult: ErrorFactory
) {
  const registerSet = (version: "v37" | "v36") => {
    server.registerTool(`connected_tools_${version}`, {
      description: "List tools bound to the local automation runner with their actual schemas.",
      inputSchema: z.object({})
    }, async () => result(JSON.stringify(toolRuntime.catalog())));

    server.registerTool(`automation_status_${version}`, {
      description: "Read saved jobs and execution evidence.",
      inputSchema: z.object({})
    }, async () => result(JSON.stringify(toolRuntime.snapshot())));

    server.registerTool(`automation_save_${version}`, {
      description: "Create or update a local automation. Scheduling is disabled by default.",
      inputSchema: automationInput.extend({ id: z.string().optional() })
    }, async ({ id, ...definition }: any) => {
      try {
        return result(JSON.stringify(await toolRuntime.upsert(definition, id)));
      } catch (error) {
        return errorResult(error);
      }
    });

    server.registerTool(`automation_run_${version}`, {
      description: `Start a saved automation; returns a run ID. Read automation_status_${version} for completion.`,
      inputSchema: z.object({ id: z.string() })
    }, async ({ id }: any) => {
      try {
        return result(JSON.stringify(await toolRuntime.startJob(id)));
      } catch (error) {
        return errorResult(error);
      }
    });

    server.registerTool(`automation_cancel_${version}`, {
      description: "Stop a run after its current step finishes.",
      inputSchema: z.object({ id: z.string() })
    }, async ({ id }: any) => {
      try {
        return result(JSON.stringify(await toolRuntime.cancel(id)));
      } catch (error) {
        return errorResult(error);
      }
    });
  };

  registerSet("v37");
  registerSet("v36");
}
