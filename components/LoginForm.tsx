"use client";

import { useState } from "react";

interface LoginFormProps {
  onCancel?: () => void;
  cancelLabel?: string;
  autoFocus?: boolean;
  className?: string;
}

export function LoginForm({
  onCancel,
  cancelLabel = "Скрыть",
  autoFocus = false,
  className = "",
}: LoginFormProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;

    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || "Неверный логин или пароль");
        return;
      }

      document.cookie = `client_uuid=${data.client_uuid}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `display_name=${data.display_name || ""}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `access_token=${data.access_token || ""}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("client_uuid", data.client_uuid);
      localStorage.setItem("display_name", data.display_name || "");
      localStorage.setItem("access_token", data.access_token || "");

      window.location.href = "/";
    } catch {
      setLoginError("Ошибка соединения");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className={`flex flex-col gap-3 ${className}`}>
      <input
        type="email"
        value={loginEmail}
        onChange={(e) => setLoginEmail(e.target.value)}
        placeholder="Логин (email)"
        required
        autoFocus={autoFocus}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
        disabled={loginLoading}
      />
      <input
        type="password"
        value={loginPassword}
        onChange={(e) => setLoginPassword(e.target.value)}
        placeholder="Пароль"
        required
        minLength={6}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
        disabled={loginLoading}
      />
      {loginError && <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loginLoading || !loginEmail.trim() || !loginPassword}
          className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loginLoading ? "Вхожу..." : "Войти"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  );
}
