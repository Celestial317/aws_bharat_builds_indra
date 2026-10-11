import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile, getUserProfile } from '../lib/firestore';
import { UserProfile, CreateUserData } from '../types/database';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signup: (data: CreateUserData) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** One-click demo: signs in (creating on first use) the shared demo droplet. */
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUserProfile: () => Promise<void>;
}

export const DEMO_DATA: CreateUserData = {
  email: 'demo@indra.app',
  password: 'Demo@12345',
  name: 'Demo Droplet',
  pincode: '411001',
  state: 'Maharashtra',
  district: 'Pune',
  n_members: 4,
  catchment_area: 120,
  farmland_area: 2000,
  roof_type: 'Flat',
  roof_material: 'RCC',
  budget: 50000,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function firebaseCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch user profile from Firestore
        try {
          const profile = await getUserProfile(firebaseUser.uid);
          setUserProfile(profile);
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Signup with email and password
  const signup = async (data: CreateUserData) => {
    setLoading(true);
    setError(null);
    
    try {
      // Create Firebase auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        data.email, 
        data.password
      );
      
      // Update display name
      await updateProfile(userCredential.user, {
        displayName: data.name
      });
      
      // Create user profile in Firestore
      await createUserProfile(userCredential.user.uid, {
        email: data.email,
        name: data.name,
        pincode: data.pincode,
        state: data.state,
        district: data.district,
        n_members: data.n_members,
        catchment_area: data.catchment_area,
        farmland_area: data.farmland_area,
        roof_type: data.roof_type,
        roof_material: data.roof_material,
        budget: data.budget
      });
      
      // Fetch the created profile
      const profile = await getUserProfile(userCredential.user.uid);
      setUserProfile(profile);
      
    } catch (err) {
      console.error('Signup error:', err);
      setError(getAuthErrorMessage(firebaseCode(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Login with email and password
  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Fetch user profile
      const profile = await getUserProfile(userCredential.user.uid);
      setUserProfile(profile);
      
    } catch (err) {
      console.error('Login error:', err);
      setError(getAuthErrorMessage(firebaseCode(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Demo account: log in, or create it the first time.
  const demoLogin = async () => {
    try {
      await login(DEMO_DATA.email, DEMO_DATA.password);
    } catch (err) {
      const code = firebaseCode(err);
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') {
        await signup(DEMO_DATA);
      } else {
        throw err;
      }
    }
  };

  // Logout
  const logout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Clear error
  const clearError = () => setError(null);

  // Refresh user profile
  const refreshUserProfile = async () => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    }
  };

  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    error,
    signup,
    login,
    demoLogin,
    logout,
    clearError,
    refreshUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper function to get user-friendly error messages
function getAuthErrorMessage(errorCode: string | undefined): string {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please login instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/invalid-credential':
      return 'Invalid credentials. Please check your email and password.';
    default:
      return errorCode ? `Sign-in failed (${errorCode}). Please try again.` : 'An error occurred. Please try again.';
  }
}
