import { handleRegistryDelegate, dryRunCache } from "../../mishmash/delegate";

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
});
