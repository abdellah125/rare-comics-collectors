import { ingestWebhook } from "@/lib/payments/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return ingestWebhook("paypal", req);
}
