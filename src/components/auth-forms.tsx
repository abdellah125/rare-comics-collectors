"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { TextField } from "@/components/form-fields";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";

function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="lg:col-span-7">
        <h1 className="font-display text-3xl font-semibold text-ink-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{lead}</p>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6 sm:p-7">{children}</div>
        <p className="mt-5 text-sm text-ink-600">{footer}</p>
      </div>

      <aside className="lg:col-span-5">
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-6">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
            <ShieldIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink-950">What an account gets you</h2>
          <ul className="mt-4 grid gap-3 text-[14px] leading-relaxed text-ink-700">
            {[
              "Track orders and submissions in one place",
              "Live grading status — received, pressed, submitted, graded, shipped",
              "Your appraisal reports and condition documents, permanently archived",
              "Consignment dashboard with views, offers and payouts",
              "Saved addresses and faster checkout",
              "First refusal on books matching your want list",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-500">
            <strong className="text-ink-900">Demo only.</strong> Accounts live in this browser&apos;s local storage —
            nothing is sent to a server, so don&apos;t use a real password. Wire this to NextAuth, Clerk, Supabase or
            your own backend before launch.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* --------------------------------------------------------------- sign in */

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    setLoading(true);
    setError("");
    const user = auth.login(email, password);
    if (user) {
      router.push("/dashboard");
    } else {
      setError("Email or password didn't match. Try goldenageguru@demo.com / demo123.");
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      lead="Access your orders, grading submissions, appraisal reports and consignment dashboard."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/account/register" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Create one
          </Link>{" "}
          — it takes about thirty seconds.
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-5">
        <TextField label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        <TextField label="Password" name="password" type="password" required autoComplete="current-password" />

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-sm text-ink-700">
            <input type="checkbox" name="remember" className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
            Keep me signed in
          </label>
          <Link href="/account/reset" className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={loading} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

/* --------------------------------------------------------------- sign up */

export function RegisterForm() {
  const auth = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const first = String(fd.get("firstName") ?? "").trim();
    const last = String(fd.get("lastName") ?? "").trim();
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    setLoading(true);
    setError("");
    const user = auth.register(`${first} ${last}`.trim(), email, password);
    if (user) {
      router.push("/dashboard");
    } else {
      setError("That email is already registered. Try signing in instead.");
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      lead="One account covers buying, grading submissions, consignment and vault storage."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/account/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Sign in
          </Link>
          .
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="First name" name="firstName" required autoComplete="given-name" />
          <TextField label="Last name" name="lastName" required autoComplete="family-name" />
        </div>
        <TextField label="Email" name="email" type="email" required autoComplete="email" />
        <TextField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
        />

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-600">
          <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
          <span>
            I agree to the{" "}
            <Link href="/policies/terms-of-service" className="underline underline-offset-2">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/policies/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
          </span>
        </label>

        <button type="submit" disabled={loading} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

/* -------------------------------------------------------- password reset */

export function ResetForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState("sending");
    window.setTimeout(() => setState("sent"), 700);
  };

  return (
    <AuthShell
      title="Reset your password"
      lead="Enter the email on your account and we'll send a reset link that expires in fifteen minutes."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/account/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Back to sign in
          </Link>
          .
        </>
      }
    >
      {state === "sent" ? (
        <div className="text-center" role="status">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white">
            <CheckIcon className="h-6 w-6" />
          </span>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">Reset link sent</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-600">
            If that address matches an account, the link is on its way. Check your spam folder if it doesn&apos;t
            arrive within a few minutes.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-5">
          <TextField label="Email" name="email" type="email" required autoComplete="email" />
          <button type="submit" disabled={state === "sending"} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
            {state === "sending" ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
