export declare function garageToml(template: string, secrets: { rpcSecret: string; adminToken: string }): string;
export declare function garageCredentials(input: { accessKeyId: string; secretAccessKey: string; bucket: string }): {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  garageEnv: string;
};
