import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, Auth, Persistence } from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// `getReactNativePersistence` is only exported from the React Native build of
// `firebase/auth` (resolved via Metro's `react-native` package.json export
// condition, which jest-expo's haste/platform config also honors). Under the
// `node` Jest project (ts-jest, plain Node module resolution, used by
// __tests__/firebase/*.emulator.test.ts and rules.test.ts), the generic
// Node/browser build of `firebase/auth` is resolved instead, and this symbol
// is `undefined` there — confirmed empirically. A namespace import + runtime
// lookup lets this file compile and run correctly in both environments: real
// app/native tests get persisted auth, and the `node`-project emulator tests
// safely fall back to plain `getAuth` (in-memory persistence, which is fine
// for a short-lived test process).
const getReactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence?: (storage: unknown) => Persistence;
  }
).getReactNativePersistence;

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

export function initializeFirebaseApp(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (cached) return cached;

  const app = initializeApp({
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  });

  // initializeAuth() throws `auth/already-initialized` if called more than
  // once for the same app, unlike getAuth() which is idempotent — so this
  // module-level cache is required, not just an optimization.
  //
  // The AsyncStorage import is a lazy require, not a top-level import: the
  // package ships ESM-only and the `node` Jest project (plain ts-jest, no
  // Babel/RN transform) can't parse it. Since getReactNativePersistence is
  // undefined in that project anyway (see above), this branch — and thus the
  // require — never executes there.
  const auth = getReactNativePersistence
    ? initializeAuth(app, {
        persistence: getReactNativePersistence(
          (
            require('@react-native-async-storage/async-storage') as {
              createAsyncStorage: (name: string) => unknown;
            }
          ).createAsyncStorage('firebase-auth')
        ),
      })
    : getAuth(app);

  cached = { app, auth, db: getFirestore(app) };
  return cached;
}
