// Runs the Next.js dev server and the background service together (local development only).
// Ctrl+C stops both. No extra dependency: plain child processes with prefixed output.
import { spawn } from "node:child_process";

const children = [
  ["web", ["run", "dev"]],
  ["service", ["run", "service"]],
].map(([name, args]) => {
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const prefix = (stream, out) => stream.on("data", (data) => out.write(data.toString().replace(/^(?=.)/gm, `[${name}] `)));
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`[${name}] exited with ${code}`);
    stop();
  });
  return child;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
