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
    private val itemsById = mutableMapOf<String, CachedRegistryItem>()

    private var rankingListener: ListenerRegistration? = null
    private var itemListener: ListenerRegistration? = null

    /** Start listening for Firestore changes. Call once after auth. */
    fun startListening() {
        val uid = auth.currentUser?.uid ?: return

        rankingListener = db.collection("taskRankings")
            .whereEqualTo("createdBy", uid)
            .addSnapshotListener { snapshot, _ ->
                snapshot ?: return@addSnapshotListener
                rankings.clear()
                for (doc in snapshot.documents) {
                    val category = TaskCategory.fromWire(
                        doc.getString("taskCategory") ?: continue
                    ) ?: continue
                    val orderedItems = doc.get("orderedItems") as? List<*> ?: continue
                    val orderedIds = orderedItems.filterIsInstance<String>()
                    val bestId = orderedIds.firstOrNull() ?: continue
                    val bestName = itemsById[bestId]?.name ?: bestId

                    rankings[category] = CachedTaskRanking(
                        taskCategory = category,
                        orderedItemIds = orderedIds,
                        bestItemId = bestId,
                        bestItemName = bestName,
                    )
                }
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
            }
    }

    fun stopListening() {
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