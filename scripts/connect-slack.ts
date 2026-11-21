// scripts/connect-slack.ts
import "dotenv/config";
import { corsair } from "../src/connectors/corsair";

const { connectUrl } = await corsair.manage.connect.createLink({
  plugin: "slack",
  tenantId: "default",
});

console.log("Open this URL in your browser:");
console.log(connectUrl);