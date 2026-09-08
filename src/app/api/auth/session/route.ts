import { sessionDto } from "@/lib/auth/session-dto";

export const dynamic = "force-dynamic";

/** Safe, minimal session DTO for client components. Never returns roles, permissions or tokens. */
export async function GET() {
  return Response.json({ user: await sessionDto() }, { headers: { "cache-control": "no-store, private" } });
}
