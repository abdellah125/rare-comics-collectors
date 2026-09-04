import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TwoFactorForm } from "@/components/auth-forms";
import { Container } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Two-factor verification", description: "Enter your authentication code.", path: "/account/login/verify", noIndex: true });

export default async function VerifyPage({ searchParams }: PageProps<"/account/login/verify">) {
  const sp = await searchParams;
  if (!(await cookies()).has("rcc_login_challenge")) redirect("/account/login");
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : undefined;
  return (
    <Container className="py-12 lg:py-16">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-3xl font-semibold text-ink-950">Two-factor verification</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-600">Your account is protected with two-factor authentication. Enter the code to finish signing in.</p>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6 sm:p-7">
          <TwoFactorForm next={next} />
        </div>
      </div>
    </Container>
  );
}
