/**
 * Microsoft Clarity (session recordings and heatmaps), rendered inside <head> exactly as
 * Clarity's snippet: the loader is async, so it does not block parsing. Only the
 * production deployment renders it, so local and preview sessions are never recorded.
 * NEXT_PUBLIC_CLARITY_ID overrides the default project id (public by nature — it is in
 * every page source).
 */
const DEFAULT_CLARITY_ID = "yipx69jj3c";

export function ClarityTag() {
  const id = (process.env.NEXT_PUBLIC_CLARITY_ID || DEFAULT_CLARITY_ID).trim();
  const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
  if (!/^[a-z0-9]+$/i.test(id) || !isProduction) return null;
  const snippet = `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", ${JSON.stringify(id)});`;
  return <script type="text/javascript" id="microsoft-clarity" dangerouslySetInnerHTML={{ __html: snippet }} />;
}
