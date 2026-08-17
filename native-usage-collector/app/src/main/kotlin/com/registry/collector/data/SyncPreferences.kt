package com.registry.collector.data

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tracks the timestamp of the last successful sync to /ingest.
 *
 * Stored locally in SharedPreferences — never synced to Firestore (Phase 2 spec §6).
 * UsageStatsManager data persists on-device regardless, so on failure the next
 * sync cycle simply picks up everything since this timestamp.
 */
@Singleton
class SyncPreferences @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * Epoch millis of the last successful /ingest POST.
     * Returns 0 if never synced (first run will default to now - 6h).
     */
    var lastSuccessfulSync: Long
        get() = prefs.getLong(KEY_LAST_SYNC, 0L)
        private set(value) = prefs.edit().putLong(KEY_LAST_SYNC, value).apply()

    /**
     * Mark a successful sync at the given timestamp. Also clears
     * [pendingSyncWindowStart], since the window that timestamp covers is
     * now fully synced and no longer "pending."
     * Should only be called after ALL observations for a window have been
     * successfully POSTed to /ingest.
     */
    fun markSyncSuccess(timestamp: Long) {
        lastSuccessfulSync = timestamp
        prefs.edit().remove(KEY_PENDING_WINDOW_START).apply()
    }

    /**
     * Window start (epoch millis) for a sync attempt currently in progress,
     * if one was persisted by [setPendingSyncWindowStart] and not yet
     * cleared by a successful [markSyncSuccess]. Null if no attempt is
     * in progress (first call, or the previous attempt fully succeeded).
     *
     * Exists so a WorkManager retry after a partial-batch failure reuses
     * the SAME window start instead of recomputing "now - 6h" against a
     * later `now` — without this, each retry produces a different
     * idempotencyKey for records already POSTed, defeating dedup.
     */
    var pendingSyncWindowStart: Long?
        get() = prefs.getLong(KEY_PENDING_WINDOW_START, -1L).takeIf { it >= 0 }
        private set(value) {
            if (value == null) {
                prefs.edit().remove(KEY_PENDING_WINDOW_START).apply()
            } else {
                prefs.edit().putLong(KEY_PENDING_WINDOW_START, value).apply()
            }
        }

    /** Persist the window start for the sync attempt about to begin. */
    fun setPendingSyncWindowStart(timestamp: Long) {
        pendingSyncWindowStart = timestamp
    }

    companion object {
        private const val PREFS_NAME = "usage_collector_sync"
        private const val KEY_LAST_SYNC = "last_successful_sync_ms"
        private const val KEY_PENDING_WINDOW_START = "pending_sync_window_start_ms"
    }
}
