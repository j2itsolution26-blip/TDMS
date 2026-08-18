import "server-only";
import bcrypt from "bcryptjs";

// Same algorithm and cost factor as the Laravel app's BCRYPT_ROUNDS=12,
// so hashing strength is identical across both codebases during the
// migration (existing Laravel bcrypt hashes remain verifiable if a
// user's row is ever copied across, since the format is compatible).
const COST_FACTOR = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
