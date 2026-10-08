import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isRankError, rankSuppliedCandidates } from "../../pattern-analyzer/src/mishmash-rank.ts";

const NODE = "registry-app";

function isLoopback(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function envelope(body: Record<string, unknown>, result: Record<string, unknown>) {
  return {
    v: 1,
    inReplyTo: body.id,
    from: NODE,
    to: body.from,
    ok: true,
    result,
  };
}

export function handleRegistryDelegate(body: unknown): { status: number; body: Record<string, unknown> } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { error: "envelope must be a JSON object" } };
  }
  const record = body as Record<string, unknown>;
  if (record.to !== NODE || record.v !== 1) {
    return { status: 400, body: { error: "envelope is not addressed to registry-app" } };
  }
  if (record.action === "ping") {
    return { status: 200, body: envelope(record, { node: NODE, action: "ping" }) };
  }
  if (record.action === "stage") {
    const ranked = rankSuppliedCandidates(record.payload ?? {});
    if (isRankError(ranked)) return { status: 400, body: { error: ranked.error } };
    return {
      status: 200,
      body: envelope(record, {
        node: NODE,
        action: "stage",
        staged: ranked.returned,
        topId: ranked.order[0]?.id ?? null,
        order: ranked.order,
      }),
    };
  }
  return { status: 400, body: { error: "registry-app accepts ping or stage" } };
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("delegate body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => reject(new Error("body stream failed")));
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function startRegistryDelegate(port: number) {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true, node: NODE });
      return;
    }
    if (req.method !== "POST" || path !== "/mishmash/delegate") {
      send(res, 404, { error: "Not Found" });
      return;
    }
    if (!isLoopback(req.socket.remoteAddress)) {
      send(res, 403, { error: "delegate is only accepted from this PC" });
      return;
    }
    try {
      const raw = await readBody(req, 64 * 1024);
      const decoded = raw ? JSON.parse(raw) : {};
      const outcome = handleRegistryDelegate(decoded);
      send(res, outcome.status, outcome.body);
    } catch (err) {
      send(res, 400, { error: err instanceof Error ? err.message : "bad body" });
    }
  });
  return new Promise<ReturnType<typeof createServer>>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const invoked = process.argv.some((arg) => {
  const base = arg.split(/[/\\]/).pop();
  return base === "delegate.ts" || base === "delegate.js";
});
if (invoked) {
  const port = Number(process.env.MISHMASH_PORT || 39403);
  startRegistryDelegate(port).then(() => {
    console.log(`registry-app mishmash on 127.0.0.1:${port}`);
  });
}
