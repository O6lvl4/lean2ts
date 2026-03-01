import { describe, it } from "vitest";

import fc from "fast-check";

import type { Wrapper } from "./types.js";

import { arbWrapper } from "./arbitraries.js";

import { swap, listHead, stringify } from "./stubs.js";

describe("properties", () => {
  it("andCommProp", () => {
    return !(true /* TODO */) || (!(true /* TODO */) || (!((true /* TODO */) && (true /* TODO */)) || ((true /* TODO */) && (true /* TODO */))));
  });
});
