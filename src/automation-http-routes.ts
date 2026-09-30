import * as z from "zod/v4";
import { ToolRuntime } from "./tool-runtime.js";

export function registerAutomationHttpRoutes(app: any, toolRuntime: ToolRuntime) {
  app.get("/ide/api/tools", async () => ({
    tools: toolRuntime.catalog(),
    transport: "shared MCP handlers"
  }));

  app.get("/ide/api/automations", async () => toolRuntime.snapshot());

  const runtimeEndpoint =
    (action: (request: any) => Promise<any>) =>
    async (request: any, reply: any) => {
      try {
        return await action(request);
      } catch (error: any) {
        return reply
          .code(error.message === "Another run is already active" ? 409 : 400)
          .send({ error: error.message });
      }
    };

  app.post(
    "/ide/api/tools/run",
    runtimeEndpoint(async (request) => {
      const input = z
        .object({
          tool: z.string(),
          arguments: z.record(z.string(), z.unknown()).default({})
        })
        .strict()
        .parse(request.body);

      return toolRuntime.start(input.tool, [input]);
    })
  );

  app.post(
    "/ide/api/automations",
    runtimeEndpoint(async (request) => toolRuntime.upsert(request.body))
  );

  app.put(
    "/ide/api/automations/:id",
    runtimeEndpoint(async (request) =>
      toolRuntime.upsert(request.body, request.params.id)
    )
  );

  app.delete(
    "/ide/api/automations/:id",
    runtimeEndpoint(async (request) => toolRuntime.remove(request.params.id))
  );

  app.post(
    "/ide/api/automations/:id/run",
    runtimeEndpoint(async (request) => toolRuntime.startJob(request.params.id))
  );

  app.post(
    "/ide/api/runs/:id/cancel",
    runtimeEndpoint(async (request) => toolRuntime.cancel(request.params.id))
  );
}
