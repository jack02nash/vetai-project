import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import './AuthForm.css';

function AuthForm({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Set persistence based on remember me choice
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

      if (isLogin) {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Sign up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user profile document
        const userRef = doc(db, 'users', userCredential.user.uid);
        await setDoc(userRef, {
          email: email,
          createdAt: serverTimestamp(),
          subscription: {
            plan: 'free',
            validUntil: null
          },
          settings: {
            theme: 'light',
            notifications: true
          }
        }, { merge: true });
      }

      onAuthSuccess();
    } catch (err) {
      let errorMessage = 'An error occurred. Please try again.';
      
      // Handle specific error cases
      switch (err.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'This email is already registered. Please log in instead.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters long.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = 'Invalid email or password.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
        default:
          console.error('Auth error:', err);
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
      <p className="auth-subtitle">
        {isLogin 
          ? 'Sign in to access your conversations and preferences' 
          : 'Sign up to start your personalized AI assistant experience'}
      </p>
      
      <form onSubmit={handleAuth}>
        {error && <div className="error-message">{error}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
        </div>

        {isLogin && (
          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Keep me signed in
            </label>
          </div>
        )}

        <button type="submit" disabled={loading} className="auth-button">
          {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
        </button>
      </form>

      <p className="auth-switch">
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <button 
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
          }}
          className="switch-button"
        >
          {isLogin ? 'Sign Up' : 'Sign In'}
        </button>
      </p>
    </div>
  );
}

export default AuthForm;
