import { streamText, stepCountIs, type ModelMessage } from "ai";
import { createSelectedModel } from "../providers/registry";
import { getTools } from "../tools/registry";
import type { Confirm } from "./confirm";
import { SYSTEM_PROMPT } from "./prompt";
import { getLocalNowString, requireTimeZone } from "../system/timezone";
import {
  checkInputGuardrail,
  checkOutputGuardrail,
  createLlmScopeClassifier,
} from "./guardrails";

export interface RunOptions {
  onChunk?: (chunk: string) => void;
}

export function createAgent({ confirm }: { confirm: Confirm }) {
  const model = createSelectedModel();
  const tools = getTools(confirm, model);
  const scopeClassifier = createLlmScopeClassifier(model);
  const messages: ModelMessage[] = [];

  return {
    async run(input: string, options?: RunOptions): Promise<string> {
      const inputCheck = await checkInputGuardrail(input, scopeClassifier);
      if (!inputCheck.allowed) {
        const blocked = inputCheck.userMessage ?? "Request blocked by input guardrail.";
        options?.onChunk?.(blocked);
        return blocked;
      }

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

      const result = streamText({
        model,
        system: contextualSystemPrompt,
        messages: [...messages, userMessage],
        tools,
        stopWhen: stepCountIs(5),
      });

      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
        options?.onChunk?.(chunk);
      }

      const outputCheck = checkOutputGuardrail(fullText);
      if (!outputCheck.allowed) {
        return outputCheck.userMessage ?? "Response blocked by output guardrail.";
      }

      const response = await result.response;
      messages.push(userMessage, ...response.messages);
      return outputCheck.sanitizedOutput ?? fullText;
    },
  };
}
