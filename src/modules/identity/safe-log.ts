// C7: identity errors are logged by name only. Error messages are never logged because database
// and library errors can embed the data being processed (tokens, token hashes, email addresses).

export function logIdentityError(context: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[identity] ${context}: ${name}`);
}
