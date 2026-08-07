import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sign In to Your Account",
  description: "Sign in to track orders, follow grading submissions, view appraisal reports and manage consignments.",
  path: "/account/login",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Account", href: "/account/login" },
  { name: "Sign in", href: "/account/login" },
];

export default function LoginPage() {
  return (
    <Container className="py-12 lg:py-16">
      <Breadcrumbs items={crumbs} />
      <div className="mt-8">
        <LoginForm />
      </div>
    </Container>
  );
}
