// Pure helpers shared by scripts/dev/setup-local.mjs and the storage integration test.

/** Fills the Garage config template. */
export function garageToml(template, { rpcSecret, adminToken }) {
  return template.replace("__RPC_SECRET__", rpcSecret).replace("__ADMIN_TOKEN__", adminToken);
}

/** Environment for Garage single-node mode (--single-node --default-bucket). */
export function garageCredentials({ accessKeyId, secretAccessKey, bucket }) {
  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    garageEnv: `GARAGE_DEFAULT_ACCESS_KEY=${accessKeyId}\nGARAGE_DEFAULT_SECRET_KEY=${secretAccessKey}\nGARAGE_DEFAULT_BUCKET=${bucket}\n`,
  };
}
