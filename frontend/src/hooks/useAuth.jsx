import { useState, useEffect, createContext, useContext } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Fetch or create user doc
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          let userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            photoURL: firebaseUser.photoURL,
            lastSeen: serverTimestamp()
          };
          
          if (!userSnap.exists()) {
            userData.createdAt = serverTimestamp();
            await setDoc(userRef, userData, { merge: true });
          } else {
            userData = { ...userData, ...userSnap.data() };
            await setDoc(userRef, { lastSeen: serverTimestamp() }, { merge: true });
          }
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Firestore Error in Auth Hook:", err);
        // Fallback: still set the user so the app doesn't crash, even if DB fails
        if (firebaseUser) {
           setUser({ uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.email.split('@')[0] });
        }
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signup = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  // Update display name and/or photoURL in Firebase Auth, Firestore, and local state
  const updateUserProfile = async (updates) => {
    const authUpdates = {};
    if (updates.displayName !== undefined) authUpdates.displayName = updates.displayName;
    if (updates.photoURL !== undefined) authUpdates.photoURL = updates.photoURL;

    // Firebase Auth only accepts real URLs, not base64 data URLs
    const authSafeUpdates = {};
    if (authUpdates.displayName) authSafeUpdates.displayName = authUpdates.displayName;
    if (authUpdates.photoURL && !authUpdates.photoURL.startsWith('data:')) authSafeUpdates.photoURL = authUpdates.photoURL;
    if (Object.keys(authSafeUpdates).length > 0) {
      await updateProfile(auth.currentUser, authSafeUpdates);
    }

    const token = await auth.currentUser.getIdToken();
    await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    });

    setUser(prev => ({ ...prev, ...updates }));
  };
  
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, resetPassword, loginWithGoogle, updateUserProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
