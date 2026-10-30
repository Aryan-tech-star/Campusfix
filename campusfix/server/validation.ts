import { ManagerError } from "../lib/manager/domain";
export function validateImages(images: string[]) {
  for (const image of images) {
    const [prefix, content] = image.split(",");
    const bytes = Buffer.from(content || "", "base64");
    const ok =
      prefix === "data:image/jpeg;base64"
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : prefix === "data:image/png;base64"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : prefix === "data:image/webp;base64" &&
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!ok || bytes.length > 1024 * 1024)
      throw new ManagerError(
        400,
        "Images must be valid PNG, JPEG or WebP files of at most 1 MB each.",
      );
  }
}
