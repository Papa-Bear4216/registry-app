package com.registry.collector.worker

import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.registry.collector.data.AppUsageRecord
import com.registry.collector.data.SyncPreferences
import com.registry.collector.data.UsageStatsReader
import com.registry.collector.network.IngestApiException
import com.registry.collector.network.IngestApiService
import com.registry.collector.network.IngestBody
import com.registry.collector.network.IngestPayload
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.tasks.await

/**
 * Periodic WorkManager worker that:
 * 1. Reads UsageStatsManager data since last successful sync
 * 2. Transforms each app's usage into an IngestBody
 * 3. POSTs each to the /ingest Cloud Function
 * 4. Updates lastSuccessfulSync on success
 *
 * Runs every 6 hours via [CollectorScheduler].
 *
 * Failure behavior (Phase 2 spec §6): a failed POST does not trigger
 * aggressive retry — UsageStatsManager data persists on-device regardless,
 * so the next cycle picks up everything since lastSuccessfulSync.
 */
@HiltWorker
class UsageCollectorWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val usageStatsReader: UsageStatsReader,
    private val syncPreferences: SyncPreferences,
    private val ingestApiService: IngestApiService,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        // 1. Verify Firebase Auth — must be signed in
        val user = FirebaseAuth.getInstance().currentUser ?: return Result.failure()

        // 2. Get fresh ID token
        val idToken = try {
            user.getIdToken(false).await().token ?: return Result.failure()
        } catch (e: Exception) {
            return Result.retry()
        }

        // 3. Determine sync window. If a prior attempt for this window failed
        // partway through, reuse its already-persisted start instead of
        // recomputing from `now` — otherwise a retry after a partial-batch
        // failure derives a different idempotencyKey per record and
        // defeats the dedup this fixes (see SyncPreferences.pendingSyncWindowStart).
        val now = System.currentTimeMillis()
        val sinceTimestamp = syncPreferences.pendingSyncWindowStart ?: run {
            val computed = syncPreferences.lastSuccessfulSync.let { last ->
                if (last > 0) last else now - DEFAULT_WINDOW_MS
            }
            syncPreferences.setPendingSyncWindowStart(computed)
            computed
        }

        // 4. Read usage data
        val records = usageStatsReader.readUsageSince(sinceTimestamp, now)
        if (records.isEmpty()) {
            // No usage data — still mark sync as successful (nothing to report)
            syncPreferences.markSyncSuccess(now)
            return Result.success()
        }

        // 5. POST each record to /ingest
        val sourceId = getStableDeviceId()
        val sourceLabel = Build.MODEL

        try {
            for (record in records) {
                val body = record.toIngestBody(sourceId, sourceLabel, sinceTimestamp)
                ingestApiService.postObservation(idToken, body)
            }
        } catch (e: IngestApiException) {
            // 4xx errors (bad payload) — don't retry with same data, it won't help
            if (e.statusCode in 400..499) return Result.failure()
            // 5xx — server error, retry is reasonable
            return Result.retry()
        } catch (e: Exception) {
            // Network failure — retry (WorkManager handles exponential backoff)
            return Result.retry()
        }

        // 6. All POSTs succeeded — mark sync
        syncPreferences.markSyncSuccess(now)
        return Result.success()
    }

    /**
     * Stable per-device identifier. ANDROID_ID is stable per app-signing-key
     * per device — correct for this use case since the server scopes
     * deviceSources by (uid, sourceId).
     */
    @Suppress("HardwareIds")
    private fun getStableDeviceId(): String {
        return Settings.Secure.getString(
            applicationContext.contentResolver,
            Settings.Secure.ANDROID_ID,
        ) ?: "unknown_device"
    }

    companion object {
        /** Default first-run window: 6 hours back from now */
        private const val DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000L
    }
}

/**
 * Maps an [AppUsageRecord] to the exact [IngestBody] shape expected by
 * functions/src/ingest/ingest.ts.
 *
 * idempotencyKey is derived deterministically from (sourceId, packageName,
 * sinceTimestamp) — NOT a random UUID — so that retrying the same sync
 * window after a partial-batch failure produces the same key on the server,
 * letting handleIngest recognize and skip an already-written duplicate.
 * `internal` (not `private`) so UsageCollectorWorkerTest exercises this
 * exact function rather than a separately-maintained test-local copy.
 */
internal fun AppUsageRecord.toIngestBody(sourceId: String, sourceLabel: String, sinceTimestamp: Long): IngestBody {
    return IngestBody(
        collector = IngestBody.COLLECTOR_PHONE_USAGE,
        sourceId = sourceId,
        sourceLabel = sourceLabel,
        rawLabel = appLabel,
        rawCategory = null, // Phone usage collector doesn't provide category hints
        rawIdentity = packageName, // Package name → canonicalIdentity for dedup matching
        payload = IngestPayload(
            usageCount = launchCount,
            usageDurationMs = totalTimeInForegroundMs,
            windowHours = windowHours,
        ),
        idempotencyKey = "$sourceId:$packageName:$sinceTimestamp",
    )
}
