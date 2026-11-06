
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const form = e.currentTarget;
    const data = new FormData(form);

    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setMessage("Your password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

if (error) {
  console.error("Supabase registration error:", error);

  console.error("Error details:", {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
  });

  setMessage(
    error.message || "Registration failed. Please try again."
  );

  return;
}

      if (result.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setMessage(
          "Your account was created! Please check your email and click the confirmation link before signing in."
        );
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
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
            <span>I agree to the Terms and Privacy Policy</span>
          </label>

          {message && (
            <p
              role="status"
              style={{ fontSize: 13, color: "#635bdb" }}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Create account"}
            {!isLoading && <span>→</span>}
          </button>
        </form>

        <p className="register-text">
          Already have an account?{" "}
          <Link href="/">Sign in</Link>
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
