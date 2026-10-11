import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBHpC9Gauv-LCPXBSKfrkmGcT_2sxvEUv0",
  authDomain: "indra-164b4.firebaseapp.com",
  projectId: "indra-164b4",
  storageBucket: "indra-164b4.firebasestorage.app",
  messagingSenderId: "78205962426",
  appId: "1:78205962426:web:62005752d29c47dbc45a83",
  measurementId: "G-LCV99K9VF9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize analytics conditionally (only in browser)
export const initAnalytics = async () => {
  if (await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};

export default app;
