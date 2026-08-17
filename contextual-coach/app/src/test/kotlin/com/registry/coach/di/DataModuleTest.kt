package com.registry.coach.di

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.registry.coach.data.FirestoreRankingCache
import com.registry.coach.data.LocalRankingCache
import com.registry.coach.evaluator.GapEvaluator
import com.registry.coach.evaluator.GeminiNanoGapEvaluator
import io.mockk.mockk
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Confirms the concrete classes bound in DataModule actually satisfy the
 * interfaces they're @Binds-bound to. Not a full Hilt-graph integration
 * test (that requires the Android Gradle build itself, verified separately
 * via `./gradlew :app:hiltJavaCompileDebug` — see the plan) but catches a
 * mismatched @Binds signature at unit-test speed.
 */
class DataModuleTest {

    @Test
    fun `FirestoreRankingCache implements LocalRankingCache`() {
        val db = mockk<FirebaseFirestore>(relaxed = true)
        val auth = mockk<FirebaseAuth>(relaxed = true)
        val cache = FirestoreRankingCache(db, auth)
        assertTrue(cache is LocalRankingCache)
    }

    @Test
    fun `GeminiNanoGapEvaluator implements GapEvaluator`() {
        val evaluator = GeminiNanoGapEvaluator()
        assertTrue(evaluator is GapEvaluator)
    }
}
