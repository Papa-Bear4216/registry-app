package com.registry.collector.data

/**
 * Represents a single app's usage data for a time window.
 * One of these is produced per app that had non-zero usage since the last sync.
 */
data class AppUsageRecord(
    /** Android package name, e.g. "com.slack" — maps to rawIdentity in IngestBody */
    val packageName: String,
    /** Human-readable app label, e.g. "Slack" — maps to rawLabel in IngestBody */
    val appLabel: String,
    /** Total foreground time in this window, in milliseconds */
    val totalTimeInForegroundMs: Long,
    /** Number of times the app was launched/moved to foreground in this window */
    val launchCount: Int,
    /** Start of the observation window, epoch millis */
    val windowStartMs: Long,
    /** End of the observation window, epoch millis */
    val windowEndMs: Long,
) {
    /** Window duration in hours, rounded to nearest integer (for IngestBody.payload.windowHours) */
    val windowHours: Int
        get() = ((windowEndMs - windowStartMs) / 3_600_000L).toInt().coerceAtLeast(1)
}
