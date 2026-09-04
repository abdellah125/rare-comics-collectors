import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth-forms";
import { Container } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Choose a new password", description: "Set a new password for your account.", path: "/account/reset", noIndex: true });

export default async function ResetTokenPage({ params }: PageProps<"/account/reset/[token]">) {
  const { token } = await params;
  return (
    <Container className="py-12 lg:py-16">
      <ResetPasswordForm token={token} />
    </Container>
  );
}
