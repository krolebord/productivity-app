import { MAX_UPLOAD_FILES } from "@productivity/core/agent/uploads";
import { File as FsFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

/** A file chosen for the next message, held as a local URI until it's sent. */
export type PickedFile = { uri: string; name: string; mimeType: string; size: number };

function fileNameFromUri(uri: string) {
  return decodeURIComponent(uri.split("/").at(-1) || "upload");
}

/** Photos from the library, re-encoded as JPEG so HEIC shots reach the model in a format it reads. */
export async function pickImages(limit: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(limit, MAX_UPLOAD_FILES)),
    quality: 0.8,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.fileName || fileNameFromUri(asset.uri),
    mimeType: asset.mimeType || "image/jpeg",
    size: asset.fileSize ?? new FsFile(asset.uri).size,
  }));
}

/** Any document from the system file picker (Files on iOS). */
export async function pickDocuments(): Promise<PickedFile[]> {
  const picked = await FsFile.pickFileAsync({ multipleFiles: true });
  if (picked.canceled) return [];
  return picked.result.map((file) => ({
    uri: file.uri,
    name: file.name || fileNameFromUri(file.uri),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  }));
}

/**
 * Shapes a picked file into what the contract's `files` input expects. oRPC finds files with
 * `instanceof Blob` and sends them as multipart; Expo's fetch then reads each part through
 * `arrayBuffer()`, which here reads the file from disk. React Native's Blob can't be built
 * from a file in JS, so this is a Blob in name only, carrying just what those two read.
 * The name is reduced to the characters the agent keeps anyway: the multipart filename is
 * percent-encoded on the way out, and the server would otherwise store that verbatim.
 */
export function toUploadFile(file: PickedFile): File {
  const upload = Object.create(Blob.prototype) as File;
  Object.defineProperties(upload, {
    name: { value: file.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "upload", enumerable: true },
    type: { value: file.mimeType, enumerable: true },
    size: { value: file.size, enumerable: true },
    arrayBuffer: { value: () => new FsFile(file.uri).arrayBuffer() },
  });
  return upload;
}
