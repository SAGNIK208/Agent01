import type { corsair } from "../connectors/corsair";
import type {
  BriefingSource,
  BriefingWindow,
  CheckpointStore,
  SourceBatch,
  SourceItem,
} from "./types";

type SlackChannelsApi = Pick<
  typeof corsair.slack.api.channels,
  "list" | "getHistory"
>;

const SLACK_CHANNEL_LIMIT = 15;
const SLACK_TOTAL_LIMIT = 40;
const SLACK_BUFFER_SECONDS = 300;
const EXCERPT_LENGTH = 600;

export interface SlackChannelRef {
  id: string;
  name: string;
}

export interface SlackChannelDiscovery {
  channels: SlackChannelRef[];
  unavailable: boolean;
  reason?: string;
}

function normalizeExcerpt(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_LENGTH);
}

export function createSlackChannelDiscovery(
  api: Pick<typeof corsair.slack.api.channels, "list">,
): {
  listMemberChannels(): Promise<SlackChannelDiscovery>;
} {
  return {
    async listMemberChannels(): Promise<SlackChannelDiscovery> {
      const result = await api.list({
        exclude_archived: true,
        types: "public_channel,private_channel",
        limit: 200,
      });

      if (!result.ok) {
        return {
          channels: [],
          unavailable: true,
          reason: result.error ?? "Slack channel discovery failed.",
        };
      }

      const channels = (result.channels ?? [])
        .filter(
          (channel): channel is typeof channel & { id: string; name: string } =>
            channel.is_member === true &&
            typeof channel.id === "string" &&
            typeof channel.name === "string" &&
            channel.name.trim().length > 0,
        )
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
        }));

      return { channels, unavailable: false };
    },
  };
}

export function createSlackBriefingSource(input: {
  api: SlackChannelsApi;
  connectionId: string;
  tenantId: string;
  checkpoints: CheckpointStore;
}): {
  source: BriefingSource;
  discovery: ReturnType<typeof createSlackChannelDiscovery>;
} {
  const { api, connectionId, tenantId, checkpoints } = input;

  const discovery = createSlackChannelDiscovery(api);

  const source: BriefingSource = {
    id: "slack",
    label: "Slack",
    kind: "chat",

    async collect(window: BriefingWindow): Promise<SourceBatch> {
      const discoveryResult = await discovery.listMemberChannels();

      if (discoveryResult.unavailable) {
        throw new Error(
          discoveryResult.reason ?? "Slack channels could not be discovered.",
        );
      }

      const nowMs = Date.parse(window.now);
      const items: SourceItem[] = [];
      let skipped = 0;
      let truncated = false;
      let remainingTotal = SLACK_TOTAL_LIMIT;

      for (const channel of discoveryResult.channels) {
        if (remainingTotal <= 0) {
          truncated = true;
          break;
        }

        const checkpoint = await checkpoints.get({
          tenantId,
          sourceKind: "chat",
          sourceKey: `slack:${channel.id}`,
        });

        const checkpointTime = checkpoint
          ? Date.parse(checkpoint.lastItemTime)
          : Number.NaN;

        const fromMs = Number.isFinite(checkpointTime)
          ? checkpointTime - SLACK_BUFFER_SECONDS * 1000
          : nowMs - 24 * 60 * 60 * 1000;

        const channelLimit = Math.min(
          SLACK_CHANNEL_LIMIT,
          remainingTotal,
        );

        const page = await api.getHistory({
          channel: channel.id,
          oldest: (fromMs / 1000).toFixed(3),
          latest: (nowMs / 1000).toFixed(3),
          inclusive: false,
          limit: channelLimit,
        });

        if (!page.ok) {
          skipped++;
          continue;
        }

        const messages = page.messages ?? [];

        for (const message of messages) {
          if (!message.ts || !/^\d+(\.\d+)?$/.test(message.ts)) {
            skipped++;
            continue;
          }

          const occurredAtMs = Number(message.ts) * 1000;

          if (
            !Number.isFinite(occurredAtMs) ||
            occurredAtMs < fromMs ||
            occurredAtMs >= nowMs
          ) {
            continue;
          }

          const text = normalizeExcerpt(message.text);

          if (!text) {
            skipped++;
            continue;
          }

          items.push({
            title: message.user
              ? `Message from <@${message.user}> in #${channel.name}`
              : `Message in #${channel.name}`,
            excerpt: text,
            occurredAt: new Date(occurredAtMs).toISOString(),
            target: {
              provider: "slack",
              connectionId,
              itemId: message.ts,
              containerId: channel.id,
              ...(message.user ? { authorId: message.user } : {}),
            },
          });
        }

        remainingTotal -= messages.length;

        if (page.has_more || messages.length >= channelLimit) {
          truncated = true;
        }
      }

      return {
        items,
        skipped,
        truncated,
      };
    },
  };

  return { source, discovery };
}