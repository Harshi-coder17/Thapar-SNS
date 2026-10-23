#!/usr/bin/env node
// Generates local-only development secrets (idempotent; never overwrites existing files):
//   docker/garage/garage.local.toml        Garage config with a random RPC secret and admin token
//   docker/garage/credentials.local.env    Garage default access key, secret and bucket
//   .env                                   copied from .env.example plus the S3 credentials
// All three paths are gitignored. Secrets are never printed.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { garageCredentials, garageToml } from "./local-secrets.mjs";

const hex = (bytes) => randomBytes(bytes).toString("hex");

function writeOnce(path, contents, mode = 0o600) {
  if (existsSync(path)) {
    console.log(`setup:local: kept existing ${path}`);
    return false;
  }
  writeFileSync(path, contents, { mode });
  console.log(`setup:local: created ${path}`);
  return true;
}

const template = readFileSync("docker/garage/garage.toml.template", "utf8");
writeOnce("docker/garage/garage.local.toml", garageToml(template, { rpcSecret: hex(32), adminToken: hex(32) }));

const credentials = garageCredentials({ accessKeyId: `GK${hex(12)}`, secretAccessKey: hex(32), bucket: "thapar-sns-dev" });
writeOnce("docker/garage/credentials.local.env", credentials.garageEnv);

if (!existsSync(".env")) {
  const current = readFileSync("docker/garage/credentials.local.env", "utf8");
  const accessKeyId = /GARAGE_DEFAULT_ACCESS_KEY=(.+)/.exec(current)?.[1];
  const secretAccessKey = /GARAGE_DEFAULT_SECRET_KEY=(.+)/.exec(current)?.[1];
  const appEnv = `${readFileSync(".env.example", "utf8").trimEnd()}\nS3_ACCESS_KEY_ID=${accessKeyId}\nS3_SECRET_ACCESS_KEY=${secretAccessKey}\n`;
  writeOnce(".env", appEnv);
} else {
  console.log("setup:local: kept existing .env");
}
