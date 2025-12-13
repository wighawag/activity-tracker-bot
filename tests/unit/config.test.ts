import { describe, it, expect, beforeEach, afterEach } from "bun:test";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache by re-importing
    delete require.cache[require.resolve("../../src/config.js")];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should have default timing values", async () => {
    const { CONFIG } = await import("../../src/config.js");

    expect(CONFIG.INACTIVE_AFTER_MS).toBe(10 * 24 * 60 * 60 * 1000);
    expect(CONFIG.WARN_GRACE_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("should have default role names", async () => {
    const { CONFIG } = await import("../../src/config.js");

    expect(CONFIG.ACTIVE_ROLE_NAME).toBe("Active");
    expect(CONFIG.INACTIVE_ROLE_NAME).toBe("Inactive");
    expect(CONFIG.DORMANT_ROLE_NAME).toBe("Dormant");
  });
});
