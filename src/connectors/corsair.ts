import Database from "better-sqlite3";
import { createCorsair } from "corsair";
import { gmail } from "@corsair-dev/gmail";
import { slack } from "@corsair-dev/slack";
import { googlecalendar } from "@corsair-dev/googlecalendar";


const db = new Database("corsair.db");

export const corsair = createCorsair({
  plugins: [
    gmail({ authType: "oauth_2" }),
    slack({ authType: "oauth_2" }),
    googlecalendar({ authType: "oauth_2" }),
  ],
  database: db,
  kek: process.env.CORSAIR_KEK!,
  hub: {
    projectApiKey: process.env.CORSAIR_API_KEY!,
    signingSecret: process.env.CORSAIR_SIGNING_SECRET!,
    allowWorkflowExecution: true
  },
});

export { db };