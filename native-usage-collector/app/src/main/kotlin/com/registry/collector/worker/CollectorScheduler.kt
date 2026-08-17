package com.registry.collector.worker

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Schedules the periodic UsageCollectorWorker.
 *
 * - 6-hour interval with 30-minute flex (Phase 2 spec §6)
 * - Requires network connectivity (no point posting without it)
 * - KEEP policy: idempotent — safe to call on every app launch
 * - Exponential backoff on retry (15-minute base)
 */
object CollectorScheduler {

    private const val UNIQUE_WORK_NAME = "usage_collector_periodic"

    /**
     * Enqueue the periodic 6-hour sync.
     * Uses [ExistingPeriodicWorkPolicy.KEEP] — if already scheduled, does nothing.
     */
    fun schedule(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<UsageCollectorWorker>(
            repeatInterval = 6,
            repeatIntervalTimeUnit = TimeUnit.HOURS,
            flexTimeInterval = 30,
            flexTimeIntervalUnit = TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /**
     * Trigger an immediate one-time sync (for the manual "Sync Now" button).
     * This runs independently of the periodic schedule.
     */
    fun triggerImmediate(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<UsageCollectorWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueue(request)
    }
}
