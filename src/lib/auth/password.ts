import "server-only";
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Constant-time-ish dummy compare so "unknown email" takes as long as "wrong password". */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5aS3s0FYs6Ntv1x0k4zqfXW6dRHMt2C";
export async function burnPasswordCheck(password: string) {
  await bcrypt.compare(password, DUMMY_HASH);
}
