import { Upload, Image, AudioLines } from "lucide-react";
import { errorMessage } from "./api";
import type { Asset } from "./model";

export default function Assets({
  assets,
  uploadAsset,
  notify,
}: {
  assets: Asset[];
  uploadAsset: (file: File) => Promise<Asset>;
  notify: (message: string, error?: boolean) => void;
}) {
  return (
    <div className="assets-page page-enter">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">THƯ VIỆN CỦA RIÊNG BẠN</div>
          <h1>
            Chất liệu cho câu chuyện<span className="title-dot">.</span>
          </h1>
          <p>Hình ảnh và âm thanh được lưu local, sẵn sàng dùng lại.</p>
        </div>
        <label className="button primary upload-inline">
          <Upload size={16} /> Thêm tài nguyên
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/mp4"
            onChange={async (e) => {
              if (e.target.files?.[0])
                try {
                  await uploadAsset(e.target.files[0]);
                } catch (error) {
                  notify(errorMessage(error), true);
                }
            }}
          />
        </label>
      </div>
      {assets.length ? (
        <div className="asset-grid">
          {assets.map((a) => (
            <article className="asset-card" key={a.id}>
              {a.type === "image" ? (
                <img src={`/api/assets/${a.id}/file`} alt={a.name} />
              ) : (
                <div className="audio-asset">
                  <AudioLines size={32} />
                  <audio
                    controls
                    preload="none"
                    src={`/api/assets/${a.id}/file`}
                  />
                </div>
              )}
              <strong>{a.name}</strong>
              <small>
                {a.type === "image" ? "Hình ảnh" : "Âm thanh"} ·{" "}
                {(a.size / 1024 / 1024).toFixed(2)} MB
              </small>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Image size={38} strokeWidth={1.3} />
          <h2>Những chất liệu đầu tiên.</h2>
          <p>Thêm hình ảnh hoặc nhạc nền để làm video mang dấu ấn của bạn.</p>
        </div>
      )}
    </div>
  );
}
