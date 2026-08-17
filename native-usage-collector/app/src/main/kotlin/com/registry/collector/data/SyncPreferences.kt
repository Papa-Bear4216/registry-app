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
     * Mark a successful sync at the given timestamp.
     * Should only be called after ALL observations for a window have been
     * successfully POSTed to /ingest.
     */
    fun markSyncSuccess(timestamp: Long) {
        lastSuccessfulSync = timestamp
    }

    companion object {
        private const val PREFS_NAME = "usage_collector_sync"
        private const val KEY_LAST_SYNC = "last_successful_sync_ms"
    }
}
