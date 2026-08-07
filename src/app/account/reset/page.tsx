import type { Metadata } from "next";
import { ResetForm } from "@/components/auth-forms";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Reset Your Password",
  description: "Request a password reset link for your VaultCollect account.",
  path: "/account/reset",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Account", href: "/account/login" },
  { name: "Reset password", href: "/account/reset" },
];

export default function ResetPage() {
  return (
    <Container className="py-12 lg:py-16">
      <Breadcrumbs items={crumbs} />
      <div className="mt-8">
        <ResetForm />
      </div>
    </Container>
  );
}
