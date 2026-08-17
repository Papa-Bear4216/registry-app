package com.registry.coach.monitor

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.registry.coach.data.TaskCategory
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Anonymized usage counters (spec section 5).
 *
 * Local accumulators synced to Firestore as daily aggregates ONLY.
 * What syncs: bubbleShownCount, bubbleExpandedCount, bubbleActedOnCount, date, uid.
 * What NEVER syncs: app names, task categories, timestamps paired with content,
 * per-event records — counters only (spec section 5).
 */
@Singleton
class AnonymousCounters @Inject constructor(
    private val db: FirebaseFirestore,
    private val auth: FirebaseAuth,
) {
    internal var shownToday = 0
    internal var expandedToday = 0
    internal var actedOnToday = 0
    internal var suppressedToday = 0

    // Per-category session time tracking for usage-awareness fact text
    private val sessionMinutes = mutableMapOf<TaskCategory, Int>()
    private var lastCategoryUpdateMs = System.currentTimeMillis()

    fun incrementShown() { shownToday++ }
    fun incrementExpanded() { expandedToday++ }
    fun incrementActedOn() { actedOnToday++ }
    fun incrementSuppressed() { suppressedToday++ }

    /** Track time spent in a task category for the usage-fact text. */
    fun updateCategoryTime(category: TaskCategory) {
        val now = System.currentTimeMillis()
        val elapsed = ((now - lastCategoryUpdateMs) / 60_000).toInt()
        if (elapsed > 0) {
            sessionMinutes[category] = (sessionMinutes[category] ?: 0) + elapsed
        }
        lastCategoryUpdateMs = now
    }

    fun getSessionMinutes(category: TaskCategory): Int =
        sessionMinutes[category] ?: 0

    /**
     * Sync daily aggregates to Firestore. Called once per day.
     * Writes ONLY: { bubbleShownCount, bubbleExpandedCount, bubbleActedOnCount, date, createdBy }
     * NO app names, NO task categories, NO per-event timestamps (spec section 5).
     */
    suspend fun syncDailyAggregates() {
        val uid = auth.currentUser?.uid ?: return
        val today = java.time.LocalDate.now().toString()

        db.collection("coachDailyCounters").add(
            mapOf(
                "bubbleShownCount" to shownToday,
                "bubbleExpandedCount" to expandedToday,
                "bubbleActedOnCount" to actedOnToday,
                "date" to today,
                "createdBy" to uid,
            )
        ).await()

        // Reset only after the write is confirmed committed — an unawaited
        // reset here would silently drop the day's counts if the write
        // failed or was still in flight (spec section 5: these counters
        // are the ONLY record kept, so losing them is unrecoverable).
        shownToday = 0
        expandedToday = 0
        actedOnToday = 0
        suppressedToday = 0
    }
}