import { describe, expect, it } from "vitest";
import { prefersMarkdown } from "../src/lib/accept-markdown";

describe("explicit Markdown content negotiation", () => {
  it.each([
    [null, false], ["", false], ["*/*", false], ["text/*", false],
    ["text/html,application/xhtml+xml,*/*;q=0.8", false],
    ["text/markdown", true], ["TEXT/MARKDOWN; charset=utf-8", true],
    ["text/markdown, text/html, */*", true], ["text/html, text/markdown", false],
    ["text/markdown;q=0", false], ["text/markdown;q=0, */*", false],
    ["text/markdown;q=0.5, text/html;q=0.9", false],
    ["text/html;q=0.5, text/markdown;q=0.9", true],
    ["text/markdown;q=0.5, text/html;q=0, */*", true],
    ["text/markdown;q=0.5, text/*;q=0.8", false],
    ["*/*, text/markdown", true],
    ["text/markdown;q=invalid", false], ["text/markdown;q=2", false],
    ["text/markdown;q=0.1234", false], ["text/markdown+xml", false],
    ["text/x-component", false],
  ])("Accept %s selects Markdown: %s", (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});
