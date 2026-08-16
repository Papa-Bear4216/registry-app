// Exercises useAuth's produced contract (signUp/logOut) against a REAL Firebase
// Auth backend. Runs under the `node` Jest project (real `fetch`), unlike
// __tests__/hooks/useAuth.test.tsx which runs under jest-expo and cannot reach
// a live network (see the note in that file). This is the file that actually
// proves emulator wiring:
//
//   npx jest __tests__/firebase/useAuth.emulator.test.ts
//     -> FAIL (auth/network-request-failed) when no emulator is running
//
//   firebase emulators:exec --only auth \
//     "npx jest __tests__/firebase/useAuth.emulator.test.ts"
//     -> PASS
//
// useAuth() itself can't be called outside a React render (it uses
// useState/useEffect), so this drives the same module-level `auth` singleton
// that useAuth.ts creates via initializeFirebaseApp(), calling the identical
// firebase/auth functions useAuth wraps (createUserWithEmailAndPassword,
// signOut). That is the real produced contract: a live signUp/logOut round
// trip against the shared auth instance every screen consumes via useAuth().
import { connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirebaseApp } from '../../src/firebase/config';

const { auth } = initializeFirebaseApp();

beforeAll(() => {
  if (!auth.emulatorConfig) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
});

afterEach(async () => {
  await signOut(auth);
});

test('signUp then logOut moves current user non-null -> null against a live Auth backend', async () => {
  const email = `u${Date.now()}@example.com`;
  const password = 'password123';

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  expect(auth.currentUser).not.toBeNull();
  expect(cred.user.email).toBe(email);

  await signOut(auth);
  expect(auth.currentUser).toBeNull();
});
