import "dotenv/config";
import { corsair } from "../src/connectors/corsair";

const { connectUrl } = await corsair.manage.connect.createLink({
  plugin: "gmail",
  tenantId: "default",
});

console.log("Open this URL in your browser:");
console.log(connectUrl);