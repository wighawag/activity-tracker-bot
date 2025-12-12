import { beforeEach, afterAll } from "bun:test";
import { initDb, resetDb, closeDb } from "../src/db.js";

// Use in-memory DB for tests
process.env.NODE_ENV = "test";

beforeEach(() => {
  initDb(":memory:");
  resetDb();
});

afterAll(() => {
  closeDb();
});
