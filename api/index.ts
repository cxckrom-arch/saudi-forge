import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../server.js";

let ready: Promise<void> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  ready ??= Promise.resolve(app.ready()).then(() => undefined);
  await ready;
  app.server.emit("request", request, response);
}
