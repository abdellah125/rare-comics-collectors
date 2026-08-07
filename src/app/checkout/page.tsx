import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Secure Checkout",
  description: "Complete your VaultCollect order securely.",
  path: "/checkout",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Cart", href: "/cart" },
  { name: "Checkout", href: "/checkout" },
];

export default function CheckoutPage() {
  return (
    <Container className="py-10 lg:py-14">
      <Breadcrumbs items={crumbs} />
      <h1 className="mt-6 font-display text-3xl font-semibold text-ink-950 sm:text-4xl">Secure checkout</h1>
      <div className="mt-10">
        <CheckoutView />
      </div>
    </Container>
  );
}
