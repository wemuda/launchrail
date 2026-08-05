import { test } from "node:test";
import assert from "node:assert/strict";
import { greeting } from "./server.js";

test("greets the world by default", () => {
  assert.equal(greeting(), "Hello, world!");
});

test("greets a named caller", () => {
  assert.equal(greeting("Ada"), "Hello, Ada!");
});
