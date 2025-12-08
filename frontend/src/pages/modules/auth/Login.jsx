import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/contexts/AuthContext";
import "../../../css/login/Login.css"; // We will update this CSS file - I will move this into the auth folder


function EyeIcon({ open }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");


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

  return (
    <div className="login-page">
      <div className="login-background"></div>

      <div className="login-container">
        <div className="login-left">
          <div className="login-brand">
            <h1 className="brand-logo">Traycase.com</h1>
          </div>

          <div className="login-content">
            <h2 className="login-title">Welcome back!</h2>
            <p className="login-subtitle">We are glad to see you again!<br />Please, enter your details</p>

            {error && <div className="error-message">{error}</div>}

            <div className="social-login-buttons">
              <button type="button" className="social-btn">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.167.282-1.707V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.335z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Log in with Google
              </button>
              <button type="button" className="social-btn">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M14.94 15.315c-.643.878-1.425 1.117-2.107.677-.755-.463-1.425-.51-2.203-.023-.993.604-1.516.439-2.086-.023-3.225-3.27-2.754-8.265.93-8.506 1.425-.093 2.387.788 3.202.857.97-.186 1.91-1.022 2.95-.93 1.24.116 2.178.695 2.787 1.72-2.634 1.557-2.016 5.597.527 6.664-.486 1.254-1.116 2.496-2 3.564zM11.73 5.4c-.116-1.766 1.447-3.225 3.178-3.4.232 1.975-1.794 3.563-3.178 3.4z" fill="currentColor"/>
                </svg>
                Log in with Apple
              </button>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email *</label>
                <input
                  type="email"
                  id="email"
                  className={`form-input${error ? " error" : ""}`}
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">Password *</label>
                <div className="form-input-group">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    className={`form-input${error ? " error" : ""}`}
                    placeholder="Enter your password"
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

              <div className="form-options">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  Remember me
                </label>
                <a href="/forgot-password" className="forgot-password-link">Forgot Password?</a>
              </div>

              <button type="submit" className={`login-button${loading ? " loading" : ""}`} disabled={loading}>
                {loading ? "Signing In..." : "Login"}
              </button>
            </form>

            <p className="signup-text">
              Don't have an account? <a href="/signup" className="signup-link">Sign up</a>
            </p>
          </div>
        </div>

        <div className="login-right">
          <div className="dashboard-preview">
            <img
              src="/loginPage/phonePNG.png"
              alt="Traycase Dashboard Preview"
              className="preview-image"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
