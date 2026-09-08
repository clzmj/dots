import { describe, expect, test } from "bun:test";

import pkg from "../package.json";
import { help, main } from "../../lemon";

function capture() {
  const out: string[] = [];
  const errors: string[] = [];
  return {
    out,
    errors,
    io: { out: (value: string) => out.push(value), error: (value: string) => errors.push(value) },
  };
}

describe("lemon dispatcher", () => {
  test("shows the complete command surface", async () => {
    const result = capture();
    expect(await main([], result.io)).toBe(0);
    for (const command of ["repo", "open", "clip", "ports", "run", "info", "tree"]) {
      expect(result.out.join("\n")).toContain(command);
    }
    expect(help()).toContain("lemon help <command>");
  });

  test("shows the binary version", async () => {
    const result = capture();
    expect(await main(["--version"], result.io)).toBe(0);
    expect(result.out).toEqual([pkg.version]);
  });

  test("rejects unknown commands", async () => {
    const result = capture();
    expect(await main(["wat"], result.io)).toBe(2);
    expect(result.errors[0]).toBe("lemon: unknown command: wat");
  });
});
