// src/pages/login.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// Generate a random 8-char public ID like "AB12CD34"
function generatePublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If already logged in, go straight to library
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/');
      } else {
        setCheckingAuth(false);
      }
    });
    return unsub;
  }, [router]);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        router.replace('/');
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid;
        const publicId = generatePublicId();
        const libraryId = uid;

        // Create the library document
        await setDoc(doc(db, 'libraries', libraryId), {
          ownerId: uid,
          name: `${displayName.trim()}'s Library`,
          totalRows: 0,
          columnsPerRow: 10,
          members: {
            [uid]: {
              role: 'owner',
              joinedAt: serverTimestamp(),
              displayName: displayName.trim(),
            },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Create the user profile
        await setDoc(doc(db, 'users', uid), {
          uid,
          displayName: displayName.trim(),
          email: email.trim(),
          publicId,
          libraryId,
          joinedLibraryId: null,
          role: 'owner',
          createdAt: serverTimestamp(),
          avatarUrl: null,
        });

        router.replace('/');
      }
    } catch (err: any) {
      const msg = err?.code ?? '';
      if (msg === 'auth/user-not-found' || msg === 'auth/wrong-password' || msg === 'auth/invalid-credential') {
        setError('Incorrect email or password.');
      } else if (msg === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try logging in.');
      } else if (msg === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div style={styles.fullPage}>
        <span style={{ fontSize: 40 }}>🕯️</span>
      </div>
    );
  }

  return (
    <div style={styles.fullPage}>
      <div style={styles.bgText}>📚</div>

      <div style={styles.card}>
        <h1 style={styles.gothic}>📚 The Medieval Library</h1>
        <p style={styles.subtitle}>
          {mode === 'login' ? 'Enter the archive' : 'Register as a new scholar'}
        </p>

        {/* Mode toggle */}
        <div style={styles.toggleRow}>
          <button
            style={{ ...styles.toggleBtn, ...(mode === 'login' ? styles.toggleActive : {}) }}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign In
          </button>
          <button
            style={{ ...styles.toggleBtn, ...(mode === 'signup' ? styles.toggleActive : {}) }}
            onClick={() => { setMode('signup'); setError(''); }}
          >
            Register
          </button>
        </div>

        <div style={styles.form}>
          {mode === 'signup' && (
            <div style={styles.field}>
              <label style={styles.label}>YOUR NAME</label>
              <input
                style={styles.input}
                type="text"
                placeholder="e.g. Friar Aldric"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoComplete="name"
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>EMAIL</label>
            <input
              style={styles.input}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PASSWORD</label>
            <input
              style={styles.input}
              type="password"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            style={{ ...styles.submitBtn, opacity: loading ? 0.6 : 1 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading
              ? '⌛ One moment...'
              : mode === 'login'
              ? '🕯️ Enter the Library'
              : '📜 Create My Library'}
          </button>
        </div>

        <p style={styles.switchText}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            style={styles.switchLink}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Register here' : 'Sign in instead'}
          </button>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  fullPage: {
    minHeight: '100vh',
    background: '#1A0E06',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Crimson Text', Georgia, serif",
    padding: '20px',
    position: 'relative',
    overflow: 'hidden',
  },
  bgText: {
    position: 'absolute',
    fontSize: '300px',
    opacity: 0.03,
    userSelect: 'none',
    pointerEvents: 'none',
  },
  card: {
    background: 'linear-gradient(160deg, #2C1A0E 0%, #1A0E06 100%)',
    border: '1px solid rgba(200, 168, 75, 0.3)',
    borderRadius: '8px',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
    position: 'relative',
    zIndex: 1,
  },
  gothic: {
    fontFamily: "'Cinzel', 'Times New Roman', serif",
    fontSize: '22px',
    color: '#C8A84B',
    textAlign: 'center',
    marginBottom: '6px',
    letterSpacing: '0.05em',
  },
  subtitle: {
    textAlign: 'center',
    color: 'rgba(212, 196, 160, 0.6)',
    fontSize: '14px',
    marginBottom: '24px',
    fontStyle: 'italic',
  },
  toggleRow: {
    display: 'flex',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid rgba(200,168,75,0.2)',
    marginBottom: '28px',
  },
  toggleBtn: {
    flex: 1,
    padding: '9px',
    background: 'transparent',
    border: 'none',
    color: 'rgba(212,196,160,0.5)',
    cursor: 'pointer',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    letterSpacing: '0.08em',
    transition: 'all 0.15s',
  },
  toggleActive: {
    background: 'rgba(200,168,75,0.15)',
    color: '#C8A84B',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '10px',
    color: '#C8A84B',
    letterSpacing: '0.12em',
    fontFamily: "'Cinzel', serif",
  },
  input: {
    background: 'rgba(10,5,2,0.6)',
    border: '1px solid rgba(200,168,75,0.25)',
    borderRadius: '4px',
    color: '#F4E8C1',
    fontFamily: "'Crimson Text', Georgia, serif",
    fontSize: '15px',
    padding: '10px 14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  error: {
    color: '#E57373',
    fontSize: '13px',
    textAlign: 'center',
    padding: '8px 12px',
    background: 'rgba(192,57,43,0.1)',
    borderRadius: '4px',
    border: '1px solid rgba(229,115,115,0.2)',
    margin: 0,
  },
  submitBtn: {
    background: 'linear-gradient(180deg, #C8A84B 0%, #A87830 100%)',
    color: '#1A0E06',
    fontFamily: "'Cinzel', serif",
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '12px 24px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    marginTop: '4px',
    width: '100%',
  },
  switchText: {
    textAlign: 'center',
    marginTop: '20px',
    fontSize: '13px',
    color: 'rgba(212,196,160,0.5)',
    margin: '20px 0 0 0',
  },
  switchLink: {
    background: 'none',
    border: 'none',
    color: '#C8A84B',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'inherit',
    textDecoration: 'underline',
    padding: 0,
  },
};