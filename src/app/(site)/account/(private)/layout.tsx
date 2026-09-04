import type { ReactNode } from "react";
import { AccountNav } from "@/components/account/account-nav";
import { Container } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

/** Sidebar chrome for the signed-in account area. Every page inside also calls requireUser(). */
export default async function PrivateAccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ next: "/account" });
  return (
    <Container className="py-10 lg:py-14">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        <AccountNav isSeller={Boolean(user.seller)} sellerStatus={user.seller?.status ?? null} isAdmin={user.isAdmin && !user.impersonator} name={user.name} />
        <div className="mt-8 min-w-0 lg:mt-0">{children}</div>
      </div>
    </Container>
  );
}
