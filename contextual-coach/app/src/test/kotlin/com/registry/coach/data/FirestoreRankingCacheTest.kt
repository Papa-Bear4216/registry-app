package com.registry.coach.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Test

class FirestoreRankingCacheTest {

    @Test
    fun `bestItemName resolves to id when items have not loaded yet`() {
        val db = mockk<FirebaseFirestore>(relaxed = true)
        val auth = mockk<FirebaseAuth>(relaxed = true)
        val cache = FirestoreRankingCache(db, auth)

        cache.rawRankings[TaskCategory.Productivity] =
            FirestoreRankingCache.RawRanking(listOf("item-1", "item-2"), "item-1")
        cache.rebuildRankings()

        val ranking = cache.getRanking(TaskCategory.Productivity)
        assertEquals("item-1", ranking?.bestItemName) // no item loaded yet -> id fallback
    }

    @Test
    fun `bestItemName resolves to the real name once items load, even if ranking listener fired first`() {
        val db = mockk<FirebaseFirestore>(relaxed = true)
        val auth = mockk<FirebaseAuth>(relaxed = true)
        val cache = FirestoreRankingCache(db, auth)

        // Ranking snapshot fires first (cold start ordering)
        cache.rawRankings[TaskCategory.Productivity] =
            FirestoreRankingCache.RawRanking(listOf("item-1"), "item-1")
        cache.rebuildRankings()
        assertEquals("item-1", cache.getRanking(TaskCategory.Productivity)?.bestItemName)

        // Item snapshot arrives afterward
        cache.itemsById["item-1"] = CachedRegistryItem(
            id = "item-1",
            name = "Todoist",
            canonicalIdentity = "com.todoist",
            taskCategories = listOf(TaskCategory.Productivity),
            isBestForTask = true,
        )
        cache.rebuildRankings()

        assertEquals("Todoist", cache.getRanking(TaskCategory.Productivity)?.bestItemName)
    }
}
