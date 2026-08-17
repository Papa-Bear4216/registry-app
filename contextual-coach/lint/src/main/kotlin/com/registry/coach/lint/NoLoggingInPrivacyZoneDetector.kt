package com.registry.coach.lint

import com.android.tools.lint.detector.api.Category
import com.android.tools.lint.detector.api.Detector
import com.android.tools.lint.detector.api.Implementation
import com.android.tools.lint.detector.api.Issue
import com.android.tools.lint.detector.api.JavaContext
import com.android.tools.lint.detector.api.Scope
import com.android.tools.lint.detector.api.Severity
import com.android.tools.lint.detector.api.SourceCodeScanner
import com.intellij.psi.PsiMethod
import org.jetbrains.uast.UCallExpression

/**
 * Zero-logging enforcement for privacy-critical code paths (spec section 10).
 *
 * Detects any logging call (Log.*, Timber.*, println, System.out)
 * within classes in the privacy-sensitive packages:
 *   - com.registry.coach.evaluator (handles screen content)
 *   - com.registry.coach.monitor  (handles accessibility events)
 *
 * Severity: ERROR (build-breaking). Not a warning.
 * This is enforced via static analysis, not manual review (spec section 10).
 */
class NoLoggingInPrivacyZoneDetector : Detector(), SourceCodeScanner {

    companion object {
        val ISSUE = Issue.create(
            id = "NoLoggingInPrivacyZone",
            briefDescription = "Logging call in privacy-sensitive code path",
            explanation = """
                The privacy-first governing rule prohibits any logging of screen
                content or accessibility-tree data, even in debug builds, even in
                crash reports. This includes Log.*, Timber.*, println(), and
                System.out calls within the evaluator and monitor packages.

                If you need to debug these code paths, use the debugger or
                breakpoints — never log the data.
            """.trimIndent(),
            category = Category.SECURITY,
            priority = 10,
            severity = Severity.ERROR,
            implementation = Implementation(
                NoLoggingInPrivacyZoneDetector::class.java,
                Scope.JAVA_FILE_SCOPE,
            ),
        )

        private val PRIVACY_ZONE_PACKAGES = setOf(
            "com.registry.coach.evaluator",
            "com.registry.coach.monitor",
        )

        private val BLOCKED_METHOD_OWNERS = setOf(
            "android.util.Log",
            "timber.log.Timber",
            "java.io.PrintStream", // System.out.println
        )

        private val BLOCKED_METHODS = setOf(
            "v", "d", "i", "w", "e", "wtf",  // Log levels
            "println", "print",                // System.out / Kotlin
            "tag",                             // Timber.tag().d()
        )
    }

    override fun getApplicableMethodNames(): List<String> =
        BLOCKED_METHODS.toList()

    override fun visitMethodCall(context: JavaContext, node: UCallExpression, method: PsiMethod) {
        val containingFile = context.file.path
        val isInPrivacyZone = PRIVACY_ZONE_PACKAGES.any { pkg ->
            containingFile.contains(pkg.replace('.', '/')) ||
                containingFile.contains(pkg.replace('.', '\\'))
        }
        if (!isInPrivacyZone) return

        val ownerClass = method.containingClass?.qualifiedName ?: return
        if (BLOCKED_METHOD_OWNERS.any { ownerClass.startsWith(it) }) {
            context.report(
                ISSUE,
                node,
                context.getLocation(node),
                "Logging is prohibited in privacy-sensitive code paths. " +
                    "Screen content and accessibility-tree data must never " +
                    "appear in logs, even in debug builds.",
            )
        }
    }
}