import "dotenv/config";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { corsairHandler } from "./server/corsair-handler";
import { createAgent } from "./agent/run";
import type { Confirm } from "./agent/confirm";

const terminal = createInterface({ input: stdin, output: stdout });

const confirm: Confirm = async (preview) => {
  console.log(`\n${preview}\n`);

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

server.listen(PORT, () => {
  console.log("Local server listening on " + "http://localhost:" + PORT);
  console.log("Type a request, or /exit to quit.\n");

  void promptLoop();
});

async function promptLoop() {
  while (true) {
    const input = (await terminal.question("You: ")).trim();

    if (input === "/exit") {
      server.close();
      terminal.close();
      break;
    }

    if (!input) continue;

    try {
      const response = await agent.run(input);

      if (response) {
        console.log(`\nAgent: ${response}\n`);
      }
    } catch (error) {
      console.error(
        `\nError: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }
}