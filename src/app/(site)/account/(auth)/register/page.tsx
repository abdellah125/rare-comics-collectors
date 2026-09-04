import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Create an Account",
  description: `Create a ${site.name} account to track orders and grading submissions, sell books and manage your collection.`,
  path: "/account/register",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Account", href: "/account" },
  { name: "Create account", href: "/account/register" },
];

export default async function RegisterPage({ searchParams }: PageProps<"/account/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : undefined;
  if (await getCurrentUser()) redirect(next ?? "/account");
  return (
    <Container className="py-12 lg:py-16">
      <Breadcrumbs items={crumbs} />
      <div className="mt-8">
        <RegisterForm next={next} />
      </div>
    </Container>
  );
}
