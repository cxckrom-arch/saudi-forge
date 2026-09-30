type Handler = (...args: any[]) => Promise<any>;

export function registerAiControlRoutes(app: any, handlers: {
  controlStatus: Handler;
  providerHealth: Handler;
  quickSelect: Handler;
  routePreview: Handler;
  setCredential: Handler;
  toggleProvider: Handler;
  testProvider: Handler;
  setDefault: Handler;
}) {
  app.get("/ide/api/ai-control/status", async (_request: any, reply: any) => {
    try { return reply.send(await handlers.controlStatus()); }
    catch (error) { return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) }); }
  });

  app.get("/ide/api/ai-control/health", async (_request: any, reply: any) => {
    try { return reply.send(await handlers.providerHealth({})); }
    catch (error) { return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) }); }
  });

  app.post("/ide/api/ai-control/select", async (request: any, reply: any) => {
    try {
      return reply.send(await handlers.quickSelect({
        providerId: String(request.body?.providerId || ""),
        model: String(request.body?.model || ""),
        taskClass: request.body?.taskClass
      }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/ai-control/route", async (request: any, reply: any) => {
    try {
      return reply.send(await handlers.routePreview({
        task: String(request.body?.task || ""),
        preferLocal: !!request.body?.preferLocal
      }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/ai-control/credential", async (request: any, reply: any) => {
    try {
      const providerId = String(request.body?.providerId || "").trim();
      const apiKey = String(request.body?.apiKey || "").trim();
      if (!providerId) throw new Error("providerId is required");
      if (!apiKey) throw new Error("apiKey is required");
      return reply.send(await handlers.setCredential({ providerId, apiKey }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/ai-control/toggle", async (request: any, reply: any) => {
    try {
      const providerId = String(request.body?.providerId || "").trim();
      if (!providerId) throw new Error("providerId is required");
      return reply.send(await handlers.toggleProvider({ providerId, enabled: Boolean(request.body?.enabled) }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/ai-control/test", async (request: any, reply: any) => {
    try {
      const providerId = String(request.body?.providerId || "").trim();
      if (!providerId) throw new Error("providerId is required");
      return reply.send(await handlers.testProvider({ providerId }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/ai-control/default", async (request: any, reply: any) => {
    try {
      const providerId = String(request.body?.providerId || "").trim();
      const model = String(request.body?.model || "").trim();
      if (!providerId) throw new Error("providerId is required");
      if (!model) throw new Error("model is required");
      return reply.send(await handlers.setDefault({ providerId, model }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
