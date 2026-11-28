// Match checkout's intended final credential state without invoking malformed
// unrelated gitlinks. The temporary Actions read token is never printed.
import { spawnSync } from "node:child_process";

const directory = process.argv[2] || ".";
const unset = spawnSync("git", ["-C", directory, "config", "--local", "--unset-all",
  "http.https://github.com/.extraheader"], { stdio: "pipe" });
const remaining = spawnSync("git", ["-C", directory, "config", "--local", "--name-only",
  "--get-regexp", "^(http\\..*\\.extraheader|core\\.sshcommand|credential\\..*)$"],
{ stdio: "pipe" });
if (![0, 5].includes(unset.status) || remaining.status !== 1) {
  console.error("CHECKOUT_AUTH_CLEANUP_FAILED");
  process.exitCode = 1;
} else {
  console.log("CHECKOUT_AUTH_REMOVED");
}
