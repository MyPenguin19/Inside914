import { homepageMarkdownResponse } from "@/lib/agent-content";

export function GET() { return homepageMarkdownResponse(); }
export function HEAD() { return homepageMarkdownResponse("HEAD"); }
