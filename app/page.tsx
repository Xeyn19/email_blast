
"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">
          <div className="brand-icon">E</div>
          <span>Email<span className="brand-highlight">Blast</span></span>
        </div>

        <div className="login-heading">
          <p className="eyebrow">WELCOME BACK</p>
          <h1>Sign in to your account</h1>
          <p className="subtitle">
            Manage your campaigns and connect with your audience.
          </p>
        </div>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            alert("Login UI only. Authentication is not connected yet.");
          }}
        >
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
            <div className="password-label">
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  alert("Password recovery will be added later.")
                }
              >
                Forgot password?
              </button>
            </div>

            <div className="password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="show-password"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <label className="remember-row">
            <input type="checkbox" name="remember" />
            <span>Remember me</span>
          </label>

          <button type="submit" className="submit-button">
            Sign in <span>→</span>
          </button>
        </form>

        <p className="register-text">
          Don&apos;t have an account?{" "}
          <Link href="/register">Create an account</Link>
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
            Make every
            <br />
            email <span>count.</span>
          </h2>

          <p>
            Plan your campaigns, organize your audience,
            and build better email experiences—all in one place.
          </p>

          <div className="preview-card">
            <div className="preview-top">
              <div>
                <span className="preview-label">CAMPAIGN OVERVIEW</span>
                <h3>Stay in the loop</h3>
              </div>
              <div className="preview-icon">✉</div>
            </div>
            <div className="preview-line" />
            <div className="preview-bottom">
              <div>
                <strong>Campaigns</strong>
                <span>Manage your outreach</span>
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
