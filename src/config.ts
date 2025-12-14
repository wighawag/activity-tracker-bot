import { z } from "zod";

// Environment variable validation schema
const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  APP_ID: z.string().min(1),
  FALLBACK_CHANNEL_ID: z.string().min(1).optional(),
  INVITE_LINK: z.string().optional(),
  ACTIVE_ROLE_NAME: z.string().default("Active"),
  INACTIVE_ROLE_NAME: z.string().default("Inactive"),
  DORMANT_ROLE_NAME: z.string().default("Dormant"),
  INACTIVE_AFTER_MS: z.coerce.number().default(864000000), // 10 days
  DORMANT_AFTER_MS: z.coerce.number().default(2592000000), // 30 days
  SWEEP_INTERVAL_MS: z.coerce.number().default(60000), // 1 minute
  SYNC_TIME_WINDOW_MS: z.coerce.number().default(3600000), // 1 hour (0 = sync all)
  DB_PATH: z.string().default("./activity.db"),
  ONLY_TRACK_EXISTING_USERS: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Creates and validates configuration from environment variables
 * @param env Environment variables object (defaults to process.env)
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
export function createConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n  - ");
    throw new Error(`Invalid environment variables:\n  - ${errors}`);
  }

  return result.data;
}
