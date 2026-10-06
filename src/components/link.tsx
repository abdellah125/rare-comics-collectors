import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * The site's link: next/link without background prefetching.
 *
 * By default Next.js asks the server for every link as it scrolls into view. Every page here is
 * rendered per request (currency, language, session), so each of those requests ran a server
 * function and returned almost nothing a later click could reuse: a store page with 24 cards and
 * the navigation fired some sixty of them, on the visitor's connection and on the phone's main
 * thread, right after load. Navigation itself is unchanged (still client-side, no full reload).
 * Pass `prefetch` to bring it back for a particular link.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
