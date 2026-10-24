import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/book/payment" }));

const { default: ErrorPage } = await import("@/app/error");
const { default: NotFound } = await import("@/app/not-found");
const { ErrorState } = await import("@/components/error-state");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("error page", () => {
  test("says nothing was charged, offers retry and home, and never shows the error message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("connect ECONNREFUSED db.internal:5432 secret-detail"), { digest: "3471982011" });
    render(<ErrorPage error={error} retry={retry} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByText(/nothing has been charged/i)).toBeTruthy();
    expect(screen.getByText("3471982011")).toBeTruthy(); // reference for support
    expect(document.body.textContent).not.toContain("secret-detail");
    expect(screen.getByRole("link", { name: "Go to the homepage" }).getAttribute("href")).toBe("/");
    expect(within(screen.getByRole("main")).getByRole("link", { name: "Info@inside914.com" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("a non-Error value (thrown from a client component) still renders, without a reference", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorPage error="boom" retry={() => {}} reset={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.queryByText(/reference/i)).toBeNull();
  });
});

describe("not-found page", () => {
  test("explains and links to the advertising areas and home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See advertising areas" }).getAttribute("href")).toBe("/areas");
    expect(screen.getByRole("link", { name: "Go to the homepage" }).getAttribute("href")).toBe("/");
  });
});

describe("ErrorState", () => {
  test("renders its title as the page heading", () => {
    render(<ErrorState title="Custom" body="Body text" />);
    expect(screen.getByRole("heading", { level: 1, name: "Custom" })).toBeTruthy();
  });
});

describe("root-layout error page (global-error)", () => {
  test("brings its own document, says nothing was charged, retries, and hides internals", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: GlobalError } = await import("@/app/global-error");
    const error = Object.assign(new Error("root layout exploded secret-detail"), { digest: "998877" });
    const html = renderToStaticMarkup(<GlobalError error={error} retry={() => {}} reset={() => {}} />);
    expect(html).toMatch(/^<html lang="en">/);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Nothing has been charged");
    expect(html).toContain("998877");
    expect(html).not.toContain("secret-detail");
  });

  test("Try again calls Next's retry (re-fetch and re-render), as Next 16.4 passes it to error boundaries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: GlobalError } = await import("@/app/global-error");
    const retry = vi.fn();
    const reset = vi.fn();
    // Rendered inside a container: jsdom can't mount a second <html>, so check the button wiring only.
    const { getByRole } = render(<GlobalError error={new Error("x")} retry={retry} reset={reset} />, { container: document.createElement("div") });
    fireEvent.click(getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
