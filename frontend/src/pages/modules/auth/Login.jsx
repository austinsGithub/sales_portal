import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/contexts/AuthContext";
import "../../../css/login/Login.css"; // We will update this CSS file

// ────────────────────────────────────────────────────────────
//   Icons
// ────────────────────────────────────────────────────────────
function EyeIcon({ open }) {
  // This component is unchanged
  return open ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22"/><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C7 19 2.73 15.11 1 12c.74-1.32 1.81-2.87 3.11-4.19M9.53 9.53A3.5 3.5 0 0 1 12 8.5c2.21 0 4 1.79 4 4 0 .47-.08.92-.22 1.34"/></svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
  );
}

// ────────────────────────────────────────────────────────────
//   Component
// ────────────────────────────────────────────────────────────
function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // ──────────────────────────────────────────────────────────
  //   Handlers
  // ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await login({ email, password });
      
      if (!result.success) {
        setError(result.error || "Login failed");
        setLoading(false);
        return;
      }
      
      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 100);
    } catch (err) {
      setError(err.message || "Network error");
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  //   Render
  // ──────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-background">
        <svg
          className="login-background__svg"
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="orbGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2564b6ff" />
              <stop offset="45%" stopColor="#043f86ff" />
              <stop offset="100%" stopColor="#c7d2fe" />
            </linearGradient>
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#003d7aff" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#242d4dff" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <circle className="orb orb-1" cx="120" cy="160" r="140" fill="url(#orbGradient)" />
          <circle className="orb orb-2" cx="680" cy="80" r="110" fill="url(#orbGradient)" />
          <circle className="orb orb-3" cx="640" cy="420" r="160" fill="url(#orbGradient)" />
          <path
            className="wave wave-1"
            fill="url(#waveGradient)"
            d="M0 350 Q200 310 400 360 T800 340 V600 H0Z"
          />
          <path
            className="wave wave-2"
            fill="url(#waveGradient)"
            d="M0 420 Q220 460 420 420 T800 430 V600 H0Z"
          />
        </svg>
      </div>

      <div className="login-grid">
        <div className="login-hero">
          <span className="login-hero__badge">Casetray.com</span>
          <h4 className="login-hero__subtext">Unified revenue + inventory workspace</h4>
          <h1>
            Secure inventory insight
            <span>built for modern operations</span>
          </h1>
          <p>
            Manage transfer orders, lot traceability, and approvals with a single connected workspace.
            Stay audit-ready with live telemetry and role-based access.
          </p>
          <ul className="login-hero__perks">
            <li>End-to-end visibility</li>
            <li>Blueprint driven loadouts</li>
            <li>Secure SSO authentication</li>
          </ul>
        </div>

        <div className="login-card login-card--animated">
        
        {/* ✨ UPDATED: Icon is now in a gradient circle */}
        <div className="login-card__icon">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Note: The circle 'fill' is removed, it's handled by the CSS background */}
            <path d="M16 32L32 16M16 16h16v16" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="login-card__title">Welcome back to Casetray</h2>
        <p className="login-card__subtitle">Log in with your casetray.com credentials</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Email */}
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email Address</label>
            <input
              type="email"
              id="email"
              className={`form-input${error ? " error" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <div className="form-input-group">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className={`form-input${error ? " error" : ""}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="show-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={loading}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="form-options">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
              />
              <span className="checkmark" />
              Remember me
            </label>
            <a href="/forgot-password" className="forgot-password-link">Forgot Password?</a>
          </div>

          <button type="submit" className={`login-button${loading ? " loading" : ""}`} disabled={loading}>
            {loading ? "Signing In…" : "Sign In"}
          </button>
        </form>

        <p className="signup-text">
          Don’t have an account? <a href="/signup" className="signup-link">Sign Up</a>
        </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
