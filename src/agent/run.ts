import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createSelectedModel } from "../providers/registry";
import { getTools } from "../tools/registry";
import type { Confirm } from "./confirm";
import { SYSTEM_PROMPT } from "./prompt";

export function createAgent({ confirm }: { confirm: Confirm }) {
  const model = createSelectedModel();
  const tools = getTools(confirm);
  const messages: ModelMessage[] = [];

  return {
    async run(input: string): Promise<string> {
      const userMessage: ModelMessage = { role: "user", content: input };

      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: [...messages, userMessage],
        tools,
        stopWhen: stepCountIs(5),
      });

      messages.push(userMessage, ...result.response.messages);
      return result.text;
    },
  };
}