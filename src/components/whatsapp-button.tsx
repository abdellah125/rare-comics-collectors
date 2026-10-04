import { WhatsAppIcon } from "@/components/icons";
import { getTranslator } from "@/lib/i18n";
import { site } from "@/lib/site";
import { whatsappMessage, whatsappUrl } from "@/lib/whatsapp";

/**
 * "Message us on WhatsApp" button for server-rendered pages. `path` picks the first message
 * (an appraisal page opens with an appraisal request, and so on).
 */
export async function WhatsAppButton({ path, label, showNumber = false, className = "" }: { path: string; label?: string; showNumber?: boolean; className?: string }) {
  const tr = await getTranslator();
  return (
    <a
      href={whatsappUrl(whatsappMessage(path))}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-semibold text-white shadow-plate transition-colors hover:bg-[#1eb957] ${className}`}
    >
      <WhatsAppIcon className="h-5 w-5" />
      {label ?? tr("Message us on WhatsApp")}
      {showNumber && <span className="font-normal opacity-90">{site.whatsapp.display}</span>}
    </a>
  );
}
