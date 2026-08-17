package com.registry.coach.lint

import com.android.tools.lint.client.api.IssueRegistry
import com.android.tools.lint.client.api.Vendor
import com.android.tools.lint.detector.api.CURRENT_API
import com.android.tools.lint.detector.api.Issue

class LintRegistry : IssueRegistry() {
    override val issues: List<Issue> = listOf(
        NoLoggingInPrivacyZoneDetector.ISSUE
    )

    override val api: Int = CURRENT_API

    override val vendor: Vendor = Vendor(
        vendorName = "Registry Coach",
        feedbackUrl = "",
        contact = "",
    )
}