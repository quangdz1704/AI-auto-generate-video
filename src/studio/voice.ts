import { join } from "node:path";
import type { StudioStore } from "./store.js";

/** Web requests may only reference audio from the asset library. */
export async function resolveReference(
  store: StudioStore,
  voice: {
    mode?: string;
    provider: string;
    referenceAudio?: string;
    referenceText?: string;
  },
) {
  if (
    voice.referenceAudio &&
    !/^asset:[0-9a-f-]{36}$/i.test(voice.referenceAudio)
  )
    throw new Error("Giọng mẫu phải là tệp đã tải lên thư viện Studio.");
  if (voice.mode !== "clone") return undefined;
  if (!voice.referenceAudio || !voice.referenceText?.trim())
    throw new Error(
      "Chọn âm thanh mẫu và nhập lời nói chính xác trong mẫu để clone.",
    );
  const asset = await store.asset(voice.referenceAudio.slice(6));
  if (asset.type !== "audio")
    throw new Error("Giọng mẫu phải là tệp âm thanh.");
  return join(store.root, "assets", asset.file);
}
