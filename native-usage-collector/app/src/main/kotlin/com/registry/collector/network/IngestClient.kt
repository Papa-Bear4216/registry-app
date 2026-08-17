package com.registry.collector.network

import kotlinx.serialization.Serializable

/**
 * Request body for POST /ingest.
 *
 * MUST match the server's IngestBody interface exactly:
 * - functions/src/ingest/ingest.ts
 * - Wire values for collector: "phone_usage" | "gmail" | "manual"
 */
@Serializable
data class IngestBody(
    /** Collector type — always "phone_usage" for this app */
    val collector: String = COLLECTOR_PHONE_USAGE,
    /** Stable device identifier — ANDROID_ID, scoped by (uid, sourceId) on server */
    val sourceId: String,
    /** Human-readable device name — Build.MODEL */
    val sourceLabel: String,
    /** Human-readable app name as seen by the collector */
    val rawLabel: String,
    /** Optional category hint — not used by this collector */
    val rawCategory: String? = null,
    /** Canonical identity — the Android package name, feeds dedup matching */
    val rawIdentity: String? = null,
    /** Usage payload */
    val payload: IngestPayload,
    /**
     * Deterministic per-record key (NOT random) letting the server dedupe a
     * retried record after a partial-batch failure. See
     * UsageCollectorWorker.toIngestBody for how this is derived.
     */
    val idempotencyKey: String,
) {
    companion object {
        /** Wire value matching CollectorType.PhoneUsage = "phone_usage" in functions/src/types/enums.ts */
        const val COLLECTOR_PHONE_USAGE = "phone_usage"
    }
}

@Serializable
data class IngestPayload(
    /** Number of times the app was launched/foregrounded in this window */
    val usageCount: Int,
    /** Total foreground duration in this window, in milliseconds */
    val usageDurationMs: Long,
    /** Duration of the observation window in hours */
    val windowHours: Int,
)
