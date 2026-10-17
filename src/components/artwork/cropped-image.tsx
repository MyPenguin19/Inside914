import type { CropPixels } from "@/lib/artwork/rules";

type Props = {
  src: string;
  imageWidth: number;
  imageHeight: number;
  crop: CropPixels;
  alt: string;
};

// Shows exactly the cropped part of an image filling its parent box. The parent's aspect ratio
// matches the crop's (both come from the ad area), so nothing spills outside the ad.
export function CroppedImage({ src, imageWidth, imageHeight, crop, alt }: Props) {
  const scale = imageWidth / crop.width; // image width as a multiple of the box width
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed/blob URLs, already sized */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: `${scale * 100}%`,
          height: `${(imageHeight / crop.height) * 100}%`,
          left: `${-(crop.x / crop.width) * 100}%`,
          top: `${-(crop.y / crop.height) * 100}%`,
        }}
      />
    </div>
  );
}
