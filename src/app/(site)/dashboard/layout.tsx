import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/seller/dashboard-nav";
import { Container } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Seller dashboard chrome. Sellers whose profile isn't approved see their
 * application status instead. Each page also calls requireSeller()/assertSeller().
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ next: "/dashboard" });
  if (!user.seller) redirect("/account/seller");
  const [pendingOrders, openCases] = await Promise.all([
    db.orderItem.count({ where: { sellerId: user.seller.id, status: "paid", kind: "comic" } }),
    db.dispute.count({ where: { sellerId: user.seller.id, status: { in: ["open", "awaiting_seller"] } } }),
  ]);
  if (user.seller.status !== "approved") {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-ink-200 bg-ink-50 p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink-950">Seller account {user.seller.status}</h1>
          <p className="mt-3 text-sm text-ink-700">
            {user.seller.status === "pending" && "Your application is being reviewed. We'll email you within two business days."}
            {user.seller.status === "rejected" && "Your application wasn't approved. You can update and resubmit it from your account."}
            {user.seller.status === "suspended" && "Your seller account is suspended. You can appeal from Account › Security."}
          </p>
          <Link href="/account/seller" className="mt-5 inline-block text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
            Go to seller application →
          </Link>
        </div>
      </Container>
    );
  }
  return (
    <Container className="py-10 lg:py-14">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        <DashboardNav storeName={user.seller.displayName} storeSlug={user.seller.slug} badges={{ orders: pendingOrders, disputes: openCases }} />
        <div className="mt-8 min-w-0 lg:mt-0">{children}</div>
      </div>
    </Container>
  );
}
