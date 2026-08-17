package com.registry.coach.monitor

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class AnonymousCountersTest {

    @Test
    fun `counters are not reset when the Firestore write fails`() = runTest {
        val auth = mockk<FirebaseAuth>()
        val user = mockk<FirebaseUser>()
        every { auth.currentUser } returns user
        every { user.uid } returns "test-uid"

        val db = mockk<FirebaseFirestore>()
        val collection = mockk<CollectionReference>()
        every { db.collection("coachDailyCounters") } returns collection
        val failedTask: Task<DocumentReference> = Tasks.forException(RuntimeException("network error"))
        every { collection.add(any()) } returns failedTask

        val counters = AnonymousCounters(db, auth)
        counters.incrementShown()
        counters.incrementShown()

        try {
            counters.syncDailyAggregates()
        } catch (_: Exception) {
            // expected — write failed, exception propagates past the unresolved await()
        }

        assertEquals(2, counters.shownToday)
    }

    @Test
    fun `counters are reset after a successful Firestore write`() = runTest {
        val auth = mockk<FirebaseAuth>()
        val user = mockk<FirebaseUser>()
        every { auth.currentUser } returns user
        every { user.uid } returns "test-uid"

        val db = mockk<FirebaseFirestore>()
        val collection = mockk<CollectionReference>()
        every { db.collection("coachDailyCounters") } returns collection
        val docRef = mockk<DocumentReference>()
        val successTask: Task<DocumentReference> = Tasks.forResult(docRef)
        every { collection.add(any()) } returns successTask

        val counters = AnonymousCounters(db, auth)
        counters.incrementShown()

        counters.syncDailyAggregates()

        assertEquals(0, counters.shownToday)
    }
}
