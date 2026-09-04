import type { Metadata } from "next";
import { ResetRequestForm } from "@/components/auth-forms";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Reset Your Password",
  description: `Request a password reset link for your ${site.name} account.`,
  path: "/account/reset",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Account", href: "/account" },
  { name: "Reset password", href: "/account/reset" },
];

export default function ResetPage() {
  return (
    <Container className="py-12 lg:py-16">
      <Breadcrumbs items={crumbs} />
      <div className="mt-8">
        <ResetRequestForm />
      </div>
    </Container>
  );
}
