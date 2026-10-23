import type { CropPixels } from "@/lib/artwork/rules";
import { containImage, PRINT_BACKGROUND } from "@/lib/print/image-fit";

type Props = {
  src: string;
  imageWidth: number;
  imageHeight: number;
  crop: CropPixels;
  alt: string;
  target?: { width: number; height: number };
};

// Shows exactly the cropped part of an image filling its parent box. The parent's aspect ratio
// matches the crop's (both come from the ad area), so nothing spills outside the ad.
export function CroppedImage({ src, imageWidth, imageHeight, crop, alt, target = crop }: Props) {
  const scale = imageWidth / crop.width; // image width as a multiple of the box width
  const fit = containImage(crop, target);
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: PRINT_BACKGROUND }}>
      <div className="absolute overflow-hidden" style={{ left: `${fit.x / target.width * 100}%`, top: `${fit.y / target.height * 100}%`, width: `${fit.width / target.width * 100}%`, height: `${fit.height / target.height * 100}%` }}>
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
    </div>
  );
}
