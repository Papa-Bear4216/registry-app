package com.registry.collector.worker

import android.app.AppOpsManager
import android.content.Context
import android.os.Build
import android.os.Process
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.auth.FirebaseAuth
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
     * Cancel the periodic sync.
     * Called when auth or usage stats permission is lost.
     */
    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
    }

    /**
     * Checks if the app currently holds the PACKAGE_USAGE_STATS permission.
     */
    fun hasUsageStatsPermission(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Periodic sync is ready only when user is authenticated and usage stats permission is granted.
     */
    fun isSyncReady(context: Context): Boolean {
        return FirebaseAuth.getInstance().currentUser != null && hasUsageStatsPermission(context)
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
