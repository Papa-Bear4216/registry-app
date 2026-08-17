package com.registry.coach.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firestore-backed implementation of [LocalRankingCache].
 *
 * Uses snapshot listeners on taskRankings and registryItems collections
 * scoped to the authenticated user. In-memory cache refreshed on snapshot
 * change — no local persistence layer needed (data volume is small).
 *
 * Reads the same Firestore data written by Phase 2's aiRank Cloud Function
 * (functions/src/ai/aiRank.ts). Document shape:
 *   taskCategory: string, orderedItems: string[], lastRankedAt: string,
 *   manuallyOverridden: boolean, overrideNote: string?, createdBy: string
 */
@Singleton
class FirestoreRankingCache @Inject constructor(
    private val db: FirebaseFirestore,
    private val auth: FirebaseAuth,
) : LocalRankingCache {

    // In-memory caches
    private val rankings = mutableMapOf<TaskCategory, CachedTaskRanking>()
    private val itemsByCanonical = mutableMapOf<String, CachedRegistryItem>()
    internal val itemsById = mutableMapOf<String, CachedRegistryItem>()

    // Raw ranking data from Firestore, kept separately from `rankings` so
    // bestItemName can be recomputed whenever itemsById changes, without
    // needing a fresh Firestore snapshot.
    internal data class RawRanking(val orderedIds: List<String>, val bestId: String)
    internal val rawRankings = mutableMapOf<TaskCategory, RawRanking>()

    private var rankingListener: ListenerRegistration? = null
    private var itemListener: ListenerRegistration? = null

    /** Start listening for Firestore changes. Call once after auth. */
    override fun startListening() {
        val uid = auth.currentUser?.uid ?: return

        rankingListener = db.collection("taskRankings")
            .whereEqualTo("createdBy", uid)
            .addSnapshotListener { snapshot, _ ->
                snapshot ?: return@addSnapshotListener
                rawRankings.clear()
                for (doc in snapshot.documents) {
                    val category = TaskCategory.fromWire(
                        doc.getString("taskCategory") ?: continue
                    ) ?: continue
                    val orderedItems = doc.get("orderedItems") as? List<*> ?: continue
                    val orderedIds = orderedItems.filterIsInstance<String>()
                    val bestId = orderedIds.firstOrNull() ?: continue
                    rawRankings[category] = RawRanking(orderedIds, bestId)
                }
                rebuildRankings()
            }

        itemListener = db.collection("registryItems")
            .whereEqualTo("createdBy", uid)
            .addSnapshotListener { snapshot, _ ->
                snapshot ?: return@addSnapshotListener
                itemsByCanonical.clear()
                itemsById.clear()
                for (doc in snapshot.documents) {
                    val categories = (doc.get("taskCategories") as? List<*>)
                        ?.filterIsInstance<String>()
                        ?.mapNotNull { TaskCategory.fromWire(it) }
                        ?: emptyList()

                    val item = CachedRegistryItem(
                        id = doc.id,
                        name = doc.getString("name") ?: doc.id,
                        canonicalIdentity = doc.getString("canonicalIdentity"),
                        taskCategories = categories,
                        isBestForTask = doc.getBoolean("isBestForTask") ?: false,
                    )
                    itemsById[doc.id] = item
                    item.canonicalIdentity?.let { itemsByCanonical[it] = item }
                }
                rebuildRankings()
            }
    }

    /**
     * Recompute `rankings` (with resolved bestItemName) from the current
     * `rawRankings` + `itemsById` state. Called after EITHER listener fires,
     * so name resolution never depends on listener firing order — whichever
     * snapshot arrives first produces a best-effort id-as-name fallback,
     * and the next snapshot (from either collection) corrects it.
     */
    internal fun rebuildRankings() {
        rankings.clear()
        for ((category, raw) in rawRankings) {
            val bestName = itemsById[raw.bestId]?.name ?: raw.bestId
            rankings[category] = CachedTaskRanking(
                taskCategory = category,
                orderedItemIds = raw.orderedIds,
                bestItemId = raw.bestId,
                bestItemName = bestName,
            )
        }
    }

    override fun stopListening() {
        rankingListener?.remove()
        itemListener?.remove()
    }

    override fun getRanking(category: TaskCategory): CachedTaskRanking? =
        rankings[category]

    override fun getTaskCategories(canonicalIdentity: String): List<TaskCategory> =
        itemsByCanonical[canonicalIdentity]?.taskCategories ?: emptyList()

    override fun hasPlausibleGap(packageName: String): Boolean {
        val item = itemsByCanonical[packageName] ?: return false
        // A plausible gap exists if this item is NOT the best for ANY of its categories
        return item.taskCategories.any { category ->
            val ranking = rankings[category] ?: return@any false
            ranking.bestItemId != item.id
        }
    }
}