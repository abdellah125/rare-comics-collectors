import "server-only";
import { PrismaClient } from "@prisma/client";

// One client per process. In development Next.js re-evaluates modules on hot
// reload, so the instance is parked on globalThis to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type { Prisma } from "@prisma/client";
