import "server-only";
import { z } from "zod";
import { audit, securityEvent } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assertRateLimit } from "@/lib/rate-limit";
import { zEmail, zPassword, zTrimmed } from "@/lib/validation";

/**
 * First-run bootstrap: while the database holds no super administrator, /admin/setup
 * lets whoever deploys the site create one without touching environment variables.
 * The moment an account with the wildcard permission exists the page and the
 * endpoint answer 404, and the check is repeated inside a locked transaction so two
 * simultaneous submissions cannot both succeed. ADMIN_SETUP_KEY (optional) adds a
 * shared secret on top for hosts where the URL could be guessed before the owner
 * gets to it.
 */
export class SetupError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SetupError";
    this.status = status;
  }
}

const SUPER_ADMIN_WHERE = { role: { permissionsJson: { contains: '"*"' } }, deletedAt: null } as const;

export async function needsInitialAdmin(): Promise<boolean> {
  return (await db.user.count({ where: SUPER_ADMIN_WHERE })) === 0;
}

export const SetupSchema = z
  .object({
    name: zTrimmed(120).min(2, { error: "Enter your name" }),
    email: zEmail,
    password: zPassword,
    confirm: z.string(),
    setupKey: z.string().max(200).optional(),
    website: z.string().max(0).optional(), // honeypot: real people leave it empty
  })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match", path: ["confirm"] });

export type SetupInput = z.infer<typeof SetupSchema>;

export async function createInitialAdmin(input: SetupInput, meta: { ip: string | null }): Promise<{ id: string; email: string }> {
  await assertRateLimit(`admin-setup:${meta.ip ?? "unknown"}`, 5, 15 * 60_000);
  if (env.adminSetupKey && input.setupKey !== env.adminSetupKey) throw new SetupError("The setup key is wrong.", 403);

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    // Serialise concurrent submissions; the count below is authoritative.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424200101)`;
    if ((await tx.user.count({ where: SUPER_ADMIN_WHERE })) > 0) throw new SetupError("An administrator already exists.", 404);
    const role = await tx.role.findUnique({ where: { slug: "super_admin" } });
    if (!role) throw new SetupError("Roles are missing. Run the database seed first.", 500);
    const existing = await tx.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return tx.user.update({
        where: { id: existing.id },
        data: { name: input.name, passwordHash, roleId: role.id, status: "active", deletedAt: null, emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), failedLoginCount: 0, lockedUntil: null },
        select: { id: true, email: true },
      });
    }
    return tx.user.create({
      data: { email: input.email, name: input.name, passwordHash, roleId: role.id, emailVerifiedAt: new Date() },
      select: { id: true, email: true },
    });
  });

  await audit({ actor: "system", action: "admin.bootstrap", targetType: "user", targetId: user.id, summary: `First super admin created through /admin/setup: ${user.email}` });
  await securityEvent("admin_bootstrap", user.id, { email: user.email });
  return user;
}
