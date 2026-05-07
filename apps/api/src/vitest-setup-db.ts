import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** 相对路径由 Prisma 按 `prisma/schema.prisma` 所在目录解析 → `prisma/vitest.db` */
process.env.DATABASE_URL = "file:./vitest.db";

execSync("npx prisma db push --skip-generate", {
  cwd: apiRoot,
  stdio: "pipe",
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
});
