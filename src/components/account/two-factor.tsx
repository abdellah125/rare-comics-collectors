"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { TextField } from "@/components/form-fields";
import { Badge, buttonSizes, buttonStyles } from "@/components/ui";
import { beginTwoFactorSetupAction, disableTwoFactorAction, enableTwoFactorAction, regenerateRecoveryCodesAction } from "@/lib/account/actions";

export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-lg border border-gold-400/50 bg-gold-400/10 p-4">
      <p className="text-sm font-semibold text-ink-950">Save these recovery codes now</p>
      <p className="mt-1 text-[13px] text-ink-700">Each code signs you in once if you lose your authenticator. They won’t be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm text-ink-900 sm:grid-cols-4">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

export function TwoFactorPanel({ enabled, disabled, redirectTo }: { enabled: boolean; disabled?: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [regenCode, setRegenCode] = useState("");
  const [disableState, disableAction, disablePending] = useActionState(disableTwoFactorAction, undefined);

  if (codes) {
    return (
      <div className="grid gap-4">
        <p className="flex items-center gap-2 text-sm text-ink-800">
          <Badge tone="brand">Enabled</Badge> Two-factor authentication is on.
        </p>
        <RecoveryCodes codes={codes} />
        <div>
          <button
            type="button"
            className={`${buttonStyles.primary} ${buttonSizes.md}`}
            onClick={() => {
              setCodes(null);
              if (redirectTo) router.push(redirectTo);
              router.refresh();
            }}
          >
            I’ve saved my codes
          </button>
        </div>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="grid gap-6">
        <p className="flex items-center gap-2 text-sm text-ink-800">
          <Badge tone="brand">Enabled</Badge> Codes are required at every sign-in.
        </p>
        <div className="grid gap-3 rounded-lg border border-ink-200 p-4">
          <p className="text-sm font-semibold text-ink-950">Regenerate recovery codes</p>
          <p className="text-[13px] text-ink-600">Invalidates any unused codes. Confirm with a current authenticator code.</p>
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="Authenticator code" name="regen" inputMode="numeric" value={regenCode} onChange={(e) => setRegenCode(e.target.value)} disabled={disabled} className="w-40" />
            <button
              type="button"
              disabled={pending || disabled || regenCode.length < 6}
              className={`${buttonStyles.outline} ${buttonSizes.md}`}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await regenerateRecoveryCodesAction(regenCode);
                  if (res.ok) {
                    setCodes(res.recoveryCodes);
                    setRegenCode("");
                  } else setError(res.message);
                })
              }
            >
              {pending ? "Working…" : "Regenerate"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
        <form action={disableAction} className="grid gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-4">
          <p className="text-sm font-semibold text-ink-950">Turn off two-factor authentication</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Password" name="password" type="password" required autoComplete="current-password" disabled={disabled} />
            <TextField label="Authenticator code" name="code" required inputMode="numeric" disabled={disabled} />
          </div>
          <FormError state={disableState} />
          <FormSuccess state={disableState} />
          <div>
            <button type="submit" disabled={disablePending || disabled} className={`${buttonStyles.outline} ${buttonSizes.md} border-rose-300 text-rose-700 hover:bg-rose-50`}>
              {disablePending ? "Disabling…" : "Disable 2FA"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="grid gap-4">
        <p className="flex items-center gap-2 text-sm text-ink-800">
          <Badge tone="neutral">Off</Badge> Your account only uses a password.
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div>
          <button
            type="button"
            disabled={pending || disabled}
            className={`${buttonStyles.primary} ${buttonSizes.md}`}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await beginTwoFactorSetupAction();
                if (res.ok) setSetup({ qr: res.qr, secret: res.secret });
                else setError(res.message);
              })
            }
          >
            {pending ? "Preparing…" : "Set up two-factor authentication"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
      <div className="rounded-lg border border-ink-200 bg-white p-2">
        <Image src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} unoptimized className="h-auto w-full" />
      </div>
      <div className="grid gap-4">
        <ol className="grid gap-2 text-sm text-ink-700">
          <li>1. Open your authenticator app and scan the QR code.</li>
          <li>
            2. Can’t scan? Enter this key manually: <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[13px] text-ink-900">{setup.secret}</code>
          </li>
          <li>3. Enter the 6-digit code the app shows to confirm.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
          <button
            type="button"
            disabled={pending || code.replace(/\s/g, "").length !== 6}
            className={`${buttonStyles.primary} ${buttonSizes.md}`}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await enableTwoFactorAction(code);
                if (res.ok) {
                  setCodes(res.recoveryCodes);
                  setSetup(null);
                  setCode("");
                } else setError(res.message);
              })
            }
          >
            {pending ? "Verifying…" : "Verify and enable"}
          </button>
          <button type="button" className={`${buttonStyles.quiet} ${buttonSizes.md}`} onClick={() => setSetup(null)}>
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
