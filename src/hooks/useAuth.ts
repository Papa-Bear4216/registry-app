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
