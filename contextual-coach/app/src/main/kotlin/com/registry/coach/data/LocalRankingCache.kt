package com.registry.coach.data

/**
 * Read-only local mirror of synced RegistryItem/TaskRanking data.
 * Spec section 9.3 — no write path originates from Phase 3.
 *
 * This component is structurally incapable of seeing screen content
 * since it never crosses its interface boundary (spec section 9).
 */
interface LocalRankingCache {
    /** Cached rankings for a task category. Null if no ranking data exists yet. */
    fun getRanking(category: TaskCategory): CachedTaskRanking?

    /** Task categories tagged on a registry item by its canonical identity (package name). */
    fun getTaskCategories(canonicalIdentity: String): List<TaskCategory>

    /**
     * Quick pre-filter check: does a plausible gap exist for any category
     * this package maps to? Used by the pre-filter pipeline — cheap, no AI,
     * no tree read. Returns false if the package is not in the registry at all.
     */
    fun hasPlausibleGap(packageName: String): Boolean

    /** Begin syncing from Firestore. Must be called once, after auth is available. */
    fun startListening()

    /** Stop syncing and release listener resources. */
    fun stopListening()
}

data class CachedTaskRanking(
    val taskCategory: TaskCategory,
    val orderedItemIds: List<String>,
    val bestItemId: String,
    val bestItemName: String,
)

data class CachedRegistryItem(
    val id: String,
    val name: String,
    val canonicalIdentity: String?,
    val taskCategories: List<TaskCategory>,
    val isBestForTask: Boolean,
)