import imageCompression from "browser-image-compression";

export async function compressImage(file: File): Promise<Blob> {
  try {
    return await imageCompression(file, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 2048,
      useWebWorker: true,
      fileType: "image/jpeg",
    });
  } catch {
    return file;
  }
}
