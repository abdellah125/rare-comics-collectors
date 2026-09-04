"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { TextField } from "@/components/form-fields";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { loginAction, registerAction, requestPasswordResetAction, resetPasswordAction, verifyTwoFactorAction } from "@/lib/auth/actions";
import type { ActionState } from "@/lib/validation";

function AuthShell({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
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
              "Saved addresses and faster checkout",
              "Order history, invoices and refunds",
              "Two-factor authentication and device management",
              "Apply to sell — listings, payouts and performance in your dashboard",
              "Support tickets linked to your orders",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function FormError({ state }: { state: ActionState<unknown> | undefined }) {
  if (!state || state.ok || !state.message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {state.message}
    </p>
  );
}

export function FormSuccess({ state }: { state: ActionState<unknown> | undefined }) {
  if (!state || !state.ok || !state.message) return null;
  return (
    <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
      {state.message}
    </p>
  );
}

const fieldError = (state: ActionState | undefined, name: string) => (state && !state.ok ? state.errors?.[name] : undefined);

/* --------------------------------------------------------------- sign in */

export function LoginForm({ next, notice }: { next?: string; notice?: string | null }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <AuthShell
      title="Sign in"
      lead="Access your orders, grading submissions, seller dashboard and account security."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Create one
          </Link>{" "}
          — it takes about thirty seconds.
        </>
      }
    >
      <form action={action} className="grid gap-5">
        {next && <input type="hidden" name="next" value={next} />}
        {notice && (
          <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
            {notice}
          </p>
        )}
        <TextField label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" hint={fieldError(state, "email")} />
        <TextField label="Password" name="password" type="password" required autoComplete="current-password" />
        <FormError state={state} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-sm text-ink-700">
            <input type="checkbox" name="remember" className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
            Keep me signed in
          </label>
          <Link href="/account/reset" className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

/* ---------------------------------------------------------- 2FA verify */

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyTwoFactorAction, undefined);
  return (
    <form action={action} className="grid gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        label="Authentication code"
        name="code"
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        placeholder="123 456"
        autoFocus
        hint="Enter the 6-digit code from your authenticator app, or one of your recovery codes."
      />
      <FormError state={state} />
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
        {pending ? "Verifying…" : "Verify and continue"}
      </button>
    </form>
  );
}

/* --------------------------------------------------------------- sign up */

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <AuthShell
      title="Create your account"
      lead="One account covers buying, grading submissions, selling and vault storage."
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
      <form action={action} className="grid gap-5">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="First name" name="firstName" required autoComplete="given-name" hint={fieldError(state, "firstName")} />
          <TextField label="Last name" name="lastName" required autoComplete="family-name" hint={fieldError(state, "lastName")} />
        </div>
        <TextField label="Email" name="email" type="email" required autoComplete="email" hint={fieldError(state, "email")} />
        <TextField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
          hint={fieldError(state, "password") ?? "At least 10 characters with a letter and a number."}
        />
        <FormError state={state} />
        <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-600">
          <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
          <span>
            I agree to the{" "}
            <Link href="/policies/terms-of-service" className="underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/policies/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

/* -------------------------------------------------------- password reset */

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, undefined);
  return (
    <AuthShell
      title="Reset your password"
      lead="Enter the email on your account and we'll send a reset link that expires in thirty minutes."
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
      {state?.ok ? (
        <div className="text-center" role="status">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white">
            <CheckIcon className="h-6 w-6" />
          </span>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">Check your inbox</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-600">{state.message}</p>
        </div>
      ) : (
        <form action={action} className="grid gap-5">
          <TextField label="Email" name="email" type="email" required autoComplete="email" />
          <FormError state={state} />
          <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <AuthShell
      title="Choose a new password"
      lead="This signs you out of every other device once the password is changed."
      footer={
        <>
          Link expired?{" "}
          <Link href="/account/reset" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Request a new one
          </Link>
          .
        </>
      }
    >
      <form action={action} className="grid gap-5">
        <input type="hidden" name="token" value={token} />
        <TextField label="New password" name="password" type="password" required autoComplete="new-password" minLength={10} hint={fieldError(state, "password") ?? "At least 10 characters with a letter and a number."} />
        <TextField label="Confirm new password" name="confirm" type="password" required autoComplete="new-password" hint={fieldError(state, "confirm")} />
        <FormError state={state} />
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
