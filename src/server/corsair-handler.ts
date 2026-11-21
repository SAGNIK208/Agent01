import { toNodeHandler } from "corsair";
import { corsair } from "../connectors/corsair";

export const corsairHandler = toNodeHandler(corsair, {
  basePath: "/api/corsair",
});