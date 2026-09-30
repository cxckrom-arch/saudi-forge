type Handler = (...args: any[]) => Promise<any>;

export function registerWorkspaceRoutes(app: any, handlers: {
  workbenchState: Handler;
  normalizeRel: (value: string) => string;
  readTextFile: Handler;
  writeTextFile: Handler;
  undoRedo: Handler;
  readChatContext: Handler;
  writeChatContext: Handler;
}) {
  app.get("/ide/api/state", async (_request: any, reply: any) => {
    try {
      return reply.type("application/json").send(await handlers.workbenchState());
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/ide/api/file", async (request: any, reply: any) => {
    try {
      const rel = String(request.query?.path || "");
      if (!rel) throw new Error("path is required");
      return reply.send({
        file: handlers.normalizeRel(rel),
        content: await handlers.readTextFile(rel)
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/file", async (request: any, reply: any) => {
    try {
      const rel = String(request.body?.path || "");
      const content = String(request.body?.content ?? "");
      if (!rel) throw new Error("path is required");
      return reply.send({
        status: "SAVED",
        ...(await handlers.writeTextFile(rel, content, "visual_editor_save"))
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/history", async (request: any, reply: any) => {
    try {
      const action = String(request.body?.action || "") as "undo" | "redo";
      if (!["undo", "redo"].includes(action)) throw new Error("action must be undo or redo");
      return reply.send(
        await handlers.undoRedo(
          action,
          request.body?.file ? String(request.body.file) : undefined
        )
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/ide/api/chat", async (request: any, reply: any) => {
    try {
      const message = String(request.body?.message || "").trim();
      if (!message) throw new Error("message is required");
      const state = await handlers.readChatContext({
        messages: [],
        activeFile: null
      });
      state.activeFile = request.body?.activeFile || state.activeFile || null;
      state.messages = [
        ...(state.messages || []),
        { at: new Date().toISOString(), message, activeFile: state.activeFile }
      ].slice(-100);
      await handlers.writeChatContext(state);
      return reply.send(state);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
