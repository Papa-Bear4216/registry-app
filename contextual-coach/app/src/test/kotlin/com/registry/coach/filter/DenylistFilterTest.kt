package com.registry.coach.filter

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DenylistFilterTest {

    private lateinit var filter: DenylistFilter

    private val testDenylist = setOf(
        "com.chase.sig.android",
        "com.onepassword.android",
        "com.google.android.apps.healthdata",
        "com.google.android.apps.authenticator2",
        "com.android.managedprovisioning",
    )

    private val testSystemPackages = setOf(
        "com.android.settings",
        "com.google.android.apps.nexuslauncher",
    )

    @Before
    fun setUp() {
        filter = DenylistFilter(testDenylist)
    }

    @Test
    fun bankingAppIsBlocked() {
        assertTrue(filter.isBlocked("com.chase.sig.android"))
    }

    @Test
    fun passwordManagerIsBlocked() {
        assertTrue(filter.isBlocked("com.onepassword.android"))
    }

    @Test
    fun healthAppIsBlocked() {
        assertTrue(filter.isBlocked("com.google.android.apps.healthdata"))
    }

    @Test
    fun authenticatorIsBlocked() {
        assertTrue(filter.isBlocked("com.google.android.apps.authenticator2"))
    }

    @Test
    fun enterpriseMdmIsBlocked() {
        assertTrue(filter.isBlocked("com.android.managedprovisioning"))
    }

    @Test
    fun nonSensitiveAppIsAllowed() {
        assertFalse(filter.isBlocked("com.slack"))
    }

    @Test
    fun emptyStringIsNotBlocked() {
        assertFalse(filter.isBlocked(""))
    }

    @Test
    fun wrongCaseIsNotBlocked() {
        // Package names are case-sensitive on Android
        assertFalse(filter.isBlocked("com.Chase.Sig.Android"))
    }

    @Test
    fun settingsIsSystemApp() {
        assertTrue(filter.isSystemApp("com.android.settings", testSystemPackages))
    }

    @Test
    fun launcherIsSystemAppViaPrefix() {
        assertTrue(filter.isSystemApp("com.android.launcher3", testSystemPackages))
    }

    @Test
    fun dialerIsSystemApp() {
        assertTrue(filter.isSystemApp("com.google.android.dialer", emptySet()))
    }

    @Test
    fun cameraIsSystemApp() {
        assertTrue(filter.isSystemApp("com.google.android.camera", emptySet()))
    }

    @Test
    fun inputMethodIsSystemApp() {
        assertTrue(filter.isSystemApp("com.google.android.inputmethod.latin", emptySet()))
    }

    @Test
    fun slackIsNotSystemApp() {
        assertFalse(filter.isSystemApp("com.slack", emptySet()))
    }
}