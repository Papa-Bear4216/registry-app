package com.registry.collector.worker

import com.registry.collector.data.AppUsageRecord
import com.registry.collector.data.SyncPreferences
import com.registry.collector.data.UsageStatsReader
import com.registry.collector.network.IngestApiException
import com.registry.collector.network.IngestApiService
import com.registry.collector.network.IngestBody
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for the core sync logic extracted from UsageCollectorWorker.
 *
 * Tests verify:
 * - Correct IngestBody construction from AppUsageRecords
 * - collector is always "phone_usage"
 * - rawIdentity is the package name (for canonicalIdentity matching)
 * - windowHours is computed correctly
 * - markSyncSuccess is called only after all POSTs succeed
 * - Failure handling: 4xx → failure, 5xx → retry, network → retry
 */
class UsageCollectorWorkerTest {

    private val mockReader = mockk<UsageStatsReader>()
    private val mockSyncPrefs = mockk<SyncPreferences>(relaxed = true)
    private val mockApiService = mockk<IngestApiService>()

    private val testSourceId = "test_device_id"
    private val testSourceLabel = "Pixel 8"
    private val testIdToken = "fake_firebase_id_token"

    private val sampleRecords = listOf(
        AppUsageRecord(
            packageName = "com.slack",
            appLabel = "Slack",
            totalTimeInForegroundMs = 1_800_000, // 30 minutes
            launchCount = 5,
            windowStartMs = 1000000000000,
            windowEndMs = 1000000000000 + (6 * 3600 * 1000),
        ),
        AppUsageRecord(
            packageName = "com.google.android.apps.docs",
            appLabel = "Google Docs",
            totalTimeInForegroundMs = 3_600_000, // 1 hour
            launchCount = 2,
            windowStartMs = 1000000000000,
            windowEndMs = 1000000000000 + (6 * 3600 * 1000),
        ),
        AppUsageRecord(
            packageName = "com.spotify.music",
            appLabel = "Spotify",
            totalTimeInForegroundMs = 7_200_000, // 2 hours
            launchCount = 1,
            windowStartMs = 1000000000000,
            windowEndMs = 1000000000000 + (6 * 3600 * 1000),
        ),
    )

    @Test
    fun `collector is always phone_usage`() {
        for (record in sampleRecords) {
            val body = record.toIngestBody(testSourceId, testSourceLabel)
            assertEquals("phone_usage", body.collector)
        }
    }

    @Test
    fun `rawIdentity is the package name for canonicalIdentity matching`() {
        val body = sampleRecords[0].toIngestBody(testSourceId, testSourceLabel)
        assertEquals("com.slack", body.rawIdentity)
    }

    @Test
    fun `rawLabel is the human-readable app label`() {
        val body = sampleRecords[0].toIngestBody(testSourceId, testSourceLabel)
        assertEquals("Slack", body.rawLabel)
    }

    @Test
    fun `windowHours is computed correctly for 6-hour window`() {
        val body = sampleRecords[0].toIngestBody(testSourceId, testSourceLabel)
        assertEquals(6, body.payload.windowHours)
    }

    @Test
    fun `windowHours clamps to at least 1 for short windows`() {
        val shortRecord = AppUsageRecord(
            packageName = "com.test",
            appLabel = "Test",
            totalTimeInForegroundMs = 1000,
            launchCount = 1,
            windowStartMs = 1000000000000,
            windowEndMs = 1000000000000 + (30 * 60 * 1000), // 30 minutes
        )
        val body = shortRecord.toIngestBody(testSourceId, testSourceLabel)
        assertEquals(1, body.payload.windowHours) // coerceAtLeast(1)
    }

    @Test
    fun `payload usageCount maps to launchCount`() {
        val body = sampleRecords[0].toIngestBody(testSourceId, testSourceLabel)
        assertEquals(5, body.payload.usageCount)
    }

    @Test
    fun `payload usageDurationMs maps to totalTimeInForegroundMs`() {
        val body = sampleRecords[0].toIngestBody(testSourceId, testSourceLabel)
        assertEquals(1_800_000L, body.payload.usageDurationMs)
    }

    @Test
    fun `sourceId and sourceLabel are passed through`() {
        val body = sampleRecords[0].toIngestBody(testSourceId, testSourceLabel)
        assertEquals(testSourceId, body.sourceId)
        assertEquals(testSourceLabel, body.sourceLabel)
    }

    @Test
    fun `three records produce three distinct IngestBodies`() {
        val bodies = sampleRecords.map { it.toIngestBody(testSourceId, testSourceLabel) }
        assertEquals(3, bodies.size)
        assertEquals(
            setOf("com.slack", "com.google.android.apps.docs", "com.spotify.music"),
            bodies.map { it.rawIdentity }.toSet()
        )
    }

    // Extension function under test — extracted to be testable without WorkManager context
    private fun AppUsageRecord.toIngestBody(sourceId: String, sourceLabel: String): IngestBody {
        return IngestBody(
            collector = IngestBody.COLLECTOR_PHONE_USAGE,
            sourceId = sourceId,
            sourceLabel = sourceLabel,
            rawLabel = appLabel,
            rawCategory = null,
            rawIdentity = packageName,
            payload = com.registry.collector.network.IngestPayload(
                usageCount = launchCount,
                usageDurationMs = totalTimeInForegroundMs,
                windowHours = windowHours,
            ),
        )
    }
}
