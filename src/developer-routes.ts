type Handler = (...args: any[]) => Promise<any>;

export function registerDeveloperRoutes(app: any, handlers: {
  platformStatus: Handler;
  askModel: Handler;
  fullScan: Handler;
  previewSet: Handler;
}) {
  app.get("/ide/api/dev/status", async (_request: any, reply: any) => {
    try { return reply.send(await handlers.platformStatus()); }
    catch (error) { return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) }); }
  });

  app.post("/ide/api/dev/chat", async (request: any, reply: any) => {
    try {
      return reply.send(await handlers.askModel({
        message: String(request.body?.message || ""),
        activeFile: request.body?.activeFile ? String(request.body.activeFile) : null,
        preferLocal: !!request.body?.preferLocal
      }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/dev/scan", async (_request: any, reply: any) => {
    try { return reply.send(await handlers.fullScan()); }
    catch (error) { return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) }); }
  });

  app.post("/ide/api/dev/preview", async (request: any, reply: any) => {
    try {
      return reply.send(await handlers.previewSet({
        url: String(request.body?.url || "")
      }));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
