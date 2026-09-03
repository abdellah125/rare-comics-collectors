import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth-forms";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Create an Account",
  description: `Create a ${site.name} account to track orders and grading submissions, archive appraisals and manage consignments.`,
  path: "/account/register",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Account", href: "/account/login" },
  { name: "Create account", href: "/account/register" },
];

export default function RegisterPage() {
  return (
    <Container className="py-12 lg:py-16">
      <Breadcrumbs items={crumbs} />
      <div className="mt-8">
        <RegisterForm />
      </div>
    </Container>
  );
}
