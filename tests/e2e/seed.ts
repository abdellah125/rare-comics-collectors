/* Run with: npx tsx --conditions=react-server tests/e2e/seed.ts */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E } from "./fixtures";

process.loadEnvFile?.(".env");

async function main() {
  const { encrypt } = await import("@/lib/crypto");
  const db = new PrismaClient();
  const passwordHash = await bcrypt.hash(E2E.password, 10);
  const roles = Object.fromEntries((await db.role.findMany({ select: { id: true, slug: true } })).map((r) => [r.slug, r.id]));
  if (!roles.super_admin || !roles.support) throw new Error("Run the main seed first (roles missing).");

  const upsertUser = async (email: string, name: string, data: Record<string, unknown>) =>
    db.user.upsert({
      where: { email },
      create: { email, name, passwordHash, emailVerifiedAt: new Date(), ...data },
      update: { name, passwordHash, status: "active", failedLoginCount: 0, lockedUntil: null, deletedAt: null, restrictionsJson: "[]", ...data },
    });

  const twoFactor = { twoFactorEnabled: true, twoFactorSecretEnc: encrypt(E2E.totpSecret), recoveryCodesJson: "[]" };
  const admin = await upsertUser(E2E.superAdmin, "E2E Super Admin", { roleId: roles.super_admin, ...twoFactor });
  const support = await upsertUser(E2E.supportAdmin, "E2E Support Agent", { roleId: roles.support, ...twoFactor });
  const buyer = await upsertUser(E2E.buyer, "E2E Buyer", { roleId: null, twoFactorEnabled: false, twoFactorSecretEnc: null, countryCode: "US" });
  const sellerUser = await upsertUser(E2E.seller, "E2E Seller", { roleId: null, twoFactorEnabled: false, twoFactorSecretEnc: null, isSeller: true, countryCode: "US" });

  const seller = await db.sellerProfile.upsert({
    where: { userId: sellerUser.id },
    create: { userId: sellerUser.id, slug: "e2e-seller", displayName: "E2E Seller Shop", status: "approved", verificationStatus: "verified", verifiedAt: new Date(), countryCode: "US", shipsFromCountry: "US", approvedAt: new Date(), handlingDays: 1 },
    update: { status: "approved", verificationStatus: "verified", canList: true },
  });

  const category = await db.category.findFirst({ select: { id: true } });
  const sampleImage = await db.productImage.findFirst({ select: { url: true }, where: { product: { deletedAt: null } } });
  const productData = {
    title: "E2E Test Comic",
    issue: "#1",
    publisher: "Test Press",
    year: 1990,
    era: "Modern Age",
    grader: "CGC",
    grade: "9.8",
    label: "Universal Blue",
    price: 5000,
    stock: 5,
    summary: "Deterministic listing used by the automated end-to-end suite.",
    description: "Deterministic listing used by the automated end-to-end suite. Safe to ignore.",
    status: "published",
    publishedAt: new Date(),
    sellerId: seller.id,
    categoryId: category?.id ?? null,
    deletedAt: null,
    weightGrams: 200,
  };
  const product = await db.product.upsert({
    where: { sku: E2E.productSku },
    create: { ...productData, sku: E2E.productSku, slug: E2E.productSlug },
    update: productData,
  });
  if (sampleImage && (await db.productImage.count({ where: { productId: product.id } })) === 0) {
    await db.productImage.create({ data: { productId: product.id, url: sampleImage.url, alt: "E2E Test Comic cover", position: 0 } });
  }

  // Test payment provider on; sessions of e2e users cleared so each run starts signed out.
  await db.setting.upsert({ where: { key: "payments.test.enabled" }, create: { key: "payments.test.enabled", value: JSON.stringify(true) }, update: { value: JSON.stringify(true) } });
  await db.session.deleteMany({ where: { userId: { in: [admin.id, support.id, buyer.id, sellerUser.id] } } });
  await db.loginChallenge.deleteMany({ where: { userId: { in: [admin.id, support.id] } } });
  console.log(`e2e seed ready: admin=${admin.email} support=${support.email} buyer=${buyer.email} seller=${sellerUser.email} product=${product.slug}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
