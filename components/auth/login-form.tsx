"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (!response.ok) {
      setError("Token không hợp lệ.");
      return;
    }
    window.location.href = next;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="panel w-full max-w-sm rounded-lg p-5">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-bold">Admin Access</h1>
        <p className="mt-1 text-sm text-muted">Enter the configured admin token.</p>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          type="password"
          className="mt-4 w-full rounded-md border border-line px-3 py-2"
          autoFocus
        />
        {error ? <div className="mt-2 text-sm text-coral">{error}</div> : null}
        <button className="mt-4 w-full rounded-md bg-brand px-3 py-2 font-medium text-white">Continue</button>
      </form>
    </main>
  );
}
