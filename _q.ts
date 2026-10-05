import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const jobs = await db.job.findMany({ where: { OR: [{ status: { in: ["pending", "running", "failed"] } }, { type: "import_auto_release" }] }, orderBy: { createdAt: "desc" }, take: 14 });
  for (const j of jobs) console.log(j.type.padEnd(24), j.status.padEnd(10), "runAt", j.runAt.toISOString().slice(11, 19), "att", j.attempts, "locked", (j as { lockedAt?: Date | null }).lockedAt?.toISOString().slice(11, 19) ?? "-", (j.lastError ?? "").slice(0, 120));
  console.log("now", new Date().toISOString().slice(11, 19), await db.importItem.groupBy({ by: ["status"], _count: { _all: true } }));
  await db.$disconnect();
})();
