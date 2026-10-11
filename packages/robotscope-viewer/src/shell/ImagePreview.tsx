import { useEffect, useRef } from "react";
import { decodeBase64Payload, type JsonImage } from "@robotscope/core";

/** The decoder has already validated the image's encoding and byte count. */
export function ImagePreview({ image }: { image: JsonImage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    const source = decodeBase64Payload(image.data_b64);
    const pixels = context.createImageData(image.width, image.height);
    const channels = image.encoding === "rgba8" ? 4 : image.encoding === "rgb8" ? 3 : 1;
    for (let i = 0; i < image.width * image.height; i++) {
      pixels.data[i * 4] = source[i * channels]!;
      pixels.data[i * 4 + 1] = source[i * channels + (channels === 1 ? 0 : 1)]!;
      pixels.data[i * 4 + 2] = source[i * channels + (channels === 1 ? 0 : 2)]!;
      pixels.data[i * 4 + 3] = channels === 4 ? source[i * channels + 3]! : 255;
    }
    context.putImageData(pixels, 0, 0);
  }, [image]);
  return <canvas ref={ref} width={image.width} height={image.height}
    aria-label="Recorded image" role="img" style={{ width: "100%", height: "auto", imageRendering: "pixelated" }} />;
}
