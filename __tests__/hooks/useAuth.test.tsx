import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';

test('starts in loading state and resolves to signed-out', async () => {
  // Note: this RNTL version's renderHook is async (returns Promise<RenderHookResult>),
  // unlike the brief's synchronous assumption — awaited here to match the installed API.
  const { result } = await renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user).toBeNull();
});

// NOTE: A signUp/logOut round-trip test intentionally does NOT live here.
// `jest-expo`'s test environment stubs React Native's native networking module
// (see @react-native/jest-preset), so `fetch` calls never reach a real host —
// confirmed by direct debugging: `fetch('http://127.0.0.1:9099/')` resolves
// with `status: undefined` instead of a real response. That means this loading
// -state assertion is the only meaningful thing this RN-rendered hook test can
// prove; it never exercises the network, so it passes identically with or
// without the Auth emulator running (verified). The real emulator round-trip
// (which DOES require and prove live emulator connectivity) lives in
// `__tests__/firebase/useAuth.emulator.test.ts`, run under the `node` Jest
// project where `fetch` is real. See that file for the TDD fail/pass evidence.
