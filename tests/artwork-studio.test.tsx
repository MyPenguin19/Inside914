import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ArtworkStudio, type ArtworkActions } from "@/components/artwork/artwork-studio";
import { CroppedImage } from "@/components/artwork/cropped-image";
import type { ArtworkView } from "@/lib/artwork/service";

// MOCKED: server actions, Storage upload, browser image decoding and the cropper itself (jsdom
// has no layout). Real Storage and database behavior is covered in tests/integration and e2e/.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("react-easy-crop", () => ({
  default: function CropperStub(props: { onCropAreaChange: (a: unknown, px: unknown) => void; zoom: number }) {
    const { onCropAreaChange, zoom } = props;
    useEffect(() => {
      onCropAreaChange({ x: 0, y: 0, width: 100, height: 100 }, { x: 10.4, y: 20.6, width: 974.7, height: 899.2 });
    }, [onCropAreaChange]);
    return <div data-testid="cropper" data-zoom={zoom} />;
  },
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const AREA = { side: "front" as const, x: 0, y: 3, width: 3.25, height: 3 };
const READY: ArtworkView = {
  id: "11111111-1111-4111-8111-111111111111",
  contentType: "image/png",
  width: 2000,
  height: 1800,
  viewUrl: "https://storage.example/signed",
  crop: null,
  zoom: null,
};

function actionsWith(overrides: Partial<ArtworkActions> = {}): ArtworkActions {
  return {
    requestUpload: vi.fn(async () => ({ ok: true as const, artworkId: READY.id, uploadUrl: "https://storage.example/upload" })),
    finalizeUpload: vi.fn(async () => ({ ok: true as const, artwork: READY })),
    saveLayout: vi.fn(async () => ({ ok: true as const })),
    removeArtwork: vi.fn(async () => ({ ok: true as const })),
    extendHold: vi.fn(async () => ({ ok: true as const, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })),
    ...overrides,
  };
}

const goodInspect = vi.fn(async () => ({ ok: true as const, type: "image/png" as const, width: 2000, height: 1800, previewUrl: "blob:local" }));

function setup(opts: {
  actions?: ArtworkActions;
  inspect?: typeof goodInspect;
  upload?: (url: string, file: File, type: string, o: { onProgress?: (f: number) => void }) => Promise<void>;
  minutesLeft?: number;
  extensionsLeft?: number;
  initialArtwork?: ArtworkView | null;
  size?: "standard" | "double";
} = {}) {
  const actions = opts.actions ?? actionsWith();
  const upload = vi.fn(opts.upload ?? (async (_u, _f, _t, o) => o.onProgress?.(1)));
  const double = opts.size === "double";
  render(
    <ArtworkStudio
      hold={{ expiresAt: new Date(Date.now() + (opts.minutesLeft ?? 14) * 60_000).toISOString(), extensionsLeft: opts.extensionsLeft ?? 2 }}
      ad={{
        side: "front",
        area: double ? { ...AREA, width: 6.5 } : AREA,
        labels: double ? ["F3", "F4"] : ["F3"],
        size: opts.size ?? "standard",
        priceCents: double ? 90000 : 50000,
      }}
      otherSlots={[{ side: "front", x: 0, y: 0, width: 3.25, height: 3 }]}
      initialArtwork={opts.initialArtwork ?? null}
      actions={actions}
      upload={upload as never}
      inspect={(opts.inspect ?? goodInspect) as never}
    />,
  );
  const chooseFile = (name = "ad.png") => {
    const input = screen.getByLabelText("Ad image file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], name, { type: "image/png" })] } });
  };
  return { actions, upload, chooseFile };
}

describe("ArtworkStudio upload", () => {
  test("states the accepted formats and size limit up front", () => {
    setup();
    expect(screen.getByText(/JPG or PNG, up to 20 MB/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose an image" })).toBeTruthy();
  });

  test("a valid image is uploaded with progress, verified, then opens the editor", async () => {
    const { actions, upload, chooseFile } = setup();
    chooseFile();
    await screen.findByTestId("cropper");
    expect(actions.requestUpload).toHaveBeenCalledWith({ byteSize: 1 });
    expect(upload).toHaveBeenCalledWith("https://storage.example/upload", expect.any(File), "image/png", expect.anything());
    expect(actions.finalizeUpload).toHaveBeenCalledWith({ artworkId: READY.id });
    expect(screen.getByText(/Image uploaded/)).toBeTruthy();
  });

  test("an unsupported file is rejected before anything is uploaded", async () => {
    const { actions, chooseFile } = setup({ inspect: vi.fn(async () => ({ ok: false, problem: "unsupported_type" })) as never });
    chooseFile("menu.pdf");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringMatching(/JPG or PNG/));
    expect(actions.requestUpload).not.toHaveBeenCalled();
  });

  test("an oversized file is rejected with the limit in the message", async () => {
    setup({ inspect: vi.fn(async () => ({ ok: false, problem: "too_large" })) as never }).chooseFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/larger than 20 MB/);
  });

  test("a file the server finds corrupt is reported, and no editor opens", async () => {
    const actions = actionsWith({ finalizeUpload: vi.fn(async () => ({ ok: false as const, reason: "corrupt" as const })) });
    setup({ actions }).chooseFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't open that image/);
    expect(screen.queryByTestId("cropper")).toBeNull();
  });

  test("an interrupted upload is reported honestly and its record is cleaned up", async () => {
    const { actions, chooseFile } = setup({ upload: async () => Promise.reject(new Error("network")) });
    chooseFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/interrupted, so nothing was saved/);
    expect(actions.removeArtwork).toHaveBeenCalled();
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
  });

  test("an expired hold blocks the upload and points back to the postcard", async () => {
    const actions = actionsWith({ requestUpload: vi.fn(async () => ({ ok: false as const, reason: "hold_expired" as const })) });
    setup({ actions }).chooseFile();
    await waitFor(() => expect(screen.getByRole("link", { name: "Choose your position again" })).toBeTruthy());
  });
});

describe("ArtworkStudio editing", () => {
  test("replace and remove work on an existing image", async () => {
    const { actions, chooseFile } = setup({ initialArtwork: READY });
    expect(screen.getByTestId("cropper")).toBeTruthy();

    chooseFile("new.png"); // what "Replace image" triggers
    await waitFor(() => expect(actions.requestUpload).toHaveBeenCalledTimes(1));
    await screen.findByText(/Image uploaded/);

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    await screen.findByRole("button", { name: "Choose an image" });
    expect(actions.removeArtwork).toHaveBeenCalled();
  });

  test("zoom slider and Reset change the zoom", async () => {
    setup({ initialArtwork: READY });
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2.5" } });
    expect(screen.getByTestId("cropper").dataset.zoom).toBe("2.5");
    fireEvent.click(screen.getByRole("button", { name: "Reset position" }));
    expect(screen.getByTestId("cropper").dataset.zoom).toBe("1");
  });

  test("warns when the crop's resolution is low for print", () => {
    setup({ initialArtwork: READY, size: "double" }); // 975 px across 6.5 in = 149 ppi
    expect(screen.getByText(/may look blurry or blocky/)).toBeTruthy();
  });

  test("Continue saves the rounded crop and zoom, then moves to review", async () => {
    const { actions } = setup({ initialArtwork: READY });
    fireEvent.click(screen.getByRole("button", { name: "Continue to review" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/review"));
    expect(actions.saveLayout).toHaveBeenCalledWith({
      artworkId: READY.id,
      crop: { x: 10, y: 21, width: 975, height: 899 },
      zoom: 1,
    });
  });
});

describe("hold time", () => {
  test("no extension offer while plenty of time remains", () => {
    setup({ minutesLeft: 14 });
    expect(screen.queryByRole("button", { name: /add 15 minutes/i })).toBeNull();
  });

  test("offers 15 more minutes near the end, and only while extensions remain", async () => {
    const { actions } = setup({ minutesLeft: 4 });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /add 15 minutes/i })));
    expect(actions.extendHold).toHaveBeenCalled();
    expect(screen.getByText(/15 more minutes/)).toBeTruthy();

    cleanup();
    setup({ minutesLeft: 4, extensionsLeft: 0 });
    expect(screen.queryByRole("button", { name: /add 15 minutes/i })).toBeNull();
  });
});

describe("CroppedImage", () => {
  test("maps the crop rectangle onto the ad box without distortion", () => {
    render(<CroppedImage src="x" imageWidth={2000} imageHeight={1000} crop={{ x: 500, y: 250, width: 1000, height: 500 }} alt="ad" />);
    const img = screen.getByAltText("ad") as HTMLImageElement;
    expect(img.style.width).toBe("200%");
    expect(img.style.height).toBe("200%");
    expect(img.style.left).toBe("-50%");
    expect(img.style.top).toBe("-50%");
  });
});
