import React, { useState } from 'react';
import './login.css';
import { signInWithGoogle, signInEmail, createUserEmail, authAvailable } from './firebase';

export default function Login({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setError('Les mots de passe ne correspondent pas');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Le mot de passe doit contenir au moins 6 caractères');
          setLoading(false);
          return;
        }
        const result = await createUserEmail(email, password);
        onLoginSuccess(result.user);
      } else {
        const result = await signInEmail(email, password);
        onLoginSuccess(result.user);
      }
    } catch (err) {
      const errorMessages = {
        'auth/email-already-in-use': 'Cet e-mail est déjà utilisé',
        'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères',
        'auth/invalid-email': 'E-mail invalide',
        'auth/user-not-found': 'Utilisateur non trouvé',
        'auth/wrong-password': 'Mot de passe incorrect',
        'auth/too-many-login-attempts': 'Trop de tentatives, réessayez plus tard'
      };
      setError(errorMessages[err.code] || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      onLoginSuccess(result.user);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Erreur de connexion Google: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-background"></div>
      <div className="login-card">
        <div className="login-header">
          <h1>App Achat Revente</h1>
          <p>Gestion commerciale simplifiée</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleEmailAuth} className="login-form">
          <h2>{isSignUp ? 'Créer un compte' : 'Se connecter'}</h2>

          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />

          {isSignUp && (
            <input
              type="password"
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          )}

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Chargement...' : isSignUp ? 'Créer un compte' : 'Se connecter'}
          </button>
        </form>

        {authAvailable && (
          <>
            <div className="login-divider">
              <span>ou</span>
            </div>

            <button onClick={handleGoogleLogin} disabled={loading} className="btn-google">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              {loading ? 'Chargement...' : 'Se connecter avec Google'}
            </button>
          </>
        )}

        <div className="login-toggle">
          <p>
            {isSignUp ? 'Vous avez déjà un compte?' : 'Pas encore de compte?'}
            {' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="toggle-btn"
            >
              {isSignUp ? 'Se connecter' : "S'inscrire"}
            </button>
          </p>
        </div>

        <div className="login-demo-mode">
          <p className="demo-text">Ou continuer sans compte</p>
          <button
            type="button"
            onClick={() => onLoginSuccess(null)}
            className="btn-demo"
          >
            Mode démo
          </button>
        </div>
      </div>
    </div>
  );
}
