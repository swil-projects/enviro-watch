"use client";

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import "./login.css";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="ew-login-form"
      aria-busy={pending}
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        try {
          const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
          if (res.ok) {
            const next = new URLSearchParams(window.location.search).get("next");
            window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
            return;
          }
          const body = await res.json().catch(() => null);
          setError(body?.error?.message ?? "Sign-in failed. Check your credentials and try again.");
        } catch {
          setError("Unable to connect. Check your connection and try again.");
        }
        setPending(false);
      }}
    >
      <div className="ew-login-field">
        <label htmlFor="username">Username</label>
        <div className="ew-login-inputWrap">
          <UserRound size={18} aria-hidden />
          <input id="username" name="username" autoComplete="username" placeholder="Enter your username" required disabled={pending} aria-describedby={error ? "login-error" : undefined} />
        </div>
      </div>
      <div className="ew-login-field">
        <label htmlFor="password">Password</label>
        <div className="ew-login-inputWrap">
          <LockKeyhole size={18} aria-hidden />
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required disabled={pending} aria-describedby={error ? "login-error" : undefined} />
          <button className="ew-login-reveal" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {error && <p id="login-error" role="alert" className="ew-login-error">{error}</p>}
      <button type="submit" className="ew-login-submit" disabled={pending}>
        <span>{pending ? "Signing in…" : "Sign in"}</span>
        {pending ? <LoaderCircle className="ew-login-spinner" size={18} aria-hidden /> : <ArrowRight size={18} aria-hidden />}
      </button>
    </form>
  );
}
