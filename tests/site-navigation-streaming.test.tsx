import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const route = vi.hoisted(() => ({ ready: false, pending: Promise.resolve() as Promise<void> }));
vi.mock("next/navigation", () => ({ usePathname: () => {
  if (!route.ready) throw route.pending;
  return "/pricing";
} }));
const { SiteHeader } = await import("@/components/site-header");

afterEach(cleanup);

test("an open mobile menu and its focus survive delayed route information", async () => {
  let finish!: () => void;
  route.ready = false;
  route.pending = new Promise<void>(resolve => { finish = resolve; });
  render(<SiteHeader />);
  const header = screen.getByRole("banner");
  const menu = header.querySelector("details")!;
  const toggle = menu.querySelector("summary")!;
  // Native details can be opened before a streamed route boundary resolves.
  menu.open = true;
  toggle.focus();
  await act(async () => { route.ready = true; finish(); await route.pending; });
  await waitFor(() => expect(header.querySelector('a[href="/pricing"]')?.getAttribute("aria-current")).toBe("page"));
  expect(header.querySelector("details")).toBe(menu);
  expect(menu.open).toBe(true);
  expect(document.activeElement).toBe(toggle);
});
