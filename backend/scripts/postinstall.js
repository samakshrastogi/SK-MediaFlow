const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const generatedClientEntry = path.join(
  process.cwd(),
  "node_modules",
  "@prisma",
  "client",
  "default.js"
);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    execFileSync("npx", ["prisma", "generate"], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: process.platform === "win32",
    });
    process.exit(0);
  } catch (error) {
    const message = String(error?.message || "");
    const isLockError = message.includes("EPERM") || message.includes("EBUSY");

    if (attempt < 3 && isLockError) {
      console.warn(`Prisma generate hit a file lock. Retrying (${attempt}/3)...`);
      sleep(1500);
      continue;
    }

    if (existsSync(generatedClientEntry)) {
      console.warn("Prisma generate did not complete cleanly, but an existing client is available.");
      process.exit(0);
    }

    console.error("Prisma client generation failed during postinstall.");
    process.exit(error.status || 1);
  }
}
