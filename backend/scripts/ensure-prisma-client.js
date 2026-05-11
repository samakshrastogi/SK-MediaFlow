const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const clientEntry = path.join(
  __dirname,
  "..",
  "node_modules",
  ".prisma",
  "client",
  "index.js"
);

function hasRealPrismaClient(entryPath) {
  if (!fs.existsSync(entryPath)) {
    return false;
  }

  const content = fs.readFileSync(entryPath, "utf8");
  return !content.includes('@prisma/client did not initialize yet');
}

if (hasRealPrismaClient(clientEntry)) {
  console.log("Prisma client already exists, skipping generate.");
  process.exit(0);
}

const prismaCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(prismaCmd, ["prisma", "generate"], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
