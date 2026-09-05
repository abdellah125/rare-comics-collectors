import type { Metadata } from "next";
import { safeLocalPath } from "@/lib/auth/safe-next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sign In to Your Account",
  description: "Sign in to track orders, follow grading submissions, manage listings and account security.",
  path: "/account/login",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Account", href: "/account" },
  { name: "Sign in", href: "/account/login" },
];

export default async function LoginPage({ searchParams }: PageProps<"/account/login">) {
  const sp = await searchParams;
  const next = safeLocalPath(sp.next, "") || undefined;
  const user = await getCurrentUser();
  if (user) redirect(next ?? "/account");
  const notice = sp.reset === "1" ? "Your password was changed. Sign in with the new one." : sp.registered === "1" ? "Account created — sign in to continue." : null;
  return (
    <Container className="py-12 lg:py-16">
      <Breadcrumbs items={crumbs} />
      <div className="mt-8">
        <LoginForm next={next} notice={notice} />
      </div>
    </Container>
  );
}
