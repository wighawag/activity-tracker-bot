import { describe, it, expect } from "bun:test";
import { createConfig } from "../src/config";

describe("Configuration", () => {
  it("should use default values when environment variables are not set", () => {
    const config = createConfig({
      DISCORD_TOKEN: "test_token",
      APP_ID: "test_app_id",
      FALLBACK_CHANNEL_ID: "test_channel_id",
    });

    expect(config.DISCORD_TOKEN).toBe("test_token");
    expect(config.APP_ID).toBe("test_app_id");
    expect(config.FALLBACK_CHANNEL_ID).toBe("test_channel_id");
    expect(config.ACTIVE_ROLE_NAME).toBe("Active");
    expect(config.INACTIVE_ROLE_NAME).toBe("Inactive");
    expect(config.DORMANT_ROLE_NAME).toBe("Dormant");
    expect(config.INACTIVE_AFTER_MS).toBe(864000000);
    expect(config.DORMANT_AFTER_MS).toBe(2592000000);
    expect(config.SWEEP_INTERVAL_MS).toBe(60000);
    expect(config.DB_PATH).toBe("./activity.db");
  });

  it("should throw error for missing required environment variables", () => {
    expect(() => {
      createConfig({});
    }).toThrow();
  });

  it("should parse numeric values correctly", () => {
    const config = createConfig({
      DISCORD_TOKEN: "test_token",
      APP_ID: "test_app_id",
      FALLBACK_CHANNEL_ID: "test_channel_id",
      INACTIVE_AFTER_MS: "1000000",
      DORMANT_AFTER_MS: "2000000",
      SWEEP_INTERVAL_MS: "30000",
    });

    expect(config.INACTIVE_AFTER_MS).toBe(1000000);
    expect(config.DORMANT_AFTER_MS).toBe(2000000);
    expect(config.SWEEP_INTERVAL_MS).toBe(30000);
  });
});
