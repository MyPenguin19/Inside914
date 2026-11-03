import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ArtworkStudio, type ArtworkActions } from "@/components/artwork/artwork-studio";
import { CroppedImage } from "@/components/artwork/cropped-image";
import type { ArtworkView } from "@/lib/artwork/service";

// MOCKED: server actions, Storage upload, browser image decoding and the cropper itself (jsdom
// has no layout). Real Storage and database behavior is covered in tests/integration and e2e/.
const push = vi.fn();
const cropper = vi.hoisted(() => ({ change: null as null | ((area: unknown, pixels: unknown) => void) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("react-easy-crop", () => ({
  default: function CropperStub(props: { onCropAreaChange: (a: unknown, px: unknown) => void; zoom: number }) {
    const { onCropAreaChange, zoom } = props;
    cropper.change = onCropAreaChange;
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
    extendHold: vi.fn(async () => ({ ok: true as const, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })),
    ...overrides,
  };
}

const goodInspect = vi.fn(async () => ({ ok: true as const, type: "image/png" as const, width: 2000, height: 1800, previewUrl: "blob:local" }));

function setup(opts: {
  layoutKey?: string;
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
      layoutKey={opts.layoutKey}
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

test.each([0, Number.NaN, Number.POSITIVE_INFINITY])("customer preview preserves its crop during invalid resize width %s", width => {
  setup({ initialArtwork: READY });
  const before = screen.getByRole("button", { name: "Save artwork and continue" }).getAttribute("disabled");
  act(() => cropper.change!({}, { x: 10, y: 21, width, height: 899 }));
  expect(screen.getByRole("button", { name: "Save artwork and continue" }).getAttribute("disabled")).toBe(before);
  expect(screen.getByTestId("cropper")).toBeTruthy();
});

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

  test("an interrupted upload is reported without changing active artwork", async () => {
    const { actions, chooseFile } = setup({ upload: async () => Promise.reject(new Error("network")) });
    chooseFile();
    expect((await screen.findByRole("alert")).textContent).toMatch(/interrupted, so nothing was saved/);
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
  });

  test("an expired hold blocks the upload and points back to the postcard", async () => {
    const actions = actionsWith({ requestUpload: vi.fn(async () => ({ ok: false as const, reason: "hold_expired" as const })) });
    setup({ actions }).chooseFile();
    await waitFor(() => expect(screen.getByRole("link", { name: "Choose your position again" })).toBeTruthy());
  });
});

describe("ArtworkStudio editing", () => {
  test("a slow save is acknowledged immediately and cannot be submitted twice", async () => {
    let finish!: (value: { ok: false; reason: "error" }) => void;
    const save = vi.fn(() => new Promise<{ ok: false; reason: "error" }>(resolve => { finish = resolve; }));
    setup({ initialArtwork: READY, actions: actionsWith({ saveLayout: save }) });
    fireEvent.click(screen.getByRole("button", { name: "Save artwork and continue" }));
    const saving = screen.getByRole("button", { name: "Saving artwork…" });
    expect(saving).toHaveProperty("disabled", true);
    fireEvent.click(saving);
    expect(save).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    await act(async () => finish({ ok: false, reason: "error" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save artwork and continue" })).toHaveProperty("disabled", false);
  });

  test("a failed replacement preserves the existing preview", async () => {
    const { actions, chooseFile } = setup({ initialArtwork: READY, upload: async () => { throw new Error("offline"); } });
    chooseFile("new.png");
    await screen.findByRole("alert");
    expect(screen.getByTestId("cropper")).toBeTruthy();
    expect(actions.saveLayout).not.toHaveBeenCalled();
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
  });

  test("zoom slider and Reset change the zoom", async () => {
    setup({ initialArtwork: READY });
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2.5" } });
    expect(screen.getByTestId("cropper").dataset.zoom).toBe("2.5");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByTestId("cropper").dataset.zoom).toBe("1");
  });

  test("warns when the crop's resolution is low for print", () => {
    setup({ initialArtwork: READY, size: "double" }); // 975 px contained within 6.5 in = 149 ppi
    expect(screen.getByText(/may look slightly soft/)).toBeTruthy();
  });

  test("Continue saves the rounded crop and zoom, then moves to review", async () => {
    const { actions } = setup({ initialArtwork: READY });
    fireEvent.click(screen.getByRole("button", { name: "Save artwork and continue" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/book/review"));
    expect(actions.saveLayout).toHaveBeenCalledWith({
      artworkId: READY.id,
      crop: { x: 10, y: 21, width: 975, height: 899 },
      zoom: 1,
      cropApproved: false,
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


test("V2 defaults to full source preservation without requiring a destructive crop", async()=>{
 const {actions}=setup({initialArtwork:READY,layoutKey:"amazingmail-9x6-v2"});
 expect(screen.queryByTestId("cropper")).toBeNull();
 expect(screen.getByAltText("Full artwork fitted without stretching")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Save artwork and continue"}));
 await waitFor(()=>expect(actions.saveLayout).toHaveBeenCalledWith({artworkId:READY.id,crop:{x:0,y:0,width:2000,height:1800},zoom:1,cropApproved:false}));
});

test("V2 cropping needs explicit approval after preview; returning to full image restores every source pixel", async()=>{
 const {actions}=setup({initialArtwork:READY,layoutKey:"amazingmail-9x6-v2"});
 fireEvent.click(screen.getByRole("button",{name:"Fill space"}));
 expect(screen.getByTestId("cropper")).toBeTruthy();
 expect(screen.getByRole("button",{name:"Save artwork and continue"})).toHaveProperty("disabled",true);
 fireEvent.click(screen.getByRole("checkbox",{name:/I approve this crop/}));
 expect(screen.getByRole("button",{name:"Save artwork and continue"})).toHaveProperty("disabled",false);
 fireEvent.click(screen.getByRole("button",{name:"Fit entire image"}));
 fireEvent.click(screen.getByRole("button",{name:"Save artwork and continue"}));
 await waitFor(()=>expect(actions.saveLayout).toHaveBeenCalledWith({artworkId:READY.id,crop:{x:0,y:0,width:2000,height:1800},zoom:1,cropApproved:false}));
});

test("contained browser preview uses a square inner image inside a portrait physical slot",()=>{
 render(<CroppedImage src="/fixture.png" imageWidth={900} imageHeight={900} crop={{x:0,y:0,width:900,height:900}} target={{width:2.2925,height:2.815}} alt="Contained square" />);
 const img=screen.getByAltText("Contained square");
 const box=img.parentElement!;
 expect(parseFloat(box.style.width)).toBeCloseTo(100);
 expect(parseFloat(box.style.height)).toBeCloseTo(2.2925/2.815*100);
 expect(parseFloat(box.style.top)).toBeCloseTo((2.815-2.2925)/2/2.815*100);
 expect(img.style.width).toBe("100%");expect(img.style.height).toBe("100%");
});

test("a rejected save leaves the selected crop available for a retry", async () => {
 const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ok:true});
 setup({initialArtwork:READY,layoutKey:"amazingmail-9x6-v2",actions:actionsWith({saveLayout:save})});
 fireEvent.click(screen.getByRole("button",{name:"Save artwork and continue"}));
 await screen.findByRole("alert");
 expect(screen.getByAltText("Full artwork fitted without stretching")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Save artwork and continue"}));
 await waitFor(()=>expect(push).toHaveBeenCalled());
 expect(save).toHaveBeenCalledTimes(2);
});

test("duplicate crop callbacks preserve acknowledgement; an actual crop change requires it again", async () => {
 const {actions}=setup({initialArtwork:READY,layoutKey:"amazingmail-9x6-v2"});
 fireEvent.click(screen.getByRole("button",{name:"Fill space"}));
 fireEvent.click(screen.getByRole("checkbox"));
 // Remount after Fit/Fill: the cropper reports exactly the same source pixels again.
 fireEvent.click(screen.getByRole("button",{name:"Fit entire image"}));
 fireEvent.click(screen.getByRole("button",{name:"Fill space"}));
 expect(screen.getByRole("checkbox")).toHaveProperty("checked",true);
 fireEvent.click(screen.getByRole("button",{name:"Save artwork and continue"}));
 await waitFor(()=>expect(actions.saveLayout).toHaveBeenCalledWith(expect.objectContaining({cropApproved:true})));
 fireEvent.click(screen.getByRole("button",{name:"Reset"}));
 expect(screen.getByRole("checkbox")).toHaveProperty("checked",false);
});
