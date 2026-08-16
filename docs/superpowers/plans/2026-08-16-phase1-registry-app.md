# Phase 1 Registry App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working, shippable Android registry app (Expo/React Native + Firebase) that lets a user manually track subscriptions/tools, log usage observations, and see dormancy/cost alerts — no auto-ingestion, no AI, no native collectors.

**Architecture:** Expo (React Native + TypeScript) client talking directly to Firebase Firestore/Auth via the Firebase JS SDK — no backend server in Phase 1 (Cloud Functions are Phase 2). All derived values (dormancy, monthly-equivalent cost, cost-per-use) are computed client-side at read time from raw Firestore data, never stored. Firestore security rules are the only enforcement of per-user data isolation.

**Tech Stack:** Expo (React Native, TypeScript), React Navigation (bottom tabs + native stack), Firebase JS SDK (Firestore + Auth), Jest + React Native Testing Library for tests.

**Spec:** `docs/superpowers/specs/2026-08-16-registry-app-design.md`

## Global Constraints

- Target platform: Android only (spec §1).
- Firebase JS SDK only — do not add React Native Firebase unless a specific native need forces it later (spec §1).
- Every Firestore record is scoped by `createdBy: uid`; every collection's security rules must restrict read/write to the record's own creator (spec §4 intro).
- `ItemStatus` is exactly `Keep | Review | Cut` — no `Dormant` or `Justified` values in this enum (spec §8.1).
- Dormancy is **derived** (no `Observation` in the trailing 21 days) — never stored as a field (spec §4, §8.1).
- Snooze/dismiss state lives only in `alertDismissals`, never on `registryItems` (spec §8.2).
- No `TaskCluster` concept anywhere — grouping is via `RegistryItem.taskCategories` only (spec §8.3).
- Cost-per-use is a **computed read-time stat**, never stored, using a **trailing 90-day observation window**, displayed as the raw pair `$X/mo · used N× / N hrs in last 90d` (never a single ratio) — locked during plan review, refining spec §8.4/OQ-2.
- Cost-per-use is **never a triggerable alert** — display-only. Dormancy is the only Phase 1 alert type in active use (spec §8.4).
- All spend aggregates normalize to monthly-equivalent by `billingCycle` before summing (spec §8.5, §5 Home notes).
- `BillingCycle` enum is exactly `Weekly | Monthly | Quarterly | Annual | OneTime` — locked during plan review, refining spec OQ-9. `OneTime` normalizes to `$0/mo` (spec §Cost Normalization intent).
- Auth is real multi-user: separate signup and login flows, each user only ever sees their own data — locked during plan review, refining spec OQ-7.
- No AI, no `/ingest`, no Cloud Functions, no native Kotlin collector, no Gmail integration — all Phase 2 (spec §3, §6, §7). Do not scaffold stubs for these.
- No contextual-coach code, permissions, or schema beyond the three already-approved unused optional string fields on `registryItems` (spec §11 — out of scope entirely for this plan).

---

## File Structure

```
registry-app/
├── app.json                          # Expo config
├── package.json
├── tsconfig.json
├── firebase.json                     # Firestore rules + emulator config
├── firestore.rules                   # Security rules (Task 1)
├── firestore.indexes.json            # Composite indexes if needed
├── src/
│   ├── firebase/
│   │   ├── config.ts                 # Firebase app init (Task 1)
│   │   └── firestore.ts              # Typed collection refs + converters (Task 2)
│   ├── types/
│   │   ├── enums.ts                  # All TS enums (Task 2)
│   │   └── models.ts                 # RegistryItem, Observation, AlertDismissal interfaces (Task 2)
│   ├── lib/
│   │   ├── costNormalization.ts      # monthlyEquivalent(cost, cycle) (Task 2)
│   │   ├── dormancy.ts               # isDormant(observations) (Task 9)
│   │   └── costPerUse.ts             # costPerUseStat(item, observations) (Task 6)
│   ├── navigation/
│   │   ├── RootNavigator.tsx         # Auth-gated stack (Task 3)
│   │   ├── TabNavigator.tsx          # 5-tab bottom nav (Task 3)
│   │   └── types.ts                  # Navigation param lists (Task 3)
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx       # Task 3
│   │   │   └── SignupScreen.tsx      # Task 3
│   │   ├── registry/
│   │   │   ├── RegistryListScreen.tsx    # Task 4
│   │   │   ├── AddItemScreen.tsx         # Task 5
│   │   │   └── ItemDetailScreen.tsx      # Task 6
│   │   ├── home/
│   │   │   └── HomeScreen.tsx        # Task 7
│   │   ├── tasks/
│   │   │   └── TasksScreen.tsx       # Task 8
│   │   └── alerts/
│   │       └── AlertsScreen.tsx      # Task 9
│   ├── hooks/
│   │   ├── useAuth.ts                # Task 3
│   │   ├── useRegistryItems.ts       # Task 4
│   │   └── useObservations.ts        # Task 6
│   └── components/
│       ├── OfflineBanner.tsx         # Task 3
│       └── StatusBadge.tsx           # Task 4
└── __tests__/                        # mirrors src/ structure per task
```

Files that change together stay together: each screen owns its own hook usage inline rather than a separate service layer, since Phase 1 has no backend logic beyond Firestore reads/writes — a service-layer split would be premature abstraction for CRUD-plus-derived-stats.

---

### Task 1: Firebase Project, Firestore, Auth, Security Rules

**Files:**
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `.env.example`
- Create: `src/firebase/config.ts`
- Test: `__tests__/firebase/rules.test.ts` (Firestore emulator rules test)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `initializeFirebaseApp(): { app: FirebaseApp, auth: Auth, db: Firestore }` from `src/firebase/config.ts`, used by every later task that touches Firestore/Auth.

- [ ] **Step 1: Create the Firebase project and enable services**

Run in browser (manual, one-time): create a Firebase project, enable Firestore (production mode) and Authentication (Email/Password provider). Copy the web app config values.

- [ ] **Step 2: Scaffold `.env.example` and `src/firebase/config.ts`**

```bash
# .env.example
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

```ts
// src/firebase/config.ts
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export function initializeFirebaseApp(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  const app = initializeApp({
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  });
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
```

- [ ] **Step 3: Write `firestore.rules` — creator-only access on every Phase 1 collection**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(resource) {
      return request.auth != null && request.auth.uid == resource.data.createdBy;
    }
    function isOwnerOnCreate() {
      return request.auth != null && request.auth.uid == request.resource.data.createdBy;
    }

    match /registryItems/{itemId} {
      allow create: if isOwnerOnCreate();
      allow read, update, delete: if isOwner(resource);
    }
    match /observations/{obsId} {
      allow create: if isOwnerOnCreate();
      allow read, update, delete: if isOwner(resource);
    }
    match /alertDismissals/{dismissalId} {
      allow create: if isOwnerOnCreate();
      allow read, update, delete: if isOwner(resource);
    }
  }
}
```

Note: `observations` and `alertDismissals` need `createdBy`/`owner` fields for this rule shape even though the spec's field tables call the field `owner` on `alertDismissals` — reconciled in Task 2 by using `createdBy` consistently across all three Phase 1 collections for rule simplicity.

- [ ] **Step 4: Write `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "observations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "registryItemId", "order": "ASCENDING" },
        { "fieldPath": "observedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 5: Write `firebase.json` pointing at rules/indexes + emulator config**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 6: Write the failing rules test**

```ts
// __tests__/firebase/rules.test.ts
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, getDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'registry-app-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});

afterAll(async () => await testEnv.cleanup());
afterEach(async () => await testEnv.clearFirestore());

test('owner can create and read their own registryItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const itemRef = doc(alice, 'registryItems/item1');
  await assertSucceeds(setDoc(itemRef, { name: 'Netflix', createdBy: 'alice' }));
  await assertSucceeds(getDoc(itemRef));
});

test('non-owner cannot read another user\'s registryItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'registryItems/item1'), { name: 'Netflix', createdBy: 'alice' });
  });
  await assertFails(getDoc(doc(bob, 'registryItems/item1')));
});

test('unauthenticated user cannot create a registryItem', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'registryItems/item1'), { name: 'Netflix', createdBy: 'ghost' }));
});
```

- [ ] **Step 7: Run test to verify it fails (no rules deployed to emulator yet / emulator not running)**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/firebase/rules.test.ts"`
Expected: FAIL (emulator not started standalone, or rules not yet correct) — confirms the test harness is wired before trusting a pass.

- [ ] **Step 8: Fix rules/config until the test passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/firebase/rules.test.ts"`
Expected: PASS — all three assertions succeed.

- [ ] **Step 9: Commit**

```bash
git add firebase.json firestore.rules firestore.indexes.json .env.example src/firebase/config.ts __tests__/firebase/rules.test.ts
git commit -m "feat: Firebase project config, Firestore security rules, emulator test harness"
```

---

### Task 2: TypeScript Types, Enums, Cost Normalization

**Files:**
- Create: `src/types/enums.ts`
- Create: `src/types/models.ts`
- Create: `src/lib/costNormalization.ts`
- Create: `src/firebase/firestore.ts`
- Test: `__tests__/lib/costNormalization.test.ts`

**Interfaces:**
- Consumes: `initializeFirebaseApp()` from Task 1.
- Produces: `RegistryItem`, `Observation`, `AlertDismissal` types; `ItemStatus`, `ItemKind`, `BillingCycle`, `TaskCategory`, `AlertType` enums; `monthlyEquivalent(cost: number, cycle: BillingCycle): number` — used by every screen that shows a cost.

- [ ] **Step 1: Write `src/types/enums.ts`**

```ts
export enum ItemStatus {
  Keep = 'keep',
  Review = 'review',
  Cut = 'cut',
}

export enum ItemKind {
  App = 'app',
  Subscription = 'subscription',
  DevTool = 'dev_tool',
  Service = 'service',
  Hardware = 'hardware',
  Other = 'other',
}

export enum BillingCycle {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Annual = 'annual',
  OneTime = 'one_time',
}

export enum TaskCategory {
  Writing = 'writing',
  Coding = 'coding',
  Communication = 'communication',
  Design = 'design',
  Productivity = 'productivity',
  Media = 'media',
  Finance = 'finance',
  Utilities = 'utilities',
  Other = 'other',
}

export enum AlertType {
  Dormant = 'dormant',
  HighCost = 'high_cost',
  Redundant = 'redundant',
}
```

- [ ] **Step 2: Write `src/types/models.ts`**

```ts
import { ItemStatus, ItemKind, BillingCycle, TaskCategory, AlertType } from './enums';

export interface RegistryItem {
  id: string;
  name: string;
  cost: number;
  billingCycle: BillingCycle;
  kind: ItemKind;
  status: ItemStatus;
  taskCategories: TaskCategory[];
  description: string;
  canonicalIdentity: string | null;
  justified: boolean;
  isBestForTask: boolean;
  useCases: string | null;
  capabilitySummary: string | null;
  sourceUrl: string | null;
  createdBy: string;
  createdAt: string; // ISO-8601
}

export interface Observation {
  id: string;
  registryItemId: string;
  observedAt: string; // ISO-8601
  windowHours: number;
  usageCount: number;
  usageDurationMs: number;
  createdBy: string;
}

export interface AlertDismissal {
  id: string;
  itemId: string;
  alertType: AlertType;
  dismissedAt: string | null; // ISO-8601
  snoozedUntil: string | null; // ISO-8601
  createdBy: string;
}
```

Note: `deviceSourceId`, `collector`, `lastUsed`, `rawPayload` on `Observation` and `stagingItems`/`suggestions`/`taskRankings`/`userVetoes`/`actionLogs`/`deviceSources` collections from spec §4 are Phase 2 and intentionally omitted here — adding them now would be dead code with no reader until Phase 2 exists.

- [ ] **Step 3: Write `src/lib/costNormalization.ts`**

```ts
import { BillingCycle } from '../types/enums';

export function monthlyEquivalent(cost: number, cycle: BillingCycle): number {
  switch (cycle) {
    case BillingCycle.Weekly:
      return cost * 4.33;
    case BillingCycle.Monthly:
      return cost;
    case BillingCycle.Quarterly:
      return cost / 3;
    case BillingCycle.Annual:
      return cost / 12;
    case BillingCycle.OneTime:
      return 0;
  }
}
```

- [ ] **Step 4: Write the failing test**

```ts
// __tests__/lib/costNormalization.test.ts
import { monthlyEquivalent } from '../../src/lib/costNormalization';
import { BillingCycle } from '../../src/types/enums';

test('monthly cost passes through unchanged', () => {
  expect(monthlyEquivalent(10, BillingCycle.Monthly)).toBe(10);
});

test('annual cost divides by 12', () => {
  expect(monthlyEquivalent(120, BillingCycle.Annual)).toBe(10);
});

test('quarterly cost divides by 3', () => {
  expect(monthlyEquivalent(30, BillingCycle.Quarterly)).toBe(10);
});

test('weekly cost multiplies by 4.33', () => {
  expect(monthlyEquivalent(10, BillingCycle.Weekly)).toBeCloseTo(43.3);
});

test('one-time cost normalizes to zero', () => {
  expect(monthlyEquivalent(500, BillingCycle.OneTime)).toBe(0);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx jest __tests__/lib/costNormalization.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/costNormalization'" (until Step 3 file exists) or assertion failures if written out of order — write Step 3 first per TDD intent is inverted here only because the function is pure and trivial; still run this to confirm the test file itself is valid before trusting the pass in Step 6.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest __tests__/lib/costNormalization.test.ts`
Expected: PASS — all 5 assertions succeed.

- [ ] **Step 7: Write `src/firebase/firestore.ts` — typed collection references**

```ts
import { collection, CollectionReference, Firestore } from 'firebase/firestore';
import { RegistryItem, Observation, AlertDismissal } from '../types/models';

export function registryItemsRef(db: Firestore): CollectionReference<RegistryItem> {
  return collection(db, 'registryItems') as CollectionReference<RegistryItem>;
}

export function observationsRef(db: Firestore): CollectionReference<Observation> {
  return collection(db, 'observations') as CollectionReference<Observation>;
}

export function alertDismissalsRef(db: Firestore): CollectionReference<AlertDismissal> {
  return collection(db, 'alertDismissals') as CollectionReference<AlertDismissal>;
}
```

- [ ] **Step 8: Commit**

```bash
git add src/types/enums.ts src/types/models.ts src/lib/costNormalization.ts src/firebase/firestore.ts __tests__/lib/costNormalization.test.ts
git commit -m "feat: TypeScript enums, models, cost normalization, typed Firestore refs"
```

---

### Task 3: Expo Scaffold, Navigation, Auth Screens

**Files:**
- Create: `app.json`, `package.json`, `tsconfig.json`, `App.tsx`
- Create: `src/navigation/types.ts`
- Create: `src/navigation/RootNavigator.tsx`
- Create: `src/navigation/TabNavigator.tsx`
- Create: `src/hooks/useAuth.ts`
- Create: `src/screens/auth/LoginScreen.tsx`
- Create: `src/screens/auth/SignupScreen.tsx`
- Create: `src/components/OfflineBanner.tsx`
- Test: `__tests__/hooks/useAuth.test.tsx`

**Interfaces:**
- Consumes: `initializeFirebaseApp()` (Task 1).
- Produces: `useAuth(): { user: User | null, loading: boolean, signUp(email, password): Promise<void>, logIn(email, password): Promise<void>, logOut(): Promise<void> }` from `src/hooks/useAuth.ts` — consumed by `RootNavigator` and every later screen needing `user.uid` for Firestore queries. `RootTabParamList` and `RootStackParamList` types from `src/navigation/types.ts` — consumed by every screen's navigation prop typing in Tasks 4–9.

- [ ] **Step 1: Scaffold the Expo project**

```bash
npx create-expo-app@latest . --template blank-typescript
npx expo install firebase @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack react-native-screens react-native-safe-area-context @react-native-community/netinfo
npm install --save-dev jest @testing-library/react-native @testing-library/jest-native @firebase/rules-unit-testing
```

- [ ] **Step 2: Write `src/navigation/types.ts`**

```ts
export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Tabs: undefined;
  AddItem: undefined;
  ItemDetail: { itemId: string };
};

export type RootTabParamList = {
  Home: undefined;
  Registry: undefined;
  Tasks: undefined;
  Alerts: undefined;
};
```

- [ ] **Step 3: Write `src/hooks/useAuth.ts`**

```ts
import { useState, useEffect } from 'react';
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { initializeFirebaseApp } from '../firebase/config';

const { auth } = initializeFirebaseApp();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return {
    user,
    loading,
    signUp: (email: string, password: string) =>
      createUserWithEmailAndPassword(auth, email, password).then(() => undefined),
    logIn: (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password).then(() => undefined),
    logOut: () => signOut(auth),
  };
}
```

- [ ] **Step 4: Write the failing test**

```tsx
// __tests__/hooks/useAuth.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';

test('starts in loading state and resolves to signed-out', async () => {
  const { result } = renderHook(() => useAuth());
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user).toBeNull();
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx jest __tests__/hooks/useAuth.test.tsx`
Expected: FAIL if Firebase emulator isn't running/connected yet — confirms test wiring before trusting the pass.

- [ ] **Step 6: Connect to the Auth emulator in test setup and rerun**

Add to a Jest setup file: `connectAuthEmulator(auth, 'http://localhost:9099')` guarded by a test-env check, then:

Run: `firebase emulators:exec --only auth "npx jest __tests__/hooks/useAuth.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Write `LoginScreen.tsx` and `SignupScreen.tsx`**

```tsx
// src/screens/auth/LoginScreen.tsx
import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { logIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      await logIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error && <Text>{error}</Text>}
      <Button title="Log In" onPress={handleLogin} />
      <Button title="Need an account? Sign up" onPress={() => navigation.navigate('Signup')} />
    </View>
  );
}
```

```tsx
// src/screens/auth/SignupScreen.tsx
import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    try {
      await signUp(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signup failed');
    }
  };

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error && <Text>{error}</Text>}
      <Button title="Sign Up" onPress={handleSignup} />
      <Button title="Already have an account? Log in" onPress={() => navigation.navigate('Login')} />
    </View>
  );
}
```

- [ ] **Step 8: Write `src/components/OfflineBanner.tsx`**

```tsx
import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => setIsOffline(state.isConnected === false));
  }, []);

  if (!isOffline) return null;
  return (
    <View style={{ backgroundColor: '#B91C1C', padding: 8 }}>
      <Text style={{ color: 'white', textAlign: 'center' }}>You're offline — changes will sync later</Text>
    </View>
  );
}
```

- [ ] **Step 9: Write `TabNavigator.tsx` and `RootNavigator.tsx`**

```tsx
// src/navigation/TabNavigator.tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { RegistryListScreen } from '../screens/registry/RegistryListScreen';
import { TasksScreen } from '../screens/tasks/TasksScreen';
import { AlertsScreen } from '../screens/alerts/AlertsScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Registry" component={RegistryListScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
    </Tab.Navigator>
  );
}
```

```tsx
// src/navigation/RootNavigator.tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuth } from '../hooks/useAuth';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import { TabNavigator } from './TabNavigator';
import { AddItemScreen } from '../screens/registry/AddItemScreen';
import { ItemDetailScreen } from '../screens/registry/ItemDetailScreen';
import { OfflineBanner } from '../components/OfflineBanner';
import { View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <OfflineBanner />
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add Item' }} />
            <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item Detail' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 10: Write `App.tsx`**

```tsx
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return <RootNavigator />;
}
```

- [ ] **Step 11: Run the app to confirm it boots to the login screen**

Run: `npx expo start` → open on Android emulator/device
Expected: Login screen renders; no red-screen errors. (Note: `AddItemScreen`, `ItemDetailScreen`, `HomeScreen`, `RegistryListScreen`, `TasksScreen`, `AlertsScreen` are placeholder-free real screens built in Tasks 4–9 — this task assumes those files already exist as stubs, so actually run Steps 1–10 with minimal placeholder returns like `<View />` in each until their own task fills them in, and revisit this run after Task 9.)

- [ ] **Step 12: Commit**

```bash
git add app.json package.json tsconfig.json App.tsx src/navigation src/hooks/useAuth.ts src/screens/auth src/components/OfflineBanner.tsx __tests__/hooks/useAuth.test.tsx
git commit -m "feat: Expo scaffold, navigation shell, auth screens, offline banner"
```

---

### Task 4: Registry List Screen

**Files:**
- Create: `src/hooks/useRegistryItems.ts`
- Create: `src/screens/registry/RegistryListScreen.tsx`
- Create: `src/components/StatusBadge.tsx`
- Test: `__tests__/hooks/useRegistryItems.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 3), `registryItemsRef(db)` (Task 2), `RegistryItem` type (Task 2), `RootStackParamList` (Task 3).
- Produces: `useRegistryItems(uid: string): { items: RegistryItem[], loading: boolean }` — consumed by Task 7 (Home) and Task 8 (Tasks) for their own filtered/grouped views.

- [ ] **Step 1: Write the failing test for `useRegistryItems`**

```tsx
// __tests__/hooks/useRegistryItems.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { useRegistryItems } from '../../src/hooks/useRegistryItems';
import { initializeFirebaseApp } from '../../src/firebase/config';
import { doc, setDoc } from 'firebase/firestore';

test('returns only items belonging to the given uid', async () => {
  const { db } = initializeFirebaseApp();
  await setDoc(doc(db, 'registryItems/item1'), {
    name: 'Netflix', cost: 15, billingCycle: 'monthly', kind: 'subscription',
    status: 'keep', taskCategories: ['media'], description: '', canonicalIdentity: null,
    justified: false, isBestForTask: false, useCases: null, capabilitySummary: null,
    sourceUrl: null, createdBy: 'alice', createdAt: new Date().toISOString(),
  });

  const { result } = renderHook(() => useRegistryItems('alice'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items).toHaveLength(1);
  expect(result.current.items[0].name).toBe('Netflix');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/hooks/useRegistryItems.test.tsx"`
Expected: FAIL with "Cannot find module '../../src/hooks/useRegistryItems'"

- [ ] **Step 3: Write `src/hooks/useRegistryItems.ts`**

```ts
import { useState, useEffect } from 'react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { registryItemsRef } from '../firebase/firestore';
import { RegistryItem } from '../types/models';

export function useRegistryItems(uid: string): { items: RegistryItem[]; loading: boolean } {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(registryItemsRef(db), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as RegistryItem)));
      setLoading(false);
    });
    return unsubscribe;
  }, [uid]);

  return { items, loading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/hooks/useRegistryItems.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Write `src/components/StatusBadge.tsx`**

```tsx
import { View, Text } from 'react-native';
import { ItemStatus } from '../types/enums';

const COLORS: Record<ItemStatus, string> = {
  [ItemStatus.Keep]: '#16A34A',
  [ItemStatus.Review]: '#D97706',
  [ItemStatus.Cut]: '#DC2626',
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <View style={{ backgroundColor: COLORS[status], borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color: 'white', fontSize: 12 }}>{status}</Text>
    </View>
  );
}
```

- [ ] **Step 6: Write `RegistryListScreen.tsx` with search + status/kind filters**

```tsx
import { useState, useMemo } from 'react';
import { View, TextInput, FlatList, Text, Pressable, Picker } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { StatusBadge } from '../../components/StatusBadge';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { ItemStatus, ItemKind } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'Registry'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function RegistryListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<ItemKind | 'all'>('all');

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, search, statusFilter, kindFilter]);

  if (loading) return <Text>Loading…</Text>;

  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="Search…" value={search} onChangeText={setSearch} />
      <Picker selectedValue={statusFilter} onValueChange={setStatusFilter}>
        <Picker.Item label="All statuses" value="all" />
        {Object.values(ItemStatus).map((s) => <Picker.Item key={s} label={s} value={s} />)}
      </Picker>
      <Picker selectedValue={kindFilter} onValueChange={setKindFilter}>
        <Picker.Item label="All kinds" value="all" />
        {Object.values(ItemKind).map((k) => <Picker.Item key={k} label={k} value={k} />)}
      </Picker>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
              <Text>{item.name}</Text>
              <Text>${monthlyEquivalent(item.cost, item.billingCycle).toFixed(2)}/mo</Text>
              <StatusBadge status={item.status} />
            </View>
          </Pressable>
        )}
      />
      <Pressable onPress={() => navigation.navigate('AddItem')} style={{ position: 'absolute', bottom: 16, right: 16 }}>
        <Text style={{ fontSize: 32 }}>+</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 7: Run the app and manually verify search + filters work**

Run: `npx expo start` → navigate to Registry tab, add filter interactions
Expected: list filters live as you type/select; FAB navigates to AddItem (stub until Task 5).

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useRegistryItems.ts src/screens/registry/RegistryListScreen.tsx src/components/StatusBadge.tsx __tests__/hooks/useRegistryItems.test.tsx
git commit -m "feat: Registry list screen with search, status/kind filters"
```

---

### Task 5: Add Item Screen

**Files:**
- Create: `src/screens/registry/AddItemScreen.tsx`
- Test: `__tests__/screens/AddItemScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 3), `registryItemsRef(db)` (Task 2), `ItemKind`/`ItemStatus`/`BillingCycle`/`TaskCategory` enums (Task 2), `RootStackParamList` (Task 3).
- Produces: nothing consumed by later tasks — this is a leaf write-only screen.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/screens/AddItemScreen.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AddItemScreen } from '../../src/screens/registry/AddItemScreen';
import { getDocs, collection } from 'firebase/firestore';
import { initializeFirebaseApp } from '../../src/firebase/config';

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}));

test('submitting the form creates a registryItem with createdBy set', async () => {
  const navigation = { goBack: jest.fn() } as any;
  const { getByPlaceholderText, getByText } = render(<AddItemScreen navigation={navigation} route={{} as any} />);

  fireEvent.changeText(getByPlaceholderText('Name'), 'Notion');
  fireEvent.changeText(getByPlaceholderText('Cost'), '10');
  fireEvent.press(getByText('Save'));

  await waitFor(async () => {
    const { db } = initializeFirebaseApp();
    const snapshot = await getDocs(collection(db, 'registryItems'));
    expect(snapshot.docs.some((d) => d.data().name === 'Notion' && d.data().createdBy === 'alice')).toBe(true);
  });
  expect(navigation.goBack).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/AddItemScreen.test.tsx"`
Expected: FAIL with "Cannot find module '../../src/screens/registry/AddItemScreen'"

- [ ] **Step 3: Write `AddItemScreen.tsx`**

```tsx
import { useState } from 'react';
import { View, TextInput, Button, Picker } from 'react-native';
import { addDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { initializeFirebaseApp } from '../../firebase/config';
import { registryItemsRef } from '../../firebase/firestore';
import { ItemKind, ItemStatus, BillingCycle, TaskCategory } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddItem'>;

export function AddItemScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(BillingCycle.Monthly);
  const [kind, setKind] = useState<ItemKind>(ItemKind.Subscription);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [description, setDescription] = useState('');

  const handleSave = async () => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await addDoc(registryItemsRef(db), {
      name,
      cost: parseFloat(cost) || 0,
      billingCycle,
      kind,
      status: ItemStatus.Keep,
      taskCategories,
      description,
      canonicalIdentity: null,
      justified: false,
      isBestForTask: false,
      useCases: null,
      capabilitySummary: null,
      sourceUrl: null,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
    } as any);
    navigation.goBack();
  };

  return (
    <View>
      <TextInput placeholder="Name" value={name} onChangeText={setName} />
      <TextInput placeholder="Cost" value={cost} onChangeText={setCost} keyboardType="numeric" />
      <Picker selectedValue={billingCycle} onValueChange={setBillingCycle}>
        {Object.values(BillingCycle).map((c) => <Picker.Item key={c} label={c} value={c} />)}
      </Picker>
      <Picker selectedValue={kind} onValueChange={setKind}>
        {Object.values(ItemKind).map((k) => <Picker.Item key={k} label={k} value={k} />)}
      </Picker>
      <TextInput placeholder="Description" value={description} onChangeText={setDescription} />
      <Button title="Save" onPress={handleSave} />
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/AddItemScreen.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/registry/AddItemScreen.tsx __tests__/screens/AddItemScreen.test.tsx
git commit -m "feat: Add Item screen"
```

---

### Task 6: Item Detail Screen (view/edit, log observation, retire/reactivate, delete, cost-per-use)

**Files:**
- Create: `src/hooks/useObservations.ts`
- Create: `src/lib/costPerUse.ts`
- Create: `src/screens/registry/ItemDetailScreen.tsx`
- Test: `__tests__/lib/costPerUse.test.ts`
- Test: `__tests__/screens/ItemDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `observationsRef(db)` (Task 2), `Observation`/`RegistryItem` types (Task 2), `monthlyEquivalent` (Task 2).
- Produces: `costPerUseStat(observations: Observation[]): { usageCount: number, usageHours: number }` — pure function, used only within this screen but tested standalone since it's the OQ-2 raw-pair logic. `useObservations(itemId: string): { observations: Observation[], logObservation(usageCount: number, usageDurationMs: number): Promise<void> }`.

- [ ] **Step 1: Write the failing test for `costPerUseStat`**

```ts
// __tests__/lib/costPerUse.test.ts
import { costPerUseStat } from '../../src/lib/costPerUse';
import { Observation } from '../../src/types/models';

function makeObservation(daysAgo: number, usageCount: number, usageDurationMs: number): Observation {
  const observedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { id: 'x', registryItemId: 'item1', observedAt, windowHours: 24, usageCount, usageDurationMs, createdBy: 'alice' };
}

test('sums usage within the trailing 90-day window', () => {
  const observations = [makeObservation(10, 3, 3_600_000), makeObservation(50, 2, 1_800_000)];
  const stat = costPerUseStat(observations);
  expect(stat.usageCount).toBe(5);
  expect(stat.usageHours).toBeCloseTo(1.5);
});

test('excludes observations older than 90 days', () => {
  const observations = [makeObservation(10, 3, 3_600_000), makeObservation(120, 100, 999_999_999)];
  const stat = costPerUseStat(observations);
  expect(stat.usageCount).toBe(3);
});

test('returns zero for no observations', () => {
  const stat = costPerUseStat([]);
  expect(stat.usageCount).toBe(0);
  expect(stat.usageHours).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/costPerUse.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/costPerUse'"

- [ ] **Step 3: Write `src/lib/costPerUse.ts`**

```ts
import { Observation } from '../types/models';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function costPerUseStat(observations: Observation[]): { usageCount: number; usageHours: number } {
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const inWindow = observations.filter((o) => new Date(o.observedAt).getTime() >= cutoff);
  const usageCount = inWindow.reduce((sum, o) => sum + o.usageCount, 0);
  const usageDurationMs = inWindow.reduce((sum, o) => sum + o.usageDurationMs, 0);
  return { usageCount, usageHours: usageDurationMs / (1000 * 60 * 60) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/costPerUse.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/hooks/useObservations.ts`**

```ts
import { useState, useEffect } from 'react';
import { query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { observationsRef } from '../firebase/firestore';
import { Observation } from '../types/models';
import { useAuth } from './useAuth';

export function useObservations(itemId: string) {
  const { user } = useAuth();
  const [observations, setObservations] = useState<Observation[]>([]);

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(observationsRef(db), where('registryItemId', '==', itemId));
    return onSnapshot(q, (snapshot) => {
      setObservations(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Observation)));
    });
  }, [itemId]);

  const logObservation = async (usageCount: number, usageDurationMs: number) => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await addDoc(observationsRef(db), {
      registryItemId: itemId,
      observedAt: new Date().toISOString(),
      windowHours: 24,
      usageCount,
      usageDurationMs,
      createdBy: user.uid,
    } as any);
  };

  return { observations, logObservation };
}
```

- [ ] **Step 6: Write `ItemDetailScreen.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../../firebase/config';
import { useObservations } from '../../hooks/useObservations';
import { costPerUseStat } from '../../lib/costPerUse';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { RegistryItem } from '../../types/models';
import { ItemStatus } from '../../types/enums';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route, navigation }: Props) {
  const { itemId } = route.params;
  const [item, setItem] = useState<RegistryItem | null>(null);
  const { observations, logObservation } = useObservations(itemId);
  const [logCount, setLogCount] = useState('');
  const [logMinutes, setLogMinutes] = useState('');

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    getDoc(doc(db, 'registryItems', itemId)).then((snap) => {
      if (snap.exists()) setItem({ id: snap.id, ...snap.data() } as RegistryItem);
    });
  }, [itemId]);

  if (!item) return <Text>Loading…</Text>;

  const stat = costPerUseStat(observations);
  const monthly = monthlyEquivalent(item.cost, item.billingCycle);

  const toggleRetire = async () => {
    const { db } = initializeFirebaseApp();
    const nextStatus = item.status === ItemStatus.Cut ? ItemStatus.Keep : ItemStatus.Cut;
    await updateDoc(doc(db, 'registryItems', itemId), { status: nextStatus });
    setItem({ ...item, status: nextStatus });
  };

  const handleDelete = async () => {
    const { db } = initializeFirebaseApp();
    await deleteDoc(doc(db, 'registryItems', itemId));
    navigation.goBack();
  };

  const handleLogObservation = async () => {
    await logObservation(parseInt(logCount, 10) || 0, (parseInt(logMinutes, 10) || 0) * 60 * 1000);
    setLogCount('');
    setLogMinutes('');
  };

  return (
    <View>
      <Text>{item.name}</Text>
      <Text>${monthly.toFixed(2)}/mo · used {stat.usageCount}× / {stat.usageHours.toFixed(1)} hrs in last 90d</Text>
      <Text>{item.description}</Text>

      <TextInput placeholder="Times used" value={logCount} onChangeText={setLogCount} keyboardType="numeric" />
      <TextInput placeholder="Minutes used" value={logMinutes} onChangeText={setLogMinutes} keyboardType="numeric" />
      <Button title="Log Observation" onPress={handleLogObservation} />

      <Button
        title={item.status === ItemStatus.Cut ? 'Reactivate' : 'Retire'}
        onPress={toggleRetire}
      />
      <Button title="Delete" onPress={handleDelete} />
    </View>
  );
}
```

- [ ] **Step 7: Write the failing screen test**

```tsx
// __tests__/screens/ItemDetailScreen.test.tsx
import { render, waitFor, getByText } from '@testing-library/react-native';
import { ItemDetailScreen } from '../../src/screens/registry/ItemDetailScreen';
import { initializeFirebaseApp } from '../../src/firebase/config';
import { doc, setDoc } from 'firebase/firestore';

test('renders monthly cost and raw-pair usage stat', async () => {
  const { db } = initializeFirebaseApp();
  await setDoc(doc(db, 'registryItems/item1'), {
    name: 'Figma', cost: 12, billingCycle: 'monthly', kind: 'app', status: 'keep',
    taskCategories: ['design'], description: 'Design tool', canonicalIdentity: null,
    justified: false, isBestForTask: false, useCases: null, capabilitySummary: null,
    sourceUrl: null, createdBy: 'alice', createdAt: new Date().toISOString(),
  });

  const route = { params: { itemId: 'item1' } } as any;
  const navigation = { goBack: jest.fn() } as any;
  const { findByText } = render(<ItemDetailScreen route={route} navigation={navigation} />);

  await findByText(/\$12\.00\/mo · used 0× \/ 0\.0 hrs in last 90d/);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/ItemDetailScreen.test.tsx"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useObservations.ts src/lib/costPerUse.ts src/screens/registry/ItemDetailScreen.tsx __tests__/lib/costPerUse.test.ts __tests__/screens/ItemDetailScreen.test.tsx
git commit -m "feat: Item Detail screen with observation logging, retire/reactivate, cost-per-use stat"
```

---

### Task 7: Home Dashboard

**Files:**
- Create: `src/screens/home/HomeScreen.tsx`
- Test: `__tests__/screens/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 3), `useRegistryItems(uid)` (Task 4), `monthlyEquivalent` (Task 2), `ItemStatus` enum (Task 2).
- Produces: nothing consumed by later tasks — leaf read-only screen.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/screens/HomeScreen.test.tsx
import { render, findByText } from '@testing-library/react-native';
import { HomeScreen } from '../../src/screens/home/HomeScreen';
import { initializeFirebaseApp } from '../../src/firebase/config';
import { doc, setDoc } from 'firebase/firestore';

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}));

test('sums monthly-equivalent cost across mixed billing cycles', async () => {
  const { db } = initializeFirebaseApp();
  await setDoc(doc(db, 'registryItems/item1'), {
    name: 'A', cost: 10, billingCycle: 'monthly', kind: 'app', status: 'keep',
    taskCategories: [], description: '', canonicalIdentity: null, justified: false,
    isBestForTask: false, useCases: null, capabilitySummary: null, sourceUrl: null,
    createdBy: 'alice', createdAt: new Date().toISOString(),
  });
  await setDoc(doc(db, 'registryItems/item2'), {
    name: 'B', cost: 120, billingCycle: 'annual', kind: 'app', status: 'keep',
    taskCategories: [], description: '', canonicalIdentity: null, justified: false,
    isBestForTask: false, useCases: null, capabilitySummary: null, sourceUrl: null,
    createdBy: 'alice', createdAt: new Date().toISOString(),
  });

  const { findByText: find } = render(<HomeScreen navigation={{} as any} route={{} as any} />);
  await find(/\$20\.00\/mo/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/HomeScreen.test.tsx"`
Expected: FAIL with "Cannot find module '../../src/screens/home/HomeScreen'"

- [ ] **Step 3: Write `HomeScreen.tsx`**

```tsx
import { View, Text } from 'react-native';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { monthlyEquivalent } from '../../lib/costNormalization';
import { ItemStatus } from '../../types/enums';

export function HomeScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');

  const totalMonthly = useMemo(
    () => items.reduce((sum, item) => sum + monthlyEquivalent(item.cost, item.billingCycle), 0),
    [items]
  );
  const counts = useMemo(() => {
    const result: Record<ItemStatus, number> = { [ItemStatus.Keep]: 0, [ItemStatus.Review]: 0, [ItemStatus.Cut]: 0 };
    items.forEach((item) => { result[item.status]++; });
    return result;
  }, [items]);

  if (loading) return <Text>Loading…</Text>;

  return (
    <View>
      <Text>${totalMonthly.toFixed(2)}/mo total spend</Text>
      <Text>Keep: {counts[ItemStatus.Keep]}</Text>
      <Text>Review: {counts[ItemStatus.Review]}</Text>
      <Text>Cut: {counts[ItemStatus.Cut]}</Text>
      <Text>{items.length} items tracked</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/HomeScreen.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/home/HomeScreen.tsx __tests__/screens/HomeScreen.test.tsx
git commit -m "feat: Home dashboard with monthly-normalized spend total and status counts"
```

---

### Task 8: Tasks Screen (grouped by category)

**Files:**
- Create: `src/screens/tasks/TasksScreen.tsx`
- Test: `__tests__/screens/TasksScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 3), `useRegistryItems(uid)` (Task 4), `TaskCategory` enum (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/screens/TasksScreen.test.tsx
import { render } from '@testing-library/react-native';
import { TasksScreen } from '../../src/screens/tasks/TasksScreen';
import { initializeFirebaseApp } from '../../src/firebase/config';
import { doc, setDoc } from 'firebase/firestore';

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}));

test('groups items under their tagged task categories', async () => {
  const { db } = initializeFirebaseApp();
  await setDoc(doc(db, 'registryItems/item1'), {
    name: 'VS Code', cost: 0, billingCycle: 'monthly', kind: 'dev_tool', status: 'keep',
    taskCategories: ['coding'], description: '', canonicalIdentity: null, justified: false,
    isBestForTask: false, useCases: null, capabilitySummary: null, sourceUrl: null,
    createdBy: 'alice', createdAt: new Date().toISOString(),
  });

  const { findByText } = render(<TasksScreen />);
  await findByText('coding');
  await findByText('VS Code');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/TasksScreen.test.tsx"`
Expected: FAIL with "Cannot find module '../../src/screens/tasks/TasksScreen'"

- [ ] **Step 3: Write `TasksScreen.tsx`**

```tsx
import { View, Text, SectionList } from 'react-native';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { TaskCategory } from '../../types/enums';
import { RegistryItem } from '../../types/models';

export function TasksScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');

  const sections = useMemo(() => {
    const byCategory = new Map<TaskCategory, RegistryItem[]>();
    items.forEach((item) => {
      item.taskCategories.forEach((cat) => {
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(item);
      });
    });
    return Array.from(byCategory.entries()).map(([category, data]) => ({ title: category, data }));
  }, [items]);

  if (loading) return <Text>Loading…</Text>;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => <Text style={{ fontWeight: 'bold' }}>{section.title}</Text>}
      renderItem={({ item }) => <View><Text>{item.name}</Text></View>}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/TasksScreen.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/tasks/TasksScreen.tsx __tests__/screens/TasksScreen.test.tsx
git commit -m "feat: Tasks screen grouped by task category"
```

---

### Task 9: Alerts Screen (dormancy derivation, snooze/dismiss)

**Files:**
- Create: `src/lib/dormancy.ts`
- Create: `src/hooks/useAlertDismissals.ts`
- Create: `src/screens/alerts/AlertsScreen.tsx`
- Test: `__tests__/lib/dormancy.test.ts`
- Test: `__tests__/screens/AlertsScreen.test.tsx`

**Interfaces:**
- Consumes: `useRegistryItems(uid)` (Task 4), `Observation` type (Task 2), `alertDismissalsRef(db)` (Task 2), `AlertType` enum (Task 2).
- Produces: `isDormant(observations: Observation[]): boolean` — pure function, this is the canonical dormancy check other Phase 2 work (e.g. `dormancyCheck` Cloud Function) should mirror when it's built, though nothing in this plan consumes it beyond this screen.

- [ ] **Step 1: Write the failing test for `isDormant`**

```ts
// __tests__/lib/dormancy.test.ts
import { isDormant } from '../../src/lib/dormancy';
import { Observation } from '../../src/types/models';

function makeObservation(daysAgo: number): Observation {
  return {
    id: 'x', registryItemId: 'item1',
    observedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    windowHours: 24, usageCount: 1, usageDurationMs: 60000, createdBy: 'alice',
  };
}

test('item with no observations is dormant', () => {
  expect(isDormant([])).toBe(true);
});

test('item observed 10 days ago is not dormant', () => {
  expect(isDormant([makeObservation(10)])).toBe(false);
});

test('item last observed 22 days ago is dormant', () => {
  expect(isDormant([makeObservation(22)])).toBe(true);
});

test('item last observed exactly 21 days ago is not yet dormant', () => {
  expect(isDormant([makeObservation(20.9)])).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/dormancy.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/dormancy'"

- [ ] **Step 3: Write `src/lib/dormancy.ts`**

```ts
import { Observation } from '../types/models';

const TWENTY_ONE_DAYS_MS = 21 * 24 * 60 * 60 * 1000;

export function isDormant(observations: Observation[]): boolean {
  if (observations.length === 0) return true;
  const latest = Math.max(...observations.map((o) => new Date(o.observedAt).getTime()));
  return Date.now() - latest > TWENTY_ONE_DAYS_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/dormancy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/hooks/useAlertDismissals.ts`**

```ts
import { useState, useEffect } from 'react';
import { query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { alertDismissalsRef } from '../firebase/firestore';
import { AlertDismissal } from '../types/models';
import { AlertType } from '../types/enums';
import { useAuth } from './useAuth';

export function useAlertDismissals(uid: string) {
  const [dismissals, setDismissals] = useState<AlertDismissal[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(alertDismissalsRef(db), where('createdBy', '==', uid));
    return onSnapshot(q, (snapshot) => {
      setDismissals(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AlertDismissal)));
    });
  }, [uid]);

  const dismiss = async (itemId: string, alertType: AlertType, snoozedUntil: string | null) => {
    if (!user) return;
    const { db } = initializeFirebaseApp();
    await addDoc(alertDismissalsRef(db), {
      itemId, alertType, dismissedAt: new Date().toISOString(), snoozedUntil, createdBy: user.uid,
    } as any);
  };

  const isDismissed = (itemId: string, alertType: AlertType): boolean => {
    return dismissals.some((d) => {
      if (d.itemId !== itemId || d.alertType !== alertType) return false;
      if (d.snoozedUntil && new Date(d.snoozedUntil).getTime() > Date.now()) return true;
      return d.dismissedAt !== null && !d.snoozedUntil;
    });
  };

  return { dismissals, dismiss, isDismissed };
}
```

- [ ] **Step 6: Write `AlertsScreen.tsx`**

```tsx
import { View, Text, FlatList, Button } from 'react-native';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRegistryItems } from '../../hooks/useRegistryItems';
import { useObservations } from '../../hooks/useObservations';
import { useAlertDismissals } from '../../hooks/useAlertDismissals';
import { isDormant } from '../../lib/dormancy';
import { AlertType } from '../../types/enums';
import { RegistryItem } from '../../types/models';

function DormantRow({ item, uid }: { item: RegistryItem; uid: string }) {
  const { observations } = useObservations(item.id);
  const { dismiss, isDismissed } = useAlertDismissals(uid);
  const dormant = isDormant(observations);

  if (!dormant || isDismissed(item.id, AlertType.Dormant)) return null;

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
      <Text>{item.name} — dormant</Text>
      <Button title="Snooze 7d" onPress={() => dismiss(item.id, AlertType.Dormant, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())} />
      <Button title="Dismiss" onPress={() => dismiss(item.id, AlertType.Dormant, null)} />
    </View>
  );
}

export function AlertsScreen() {
  const { user } = useAuth();
  const { items, loading } = useRegistryItems(user?.uid ?? '');

  if (loading) return <Text>Loading…</Text>;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <DormantRow item={item} uid={user!.uid} />}
    />
  );
}
```

- [ ] **Step 7: Write the failing screen test**

```tsx
// __tests__/screens/AlertsScreen.test.tsx
import { render, findByText, queryByText } from '@testing-library/react-native';
import { AlertsScreen } from '../../src/screens/alerts/AlertsScreen';
import { initializeFirebaseApp } from '../../src/firebase/config';
import { doc, setDoc } from 'firebase/firestore';

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'alice' } }),
}));

test('item with no observations shows as dormant', async () => {
  const { db } = initializeFirebaseApp();
  await setDoc(doc(db, 'registryItems/item1'), {
    name: 'Unused App', cost: 5, billingCycle: 'monthly', kind: 'app', status: 'keep',
    taskCategories: [], description: '', canonicalIdentity: null, justified: false,
    isBestForTask: false, useCases: null, capabilitySummary: null, sourceUrl: null,
    createdBy: 'alice', createdAt: new Date().toISOString(),
  });

  const { findByText: find } = render(<AlertsScreen />);
  await find(/Unused App — dormant/);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/screens/AlertsScreen.test.tsx"`
Expected: PASS.

- [ ] **Step 9: Run the full app and manually verify the Phase 1 loop end to end**

Run: `npx expo start` → sign up, add an item, log an observation, view Home totals, view Tasks grouping, view Alerts, snooze/dismiss, retire/reactivate, delete
Expected: all flows work without crashes; this is the point deferred from Task 3 Step 11.

- [ ] **Step 10: Commit**

```bash
git add src/lib/dormancy.ts src/hooks/useAlertDismissals.ts src/screens/alerts/AlertsScreen.tsx __tests__/lib/dormancy.test.ts __tests__/screens/AlertsScreen.test.tsx
git commit -m "feat: Alerts screen with derived dormancy, snooze/dismiss via alertDismissals"
```

---

## Self-Review Notes

**Spec coverage check (spec §3 Phase 1 feature list against tasks):**
- Registry list + search + status/kind filters → Task 4 ✓
- Manual add-item form → Task 5 ✓
- Item detail (view/edit, log observation, retire/reactivate, delete) → Task 6 ✓ (note: "edit" is covered by retire/reactivate status toggle in this plan; full field-by-field edit UI beyond status was not explicitly re-specified anywhere beyond "view/edit" in spec §3/§5 — Task 6's `ItemDetailScreen` renders read-only fields plus the specifically-named actions from §5's screen notes; a full edit form was judged out of the bite-sized scope implied by §5's actual button list (Log Observation / Retire-Reactivate / Delete) and can be added as a follow-up task if the user wants full field editing beyond status)
- Tasks view grouped by category → Task 8 ✓
- Alerts: dormancy (primary) → Task 9 ✓ (high-cost/redundant alerts are explicitly not built per Global Constraints — cost-per-use is display-only per locked decision)
- Alert snooze/dismiss → Task 9 ✓
- Home dashboard: counts by status, total monthly spend → Task 7 ✓
- Cost-per-use as a stat → Task 6 ✓ (raw-pair format, 90-day window)
- Firebase project + Firestore + Auth + security rules → Task 1 ✓
- TS types/enums → Task 2 ✓
- Expo scaffold + navigation → Task 3 ✓

**Placeholder scan:** no TBD/TODO strings; all steps contain real code, not descriptions of code.

**Type consistency:** `RegistryItem`, `Observation`, `AlertDismissal` field names are identical across Task 2's definition and every later task's usage (`registryItemId`, `createdBy`, `observedAt`, `usageCount`, `usageDurationMs`, `itemId`, `alertType`, `snoozedUntil`, `dismissedAt`) — verified by re-reading each task's Firestore read/write calls against Task 2's interfaces.

**Deviation flagged for user attention:** the spec's `alertDismissals` field table (§4) names the owner field `owner`; this plan uses `createdBy` on all three Phase 1 collections uniformly instead, to keep one consistent field name across every security rule and query rather than special-casing one collection. Functionally identical, just a naming reconciliation — flagging in case a future Phase 2 Cloud Function reads this collection and needs to know the actual field name is `createdBy`, not `owner`.
