import "dotenv/config";
import { defineConfig } from "prisma/config";

// process.env (not env()) so that `prisma generate` works in CI without a database URL.
// Commands that need a database (migrate, db) fail clearly when DATABASE_URL is empty.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
