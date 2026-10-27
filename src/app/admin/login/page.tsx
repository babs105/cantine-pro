"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { loginAdminAction } from "../actions";

export default function AdminLoginPage() {
  const [state, formAction, isPending] = useActionState(loginAdminAction, undefined);

  return (
    <div className="min-h-screen bg-neutral-900 px-4 py-10 flex items-center justify-center">
      <form action={formAction} className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4">
        <h1 className="text-lg font-extrabold text-neutral-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-orange-600" />
          Console SuperAdmin
        </h1>
        {state?.error && (
          <p className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">{state.error}</p>
        )}
        <input
          type="password"
          name="code"
          required
          autoComplete="current-password"
          placeholder="Code SuperAdmin"
          className="w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl"
        >
          {isPending ? "Connexion..." : "Entrer"}
        </button>
      </form>
    </div>
  );
}
