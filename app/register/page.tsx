
"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const data = new FormData(form);

    const password = data.get("password");
    const confirmPassword = data.get("confirmPassword");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setMessage("Demo only! Registration is not connected yet.");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">
          <div className="brand-icon">E</div>
          <span>
            Email<span className="brand-highlight">Blast</span>
          </span>
        </div>

        <div className="login-heading">
          <p className="eyebrow">GET STARTED</p>
          <h1>Create your account</h1>
          <p className="subtitle">
            Start organizing your email campaigns in one place.
          </p>
        </div>

        <form className="login-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Your full name"
              autoComplete="name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="show-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <label className="remember-row">
            <input type="checkbox" required />
            <span>I agree to the Terms and Privacy Policy (demo)</span>
          </label>

          {message && (
            <p role="status" style={{ fontSize: 13, color: "#635bdb" }}>
              {message}
            </p>
          )}

          <button type="submit" className="submit-button">
            Create account <span>→</span>
          </button>
        </form>

        <p className="register-text">
          Already have an account?{" "}
          <Link href="/login">Sign in</Link>
        </p>

        <div className="login-footer">
          EmailBlast · Campaign management made simple
        </div>
      </section>

      <aside className="login-aside">
        <div className="aside-content">
          <div className="aside-tag">
            <span className="status-dot" />
            YOUR CAMPAIGNS, SIMPLIFIED
          </div>

          <h2>
            Reach your
            <br />
            audience <span>better.</span>
          </h2>

          <p>
            Bring your campaign workflow together.
            Organize contacts, prepare messages, and
            plan thoughtful email outreach.
          </p>

          <div className="preview-card">
            <div className="preview-top">
              <div>
                <span className="preview-label">YOUR WORKSPACE</span>
                <h3>Everything in one place</h3>
              </div>
              <div className="preview-icon">✉</div>
            </div>
            <div className="preview-line" />
            <div className="preview-bottom">
              <div>
                <strong>Campaign management</strong>
                <span>One workspace for your ideas</span>
              </div>
              <div className="preview-arrow">↗</div>
            </div>
          </div>
        </div>
        <div className="aside-footer">
          Thoughtful outreach starts here.
        </div>
      </aside>
    </main>
  );
}
