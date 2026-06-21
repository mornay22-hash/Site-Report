import imageCompression from "browser-image-compression";

export async function compressImage(file: File): Promise<File> {
  // Target max 2 MB, max dimension ~2000px, JPEG output, decent quality
  const compressed = await imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 2000,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.82,
  });
  // Ensure we have a File (compressImage may return Blob in some versions)
  if (compressed instanceof File) return compressed;
  return new File([compressed], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });
}