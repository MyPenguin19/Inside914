import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Area } from "react-easy-crop";
import { HouseArtworkForm } from "@/components/admin/house-artwork-form";

type CropperCallbacks = {
  onCropAreaChange: (area: Area, pixels: Area) => void;
  onMediaLoaded: (media: { naturalWidth: number; naturalHeight: number }) => void;
};
const cropper = vi.hoisted(() => ({ props: null as CropperCallbacks | null }));
vi.mock("react-easy-crop", () => ({ default: (props: CropperCallbacks) => { cropper.props = props; return null; } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test.each([0, Number.NaN, Number.POSITIVE_INFINITY])("house preview survives a transient invalid crop width of %s", width => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  render(<HouseArtworkForm updatedAt={null} />);
  fireEvent.change(screen.getByLabelText("House artwork (PNG or JPEG, up to 3 MB)"), {
    target: { files: [new File(["fixture"], "house.png", { type: "image/png" })] },
  });
  const selected = { x: 0, y: 0, width: 2000, height: 1328 };
  act(() => {
    cropper.props!.onMediaLoaded({ naturalWidth: 2000, naturalHeight: 1600 });
    cropper.props!.onCropAreaChange(selected, selected);
  });
  expect(screen.getByRole("button", { name: "Save house artwork" })).toHaveProperty("disabled", false);
  act(() => cropper.props!.onCropAreaChange(selected, { ...selected, width }));
  expect(screen.getByRole("button", { name: "Save house artwork" })).toHaveProperty("disabled", false);
  expect(screen.getByAltText("Final house crop preview")).toBeTruthy();
  expect(screen.getByText(/Selected crop: 2000 × 1328 pixels/)).toBeTruthy();
});
