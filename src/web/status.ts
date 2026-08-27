import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 8000 });
    return stdout.trim();
  } catch (error) {
    return `(unavailable: ${(error as Error).message})`;
  }
}

export interface ServiceStatus {
  active: boolean;
  state: string;
  since: string | null;
}

export async function getServiceStatus(unit: string): Promise<ServiceStatus> {
  const output = await run("systemctl", [
    "show",
    unit,
    "--property=ActiveState",
    "--property=SubState",
    "--property=ActiveEnterTimestamp",
  ]);
  const props: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    props[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return {
    active: props.ActiveState === "active",
    state: `${props.ActiveState ?? "unknown"} (${props.SubState ?? "unknown"})`,
    since: props.ActiveEnterTimestamp || null,
  };
}

export async function getPiVitals(): Promise<string> {
  const [uptime, memory, disk] = await Promise.all([run("uptime", []), run("free", ["-h"]), run("df", ["-h", "/"])]);
  return [uptime, "", memory, "", disk].join("\n");
}

export async function getRecentErrors(unit: string): Promise<string> {
  const output = await run("journalctl", ["-u", unit, "-p", "err", "--since", "24 hours ago", "--no-pager"]);
  return output || "No errors in the last 24 hours.";
}

export async function getLastBackupInfo(markerPath: string): Promise<string> {
  try {
    const contents = (await fs.readFile(markerPath, "utf8")).trim();
    return contents || "No successful backup recorded yet.";
  } catch {
    return "No successful backup recorded yet.";
  }
}

/** Requires the scoped NOPASSWD sudoers rule for `systemctl restart <unit>` set up on the Pi. */
export async function restartService(unit: string): Promise<void> {
  await execFileAsync("sudo", ["-n", "/usr/bin/systemctl", "restart", unit], { timeout: 8000 });
}
