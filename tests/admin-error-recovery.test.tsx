import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ErrorBoundaryHandler } from "next/dist/client/components/error-boundary";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import AdminError from "@/app/admin/(panel)/error";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("admin retry fetches a fresh server result instead of replaying the failed snapshot", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const refresh = vi.fn();

  function ServerSnapshot({ loaded }: { loaded: boolean }) {
    if (!loaded) throw new Error("Temporary server failure");
    return <h1>Campaign records loaded</h1>;
  }

  function AdminRoute() {
    const [loaded, setLoaded] = useState(false);
    const router = { refresh: () => { refresh(); setLoaded(true); } } as AppRouterInstance;
    return <AppRouterContext.Provider value={router}>
      <ErrorBoundaryHandler pathname="/admin/campaigns" errorComponent={AdminError}>
        <ServerSnapshot loaded={loaded} />
      </ErrorBoundaryHandler>
    </AppRouterContext.Provider>;
  }

  render(<AdminRoute />);
  expect(screen.getByRole("alert").textContent).toContain("This page couldn’t finish loading");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Campaign records loaded" })).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
});
