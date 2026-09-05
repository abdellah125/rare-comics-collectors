import { Logo } from "@/components/logo";
import { site } from "@/lib/site";

export function MaintenancePage({ message, supportEmail }: { message: string; supportEmail?: string }) {
  const email = supportEmail || site.email;
  return (
    <main className="flex flex-1 items-center justify-center bg-ink-950 px-6 py-24 text-white">
      <div className="max-w-lg text-center">
        <div className="flex justify-center">
          <Logo tone="dark" />
        </div>
        <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">Scheduled maintenance</p>
        <h1 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">We&apos;ll be right back</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-300">{message}</p>
        <p className="mt-8 text-sm text-ink-400">
          Urgent? Email{" "}
          <a href={`mailto:${email}`} className="text-white underline underline-offset-4">
            {email}
          </a>{" "}
          or call {site.phoneDisplay}.
        </p>
      </div>
    </main>
  );
}
