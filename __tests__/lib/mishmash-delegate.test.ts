import {
  handleRegistryDelegate,
  dryRunCache,
  isTrustedLocalRequest,
  startRegistryDelegate,
} from "../../mishmash/delegate";

describe("registry-app mishmash delegate & dryRunCache", () => {
  beforeEach(() => {
    dryRunCache.clear();
  });

  it("handles ping action", () => {
    const res = handleRegistryDelegate({
      v: 1,
      id: "env-1",
      from: "gateway",
      to: "registry-app",
      capability: "health",
      action: "ping",
      payload: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((res.body.result as any).action).toBe("ping");
  });

  it("speculates on explicit candidate and caches dry-run", () => {
    const res = handleRegistryDelegate({
      v: 1,
      id: "env-2",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "speculate",
      payload: {
        candidateId: "pat_morning_coffee",
        actionPayload: { tool: "order_coffee", amount: 1 },
        summary: "Order regular morning drip",
        ttlMs: 5000,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const result = res.body.result as any;
    expect(result.action).toBe("speculate");
    expect(result.status).toBe("dry_run_ready");
    expect(result.candidateId).toBe("pat_morning_coffee");
    expect(result.proposalId).toMatch(/^prop_/);
    expect(typeof result.approvalNonce).toBe("string");
    expect(result.approvalNonce.length).toBeGreaterThan(10);

    // Verify cache status reflects the newly cached proposal
    const statusRes = handleRegistryDelegate({
      v: 1,
      id: "env-3",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "cache_status",
      payload: {},
    });
    expect(statusRes.status).toBe(200);
    expect((statusRes.body.result as any).size).toBe(1);
  });

  it("releases cached proposal on matching nonce and single-use consumes it", () => {
    const specRes = handleRegistryDelegate({
      v: 1,
      id: "env-4",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "speculate",
      payload: {
        candidateId: "pat_workout",
        actionPayload: { tool: "log_workout" },
        summary: "Log daily pushups",
      },
    });
    const { proposalId, approvalNonce } = specRes.body.result as any;

    // Bad nonce rejected with 403
    const badRelease = handleRegistryDelegate({
      v: 1,
      id: "env-5",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "release",
      payload: { proposalId, nonce: "wrong-nonce" },
    });
    expect(badRelease.status).toBe(403);

    // Correct nonce releases proposal
    const goodRelease = handleRegistryDelegate({
      v: 1,
      id: "env-6",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "release",
      payload: { proposalId, nonce: approvalNonce },
    });
    expect(goodRelease.status).toBe(200);
    const released = (goodRelease.body.result as any).proposal;
    expect(released.status).toBe("released");
    expect(released.actionPayload).toEqual({ tool: "log_workout" });

    // Single-use: attempting to release again returns 404
    const replayRelease = handleRegistryDelegate({
      v: 1,
      id: "env-7",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "release",
      payload: { proposalId, nonce: approvalNonce },
    });
    expect(replayRelease.status).toBe(404);
  });

  it("auto-ranks patterns in speculate if candidateId is omitted", () => {
    const patterns = [
      { id: "pat_low", promotionScore: 2, lastObservedAt: "2026-10-01T00:00:00.000Z" },
      { id: "pat_high", promotionScore: 99, lastObservedAt: "2026-10-01T00:00:00.000Z" },
    ];
    const res = handleRegistryDelegate({
      v: 1,
      id: "env-8",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "speculate",
      payload: { patterns },
    });
    expect(res.status).toBe(200);
    const result = res.body.result as any;
    expect(result.candidateId).toBe("pat_high");
    expect(result.summary).toContain("pat_high");
  });

  it("revokes proposal on reject and prevents later approval", () => {
    const specRes = handleRegistryDelegate({
      v: 1,
      id: "env-9",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "speculate",
      payload: {
        candidateId: "pat_danger",
        actionPayload: { tool: "dangerous_op" },
        summary: "Dangerous operation",
      },
    });
    const { proposalId, approvalNonce } = specRes.body.result as any;

    // Reject the proposal
    const rejRes = handleRegistryDelegate({
      v: 1,
      id: "env-10",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "reject",
      payload: { proposalId, reason: "User denied" },
    });
    expect(rejRes.status).toBe(200);
    expect((rejRes.body.result as any).revoked).toBe(true);

    // Attempting to release now fails with 404
    const relRes = handleRegistryDelegate({
      v: 1,
      id: "env-11",
      from: "gateway",
      to: "registry-app",
      capability: "staging",
      action: "release",
      payload: { proposalId, nonce: approvalNonce },
    });
    expect(relRes.status).toBe(404);
  });

  const env = (action: string, payload: Record<string, unknown>) => ({
    v: 1,
    id: `env-${action}`,
    from: "gateway",
    to: "registry-app",
    capability: "staging",
    action,
    payload,
  });

  it("keys a proposal by the caller's id and is idempotent for a live entry", () => {
    const first = handleRegistryDelegate(
      env("speculate", { proposalId: "policy_abc123", candidateId: "pol", summary: "Run probe", riskLevel: "low" })
    );
    expect(first.status).toBe(200);
    const a = (first.body.result as any);
    expect(a.proposalId).toBe("policy_abc123");

    // polling again must not rotate the nonce under the phone
    const second = handleRegistryDelegate(
      env("speculate", { proposalId: "policy_abc123", candidateId: "pol", summary: "Run probe" })
    );
    expect((second.body.result as any).approvalNonce).toBe(a.approvalNonce);

    // the daemon's id releases exactly once
    const released = handleRegistryDelegate(
      env("release", { proposalId: "policy_abc123", nonce: a.approvalNonce })
    );
    expect(released.status).toBe(200);
    const replay = handleRegistryDelegate(
      env("release", { proposalId: "policy_abc123", nonce: a.approvalNonce })
    );
    expect(replay.status).toBe(404);
  });

  it("rejects malformed caller-supplied proposal ids", () => {
    for (const bad of ["", "has space", "../etc", "x".repeat(129), "a\nb", 42, {}]) {
      const res = handleRegistryDelegate(env("speculate", { proposalId: bad, candidateId: "pol" }));
      expect(res.status).toBe(400);
    }
    expect(dryRunCache.status().size).toBe(0);
  });

  it("pending_proposals lists live proposals with nonces; cache_status never does", () => {
    const made = handleRegistryDelegate(
      env("speculate", { proposalId: "policy_p1", candidateId: "pol", summary: "S", riskLevel: "high", actionPayload: { cmd: "x" } })
    );
    const nonce = (made.body.result as any).approvalNonce;
    const pending = handleRegistryDelegate(env("pending_proposals", {}));
    expect(pending.status).toBe(200);
    const list = (pending.body.result as any).proposals;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      proposalId: "policy_p1",
      approvalNonce: nonce,
      riskLevel: "high",
      actionPayload: { cmd: "x" },
    });
    expect(typeof list[0].expiresAt).toBe("number");

    expect(JSON.stringify(handleRegistryDelegate(env("cache_status", {})).body)).not.toContain(nonce);

    // released proposals disappear from the pending list
    handleRegistryDelegate(env("release", { proposalId: "policy_p1", nonce }));
    expect((handleRegistryDelegate(env("pending_proposals", {})).body.result as any).proposals).toHaveLength(0);
  });

  it("expired proposals are not listed as pending", () => {
    handleRegistryDelegate(env("speculate", { proposalId: "policy_old", candidateId: "pol", ttlMs: 1 }));
    const realNow = Date.now;
    Date.now = () => realNow() + 5_000;
    try {
      expect((handleRegistryDelegate(env("pending_proposals", {})).body.result as any).proposals).toHaveLength(0);
    } finally {
      Date.now = realNow;
    }
  });

  it("trusts only same-host requests without an Origin header", () => {
    const addr = { port: 39403, address: "127.0.0.1", family: "IPv4" } as any;
    const ok = (headers: Record<string, string>) => isTrustedLocalRequest({ headers } as any, addr);
    expect(ok({ host: "127.0.0.1:39403" })).toBe(true);
    expect(ok({ host: "localhost:39403" })).toBe(true);
    expect(ok({ host: "[::1]:39403" })).toBe(true);
    expect(ok({ host: "127.0.0.1:39403", origin: "https://evil.example" })).toBe(false);
    expect(ok({ host: "rebound.attacker.example:39403" })).toBe(false);
    expect(ok({ host: "127.0.0.1:1" })).toBe(false);
    expect(ok({})).toBe(false);
  });

  it("the HTTP server refuses browser-origin and rebound-host requests but serves a plain local call", async () => {
    const server = await startRegistryDelegate(0);
    const port = (server.address() as any).port as number;
    const url = `http://127.0.0.1:${port}/mishmash/delegate`;
    const body = JSON.stringify(env("pending_proposals", {}));
    try {
      const plain = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" } });
      expect(plain.status).toBe(200);
      const http = await import("node:http");
      const status = (headers: Record<string, string>) =>
        new Promise<number>((resolve, reject) => {
          const r = http.request(
            { host: "127.0.0.1", port, path: "/mishmash/delegate", method: "POST", headers: { "Content-Type": "application/json", ...headers } },
            (res) => {
              res.resume();
              resolve(res.statusCode ?? 0);
            }
          );
          r.on("error", reject);
          r.end(body);
        });
      expect(await status({ Origin: "https://evil.example" })).toBe(403);
      expect(await status({ Host: "rebound.attacker.example" })).toBe(403);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
