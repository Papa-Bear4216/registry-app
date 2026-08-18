# Contributing

## The SecondGuess app suite

This repo builds three separate, independently installable apps that share one
Firebase backend (project `registry-app-prod-7a07c`):

| App | Location | Role |
|---|---|---|
| **SecondGuess** | repo root (React Native/Expo) | Primary UI — manage your registry |
| **contextual-coach** | `contextual-coach/` (native Android) | On-device gap-nudge coach (Gemini Nano) |
| **native-usage-collector** | `native-usage-collector/` (native Android) | Background app-usage collector, feeds the other two |

They don't call each other directly or share a process — each is its own APK,
coordinating only through Firestore/Cloud Functions:
`native-usage-collector` → Cloud Functions (`aiClassify`/`aiRank`) → Firestore ←
read by both `contextual-coach` and SecondGuess.

## First-time setup

This repo has three sub-projects, and all three need Firebase credentials that are
gitignored (they're per-project secrets, not code). None of them will build without
these — you'll need to obtain them from whoever manages the Firebase project, or
create your own Firebase project for local development.

### 1. SecondGuess — React Native app (repo root)

Copy `.env.example` to `.env` and fill in the values from Firebase Console
(Project Settings → General → Your apps → Web app → SDK setup and configuration):

```
cp .env.example .env
```

### 2. `contextual-coach` (Android)

Copy the template and replace it with the real file:

```
cp contextual-coach/app/google-services.json.example contextual-coach/app/google-services.json
```

Then download the real `google-services.json` from Firebase Console
(Project Settings → General → Your apps → Android app with package name
`com.registry.coach`) and replace the copied file with it.

### 3. `native-usage-collector` (Android)

Same pattern, different package name:

```
cp native-usage-collector/app/google-services.json.example native-usage-collector/app/google-services.json
```

Download the real file for the Android app with package name
`com.registry.usagecollector`, and replace the copied file with it.

### Verifying

```
npx tsc --noEmit                                          # RN app
cd functions && npm test                                   # Cloud Functions
cd contextual-coach && ./gradlew :app:assembleDebug         # contextual-coach
cd native-usage-collector && ./gradlew :app:assembleDebug   # native-usage-collector
```

If a Gradle build fails with `File google-services.json is missing`, you skipped
step 2 or 3 above.
