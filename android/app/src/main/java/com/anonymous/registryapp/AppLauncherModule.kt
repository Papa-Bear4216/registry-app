package com.anonymous.registryapp

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppLauncherModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppLauncher"

  @ReactMethod
  fun launchApp(packageName: String, promise: Promise) {
    try {
      val pm = reactContext.packageManager
      var intent = pm.getLaunchIntentForPackage(packageName)
      if (intent == null) {
        when (packageName) {
          "com.samsung.android.dialer", "com.google.android.dialer", "dialer" -> {
            intent = Intent(Intent.ACTION_DIAL)
          }
          "com.sec.android.daemonapp" -> {
            intent = Intent().apply {
              setClassName("com.sec.android.daemonapp", "com.samsung.android.weather.app.AppLauncherActivity")
            }
          }
          "com.samsung.android.app.notes" -> {
            intent = Intent().apply {
              setClassName("com.samsung.android.app.notes", "com.samsung.android.app.notes.memolist.MemoListActivity")
            }
          }
          "com.registry.coach" -> {
            intent = Intent().apply {
              setClassName("com.registry.coach", "com.registry.coach.ui.ConsentDisclosureActivity")
            }
          }
          "com.registry.usagecollector" -> {
            intent = Intent().apply {
              setClassName("com.registry.usagecollector", "com.registry.collector.ui.MainActivity")
            }
          }
          "com.google.android.apps.bard" -> {
            intent = pm.getLaunchIntentForPackage("com.google.android.apps.bard")
          }
          else -> {
            try {
              val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
                `package` = packageName
              }
              val matches = pm.queryIntentActivities(mainIntent, 0)
              if (matches.isNotEmpty()) {
                val resolveInfo = matches[0]
                intent = Intent(Intent.ACTION_MAIN).apply {
                  addCategory(Intent.CATEGORY_LAUNCHER)
                  setClassName(resolveInfo.activityInfo.packageName, resolveInfo.activityInfo.name)
                }
              } else {
                val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
                  addCategory(Intent.CATEGORY_LAUNCHER)
                }
                val allApps = pm.queryIntentActivities(launcherIntent, 0)
                val cleaned = packageName.trim().lowercase()

                var candidate = allApps.firstOrNull {
                  it.loadLabel(pm).toString().trim().lowercase() == cleaned
                }
                if (candidate == null) {
                  candidate = allApps.firstOrNull {
                    val pkg = it.activityInfo.packageName.lowercase()
                    pkg.endsWith(".$cleaned") || pkg.contains(".$cleaned.") || pkg.contains(cleaned)
                  }
                }
                if (candidate == null) {
                  candidate = allApps.firstOrNull {
                    it.loadLabel(pm).toString().trim().lowercase().contains(cleaned)
                  }
                }

                if (candidate != null) {
                  intent = pm.getLaunchIntentForPackage(candidate.activityInfo.packageName)
                  if (intent == null) {
                    intent = Intent(Intent.ACTION_MAIN).apply {
                      addCategory(Intent.CATEGORY_LAUNCHER)
                      setClassName(candidate.activityInfo.packageName, candidate.activityInfo.name)
                    }
                  }
                }
              }
            } catch (_: Exception) {}
          }
        }
      }

      if (intent != null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
        promise.resolve(true)
      } else {
        promise.resolve(false)
      }
    } catch (e: Exception) {
      promise.reject("LAUNCH_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isAppInstalled(packageName: String, promise: Promise) {
    try {
      reactContext.packageManager.getPackageInfo(packageName, 0)
      promise.resolve(true)
    } catch (e: Exception) {
      val pm = reactContext.packageManager
      val cleaned = packageName.trim().lowercase()
      try {
        val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
          addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val allApps = pm.queryIntentActivities(launcherIntent, 0)
        val exists = allApps.any {
          val pkg = it.activityInfo.packageName.lowercase()
          val label = it.loadLabel(pm).toString().trim().lowercase()
          pkg == cleaned || label == cleaned || pkg.contains(cleaned) || label.contains(cleaned)
        }
        promise.resolve(exists)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }
}
