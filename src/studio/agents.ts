import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { Settings } from "./schema.js";

const exec = promisify(execFile);
const AGENTS = [
  { id: "claude", name: "Claude Code", command: "claude" },
  { id: "codex", name: "Codex CLI", command: "codex" },
  { id: "gemini", name: "Gemini CLI", command: "gemini" },
] as const;

async function executable(command: string) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const file = join(
      dir,
      command + (process.platform === "win32" ? ".cmd" : ""),
    );
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {
      /* Next PATH entry. */
    }
  }
}

export async function scanAgents() {
  return Promise.all(
    AGENTS.map(async (agent) => {
      const path = await executable(agent.command);
      if (!path) return { ...agent, available: false, version: "", path: "" };
      try {
        const { stdout } = await exec(path, ["--version"], {
          timeout: 5000,
          maxBuffer: 10000,
        });
        return {
          ...agent,
          available: true,
          version: stdout.trim().split("\n")[0],
          path,
        };
      } catch {
        return {
          ...agent,
          available: false,
          version: "Không đọc được phiên bản",
          path,
        };
      }
    }),
  );
}

/** Prompt is stdin data, never interpolated into a shell command. */
export async function runCli(ai: Settings["ai"], prompt: string, cwd: string) {
  const agent = (await scanAgents()).find((a) => a.id === ai.cli);
  if (!agent?.available)
    throw new Error(
      `Chưa tìm thấy ${ai.cli} trong PATH. Cài/đăng nhập CLI rồi quét lại ở Kết nối.`,
    );
  const args =
    ai.cli === "claude"
      ? [
          "-p",
          "--output-format",
          "text",
          "--tools",
          "",
          "--strict-mcp-config",
          "--setting-sources",
          "user",
        ]
      : ai.cli === "codex"
        ? [
            "exec",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            "--ephemeral",
            "--color",
            "never",
          ]
        : [
            "--output-format",
            "text",
            "--approval-mode",
            "plan",
            "-p",
            "Chỉ trả JSON theo yêu cầu trong stdin.",
          ];
  if (ai.model) args.push("--model", ai.model);
  if (ai.cli === "codex") args.push("-");
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return new Promise<string>((resolve, reject) => {
    const child = spawn(agent.path, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "",
      stderr = "",
      done = false;
    const stop = () => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGTERM");
        else child.kill();
      } catch {
        /* Already exited. */
      }
    };
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        stop();
        reject(error);
      } else resolve(stdout);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "CLI phản hồi quá lâu (3 phút). Kiểm tra đăng nhập hoặc đổi model rồi thử lại.",
          ),
        ),
      180000,
    );
    child.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > 2_000_000)
        finish(new Error("CLI trả nội dung quá lớn."));
    });
    child.stderr.on("data", (data) => {
      stderr = (stderr + data.toString()).slice(-2000);
    });
    child.on("error", () =>
      finish(new Error(`Không khởi động được ${ai.cli}.`)),
    );
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(
              `${ai.cli} kết thúc với mã ${code}. Kiểm tra đăng nhập CLI trong terminal. ${stderr.replace(/(?:sk-|key-)[\w-]+/g, "[redacted]").slice(-300)}`,
            ),
      ),
    );
    child.stdin.on("error", () => {
      /* close/error handles early CLI exit. */
    });
    child.stdin.end(prompt);
  });
}
