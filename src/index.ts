import "dotenv/config";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { platform, stdin, stdout } from "node:process";
import { corsairHandler } from "./server/corsair-handler";
import { corsair } from "./connectors/corsair";
import { createAgent } from "./agent/run";
import type { Confirm } from "./agent/confirm";

const terminal = createInterface({ input: stdin, output: stdout });

const confirm: Confirm = async (preview) => {
  stdout.write(`\n${preview}\n\n`);

  const answer = await terminal.question("Approve this send? [yes/no] ");
  return answer.trim().toLowerCase() === "yes";
};

const agent = createAgent({ confirm });

const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/corsair")) {
    return corsairHandler(req, res);
  }

  res.statusCode = 404;
  res.end("Not found");
});

const PORT = Number(process.env.PORT ?? 3000);

function shutdown() {
  server.close();
  terminal.close();
  process.exit(0);
}

terminal.on("SIGINT", shutdown);

const SUPPORTED_PLUGINS = ["gmail", "slack", "googlecalendar"] as const;

function openInBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];

    execFile(cmd, args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function handleConnectCommand(arg?: string) {
  const plugins = arg
    ? [arg.toLowerCase()]
    : [...SUPPORTED_PLUGINS];

  const invalid = plugins.filter(
    (p) => !(SUPPORTED_PLUGINS as readonly string[]).includes(p),
  );
  if (invalid.length > 0) {
    stdout.write(
      `\nUnknown plugin(s): ${invalid.join(", ")}. Supported: ${SUPPORTED_PLUGINS.join(", ")}\n\n`,
    );
    return;
  }

  try {
    for (const plugin of plugins) {
      const result = await corsair.manage.connect.createLink({ plugin });
      const url = (result as { url?: string; connectUrl?: string }).url ??
        (result as { connectUrl?: string }).connectUrl;

      if (!url) {
        stdout.write(`\nCould not generate a connection URL for ${plugin}.\n`);
        continue;
      }

      stdout.write(`\nOpening browser to connect ${plugin}...\n`);
      try {
        await openInBrowser(url);
        stdout.write(`If the browser didn't open, visit:\n${url}\n`);
      } catch {
        stdout.write(`Open this URL in your browser:\n${url}\n`);
      }
    }
    stdout.write("\n");
  } catch (error) {
    console.error(
      `\nConnect error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

server.listen(PORT, () => {
  stdout.write("Commands: /brief (daily briefing), /connect [plugin], /exit (quit)\n\n");
  void promptLoop();
});

async function promptLoop() {
  while (true) {
    let rawInput: string;
    try {
      rawInput = await terminal.question("You: ");
    } catch {
      shutdown();
      break;
    }

    const input = rawInput.trim();

    if (input === "/exit") {
      shutdown();
      break;
    }

    if (input === "/connect" || input.startsWith("/connect ")) {
      const arg = input.slice("/connect".length).trim() || undefined;
      await handleConnectCommand(arg);
      continue;
    }

    if (!input) continue;

    const prompt =
      input === "/brief" || input === "/daily-brief"
        ? "Give me my daily briefing."
        : input;

    try {
      let started = false;
      const response = await agent.run(prompt, {
        onChunk: (chunk) => {
          if (!started) {
            stdout.write("\nAgent: ");
            started = true;
          }
          stdout.write(chunk);
        },
      });

      if (started) {
        stdout.write("\n\n");
      } else if (response) {
        stdout.write(`\nAgent: ${response}\n\n`);
      }
    } catch (error) {
      console.error(
        `\nError: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}
