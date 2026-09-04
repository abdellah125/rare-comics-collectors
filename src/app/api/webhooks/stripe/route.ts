import { ingestWebhook } from "@/lib/payments/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return ingestWebhook("stripe", req);
}
