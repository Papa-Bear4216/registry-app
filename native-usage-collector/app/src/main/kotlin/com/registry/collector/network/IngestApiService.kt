package com.registry.collector.network

import com.registry.collector.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * HTTP client for POSTing observations to the /ingest Cloud Function.
 *
 * Auth: Firebase ID token in Authorization: Bearer header,
 * verified server-side by functions/src/lib/auth.ts → extracts uid.
 */
@Singleton
class IngestApiService @Inject constructor() {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    /**
     * POST a single observation to /ingest.
     *
     * @param idToken Fresh Firebase Auth ID token
     * @param body The IngestBody payload
     * @throws IOException on network failure
     * @throws IngestApiException on 4xx/5xx server response
     */
    suspend fun postObservation(idToken: String, body: IngestBody) {
        withContext(Dispatchers.IO) {
            val jsonBody = json.encodeToString(body)
            val request = Request.Builder()
                .url("${BuildConfig.INGEST_BASE_URL}/ingest")
                .addHeader("Authorization", "Bearer $idToken")
                .addHeader("Content-Type", "application/json")
                .post(jsonBody.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                val errorBody = response.body?.string() ?: "Unknown error"
                throw IngestApiException(
                    statusCode = response.code,
                    message = "POST /ingest failed (${response.code}): $errorBody"
                )
            }
        }
    }
}

class IngestApiException(
    val statusCode: Int,
    message: String,
) : Exception(message)
