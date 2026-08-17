package com.registry.coach.monitor

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.registry.coach.evaluator.GeminiNanoGapEvaluator

/**
 * Tracks foreground app dwell time. Fires callback only after
 * the configured threshold (default 10s per spec section 3).
 * Resets on every app switch — if user opens and leaves an app
 * within the threshold, no tree read occurs.
 */
class DwellTimer {

    private var pendingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    /**
     * Start a dwell timer for [packageName]. Cancels any pending timer
     * from a previous app switch. Fires [onThresholdReached] after the
     * configured dwell threshold.
     */
    fun start(packageName: String, onThresholdReached: () -> Unit) {
        pendingJob?.cancel()
        pendingJob = scope.launch {
            delay(GeminiNanoGapEvaluator.DWELL_THRESHOLD_SECONDS * 1000L)
            onThresholdReached()
        }
    }

    /** Cancel any pending dwell timer. */
    fun cancel() {
        pendingJob?.cancel()
        pendingJob = null
    }
}