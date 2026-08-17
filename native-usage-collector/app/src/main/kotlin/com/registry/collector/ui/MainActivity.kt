package com.registry.collector.ui

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.textfield.TextInputEditText
import com.google.firebase.auth.FirebaseAuth
import com.registry.collector.R
import com.registry.collector.data.SyncPreferences
import com.registry.collector.worker.CollectorScheduler
import dagger.hilt.android.AndroidEntryPoint
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var syncPreferences: SyncPreferences

    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    // Re-check permission status when returning from Settings
    private val settingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { updateUI() }

    // -- Views --
    private lateinit var authSection: LinearLayout
    private lateinit var emailInput: TextInputEditText
    private lateinit var passwordInput: TextInputEditText
    private lateinit var signInButton: Button
    private lateinit var signedInSection: LinearLayout
    private lateinit var signedInAs: TextView
    private lateinit var signOutButton: Button
    private lateinit var permissionStatus: TextView
    private lateinit var grantPermissionButton: Button
    private lateinit var syncSection: LinearLayout
    private lateinit var lastSyncText: TextView
    private lateinit var syncNowButton: Button
    private lateinit var syncScheduledText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUI()
        updateUI()
    }

    override fun onResume() {
        super.onResume()
        updateUI()
    }

    private fun buildUI() {
        val padding = (16 * resources.displayMetrics.density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
        }

        // --- Auth Section (sign-in form) ---
        authSection = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        emailInput = TextInputEditText(this).apply { hint = "Email" }
        passwordInput = TextInputEditText(this).apply {
            hint = "Password"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        signInButton = Button(this).apply {
            text = getString(R.string.sign_in)
            setOnClickListener { signIn() }
        }
        authSection.addView(emailInput)
        authSection.addView(passwordInput)
        authSection.addView(signInButton)

        // --- Signed-in Section ---
        signedInSection = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        signedInAs = TextView(this)
        signOutButton = Button(this).apply {
            text = getString(R.string.sign_out)
            setOnClickListener { signOut() }
        }
        signedInSection.addView(signedInAs)
        signedInSection.addView(signOutButton)

        // --- Permission Section ---
        permissionStatus = TextView(this).apply {
            setPadding(0, padding, 0, 0)
        }
        grantPermissionButton = Button(this).apply {
            text = getString(R.string.grant_permission)
            setOnClickListener { openUsageAccessSettings() }
        }

        // --- Sync Section ---
        syncSection = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        lastSyncText = TextView(this).apply {
            setPadding(0, padding, 0, 0)
        }
        syncNowButton = Button(this).apply {
            text = getString(R.string.sync_now)
            setOnClickListener { triggerImmediateSync() }
        }
        syncScheduledText = TextView(this).apply {
            text = getString(R.string.sync_scheduled)
        }
        syncSection.addView(lastSyncText)
        syncSection.addView(syncNowButton)
        syncSection.addView(syncScheduledText)

        root.addView(authSection)
        root.addView(signedInSection)
        root.addView(permissionStatus)
        root.addView(grantPermissionButton)
        root.addView(syncSection)

        setContentView(root)
    }

    private fun updateUI() {
        val user = auth.currentUser
        val hasPermission = hasUsageStatsPermission()

        // Auth visibility
        authSection.visibility = if (user == null) View.VISIBLE else View.GONE
        signedInSection.visibility = if (user != null) View.VISIBLE else View.GONE
        if (user != null) {
            signedInAs.text = getString(R.string.signed_in_as, user.email ?: "unknown")
        }

        // Permission visibility
        permissionStatus.text = if (hasPermission) {
            getString(R.string.permission_granted)
        } else {
            getString(R.string.permission_denied)
        }
        grantPermissionButton.visibility = if (hasPermission) View.GONE else View.VISIBLE

        // Sync section — only show when signed in AND permission granted
        syncSection.visibility = if (user != null && hasPermission) View.VISIBLE else View.GONE
        if (user != null && hasPermission) {
            val lastSync = syncPreferences.lastSuccessfulSync
            lastSyncText.text = if (lastSync > 0) {
                val formatted = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
                    .format(Date(lastSync))
                getString(R.string.last_sync, formatted)
            } else {
                getString(R.string.last_sync_never)
            }

            // Schedule periodic worker (idempotent — KEEP policy)
            CollectorScheduler.schedule(this)
        }
    }

    private fun signIn() {
        val email = emailInput.text?.toString()?.trim() ?: return
        val password = passwordInput.text?.toString() ?: return
        if (email.isEmpty() || password.isEmpty()) return

        auth.signInWithEmailAndPassword(email, password)
            .addOnSuccessListener { updateUI() }
            .addOnFailureListener { e ->
                Toast.makeText(this, "Sign-in failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun signOut() {
        auth.signOut()
        updateUI()
    }

    private fun openUsageAccessSettings() {
        settingsLauncher.launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    private fun triggerImmediateSync() {
        CollectorScheduler.triggerImmediate(this)
        Toast.makeText(this, "Sync triggered", Toast.LENGTH_SHORT).show()
    }

    private fun hasUsageStatsPermission(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
}
