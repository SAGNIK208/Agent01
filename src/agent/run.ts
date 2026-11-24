import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createSelectedModel } from "../providers/registry";
import { getTools } from "../tools/registry";
import type { Confirm } from "./confirm";
import { SYSTEM_PROMPT } from "./prompt";
import { getLocalNowString, requireTimeZone } from "../system/timezone";

export function createAgent({ confirm }: { confirm: Confirm }) {
  const model = createSelectedModel();
  const tools = getTools(confirm, model);
  const messages: ModelMessage[] = [];

  return {
    async run(input: string): Promise<string> {
      const userMessage: ModelMessage = { role: "user", content: input };

      let timeZone = "UTC";
      let localNow = "";
      let dayOfWeek = "";

      try {
        timeZone = requireTimeZone();
        const nowInfo = getLocalNowString(timeZone);
        localNow = nowInfo.dateTime;
        dayOfWeek = nowInfo.dayOfWeek;
      } catch {
        localNow = new Date().toISOString();
      }

      const contextualSystemPrompt = [
        SYSTEM_PROMPT,
        "",
        "Current System Context:",
        `- Timezone: ${timeZone}`,
        `- Current Local Time: ${localNow} (${dayOfWeek}, 24-hour format YYYY-MM-DD HH:mm:ss)`,
        "- All relative times (e.g. 'in 1 hr', 'today', 'tomorrow') must be calculated relative to this Current Local Time.",
        "- Always express and present times to the user in 24-hour format (YYYY-MM-DD HH:mm:ss) in their local timezone.",
      ].join("\n");

      const result = await generateText({
        model,
        system: contextualSystemPrompt,
        messages: [...messages, userMessage],
        tools,
        stopWhen: stepCountIs(5),
      });

      messages.push(userMessage, ...result.response.messages);
      return result.text;
    },
  };
}