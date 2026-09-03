import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Your Cart",
  description: `Review the graded comics and services in your ${site.name} cart before checkout.`,
  path: "/cart",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Cart", href: "/cart" },
];

export default function CartPage() {
  return (
    <Container className="py-10 lg:py-14">
      <Breadcrumbs items={crumbs} />
      <h1 className="mt-6 font-display text-3xl font-semibold text-ink-950 sm:text-4xl">Your cart</h1>
      <p className="mt-2 text-[15px] text-ink-600">
        Adding a book to your cart doesn&apos;t reserve it — single-copy books go to whoever completes checkout first.
      </p>
      <div className="mt-10">
        <CartView />
      </div>
    </Container>
  );
}
