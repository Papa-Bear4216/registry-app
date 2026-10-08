import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { isRankError, rankSuppliedCandidates } from "../../pattern-analyzer/src/mishmash-rank";

const NODE = "registry-app";

export interface SpeculativeProposal {
  proposalId: string;
  candidateId: string;
  actionPayload: Record<string, unknown>;
  summary: string;
  createdAt: number;
  expiresAt: number;
  approvalNonce: string;
  status: "dry_run_ready" | "released";
}

const MAX_CACHE_SIZE = 100;
const DEFAULT_TTL_MS = 60_000;

export class DryRunCache {
  private cache = new Map<string, SpeculativeProposal>();

  private prune() {
    const now = Date.now();
    for (const [id, item] of this.cache.entries()) {
      if (item.expiresAt <= now) {
        this.cache.delete(id);
      }
    }
    while (this.cache.size > MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
      else break;
    }
  }

  set(
    candidateId: string,
    actionPayload: Record<string, unknown>,
    summary: string,
    ttlMs: number = DEFAULT_TTL_MS
  ): SpeculativeProposal {
    this.prune();
    const now = Date.now();
    const proposal: SpeculativeProposal = {
      proposalId: `prop_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      candidateId,
      actionPayload,
      summary,
      createdAt: now,
      expiresAt: now + (ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS),
      approvalNonce: randomBytes(16).toString("hex"),
      status: "dry_run_ready",
    };
    this.cache.set(proposal.proposalId, proposal);
    return proposal;
  }

  get(proposalId: string): SpeculativeProposal | null {
    this.prune();
    const item = this.cache.get(proposalId);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.cache.delete(proposalId);
      return null;
    }
    return item;
  }

  release(
    proposalId: string,
    nonce: string
  ): { ok: true; proposal: SpeculativeProposal } | { ok: false; error: string; code: number } {
    this.prune();
    const item = this.cache.get(proposalId);
    if (!item || item.expiresAt <= Date.now()) {
      if (item) this.cache.delete(proposalId);
      return { ok: false, error: "proposal expired or not found", code: 404 };
    }
    if (item.approvalNonce !== nonce) {
      return { ok: false, error: "invalid approval nonce", code: 403 };
    }
    this.cache.delete(proposalId);
    item.status = "released";
    return { ok: true, proposal: item };
  }

  status() {
    this.prune();
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      proposals: Array.from(this.cache.values()).map((p) => ({
        proposalId: p.proposalId,
        candidateId: p.candidateId,
        expiresAt: new Date(p.expiresAt).toISOString(),
        status: p.status,
      })),
    };
  }

  clearProposal(proposalId: string): boolean {
    return this.cache.delete(proposalId);
  }

  clear() {
    this.cache.clear();
  }
}

export const dryRunCache = new DryRunCache();

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
  if (record.action === "speculate") {
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    let candidateId = String(payload.candidateId || "");
    let actionPayload = (payload.actionPayload || {}) as Record<string, unknown>;
    let summary = String(payload.summary || "");

    // If patterns provided, auto-rank and pick top candidate
    if (!candidateId && payload.patterns) {
      const ranked = rankSuppliedCandidates(payload);
      if (isRankError(ranked)) return { status: 400, body: { error: ranked.error } };
      const top = ranked.order[0];
      if (!top) {
        return { status: 400, body: { error: "no patterns available to speculate" } };
      }
      candidateId = top.id;
      summary = `Auto-speculation for top pattern: ${top.id}`;
      actionPayload = {
        target: "agent-mesh-mcp",
        capability: "mesh",
        action: "skills",
        patternId: top.id,
      };
    }

    if (!candidateId) {
      return { status: 400, body: { error: "speculate requires candidateId or patterns" } };
    }

    const ttlMs = typeof payload.ttlMs === "number" ? payload.ttlMs : DEFAULT_TTL_MS;
    const proposal = dryRunCache.set(candidateId, actionPayload, summary, ttlMs);
    return {
      status: 200,
      body: envelope(record, {
        node: NODE,
        action: "speculate",
        proposalId: proposal.proposalId,
        candidateId: proposal.candidateId,
        status: proposal.status,
        expiresAt: new Date(proposal.expiresAt).toISOString(),
        approvalNonce: proposal.approvalNonce,
        summary: proposal.summary,
      }),
    };
  }
  if (record.action === "release") {
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const proposalId = String(payload.proposalId || "");
    const nonce = String(payload.nonce || payload.approvalNonce || "");
    if (!proposalId || !nonce) {
      return { status: 400, body: { error: "release requires proposalId and nonce" } };
    }
    const res = dryRunCache.release(proposalId, nonce);
    if (!res.ok) {
      return { status: res.code, body: { error: res.error } };
    }
    return {
      status: 200,
      body: envelope(record, {
        node: NODE,
        action: "release",
        proposal: res.proposal,
      }),
    };
  }
  if (record.action === "cache_status") {
    return {
      status: 200,
      body: envelope(record, {
        node: NODE,
        action: "cache_status",
        ...dryRunCache.status(),
      }),
    };
  }
  if (record.action === "reject") {
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const proposalId = String(payload.proposalId || "");
    const deleted = proposalId ? dryRunCache.clearProposal(proposalId) : false;
    return {
      status: 200,
      body: envelope(record, {
        node: NODE,
        action: "reject",
        proposalId,
        revoked: deleted,
      }),
    };
  }
  return { status: 400, body: { error: "registry-app accepts ping, stage, speculate, release, reject, or cache_status" } };
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
