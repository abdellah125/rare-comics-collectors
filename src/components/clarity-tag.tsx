/**
 * Microsoft Clarity (session recordings and heatmaps). The `clarity()` command queue is set up
 * in <head> straight away, as in Clarity's own snippet, but the recorder script is fetched later:
 * two seconds after the visitor's first interaction (when the main thread is next idle) or, failing
 * that, once it is idle at least three and a half seconds after the load event. Fetched during startup
 * it held the main thread for about half a second on a mid-range phone, on every page.
 * Only the production deployment renders it, so local and preview sessions are never recorded.
 * NEXT_PUBLIC_CLARITY_ID overrides the default project id (public by nature — it is in
 * every page source).
 */
const DEFAULT_CLARITY_ID = "yipx69jj3c";

export function ClarityTag() {
  const id = (process.env.NEXT_PUBLIC_CLARITY_ID || DEFAULT_CLARITY_ID).trim();
  const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
  if (!/^[a-z0-9]+$/i.test(id) || !isProduction) return null;
  const snippet = `(function(c,l,a,r,i){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        var done=false;
        function load(){ if(done)return; done=true; var t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i; var y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y); }
        function whenIdle(ms){ setTimeout(function(){ if('requestIdleCallback' in c) c.requestIdleCallback(load,{timeout:2000}); else load(); }, ms); }
        var asked=false;
        function interacted(){ if(asked)return; asked=true; whenIdle(2000); }
        ['pointerdown','keydown','touchstart','scroll'].forEach(function(e){ c.addEventListener(e, interacted, {passive:true, once:true}); });
        if(l.readyState==='complete') whenIdle(3500); else c.addEventListener('load', function(){ whenIdle(3500); });
    })(window, document, "clarity", "script", ${JSON.stringify(id)});`;
  return <script type="text/javascript" id="microsoft-clarity" dangerouslySetInnerHTML={{ __html: snippet }} />;
}
