import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { TemplateInfo } from "./schema.js";

const details: Record<string, [string, string, string]> = {
  "frame-paper-story": [
    "Paper Story",
    "Nền giấy kem, tranh nét chì và phụ đề nhấn từng từ",
    "#b39570",
  ],
  "frame-liquid-bg-hero": [
    "Aurora",
    "Ánh sáng chuyển động, tiêu đề nổi bật",
    "#93a2ff",
  ],
  "frame-bold-poster": [
    "Editorial",
    "Chữ lớn, điểm nhấn đỏ, chất tạp chí",
    "#ff806b",
  ],
  "frame-vignelli": [
    "Minimal Stat",
    "Một con số, một thông điệp mạnh",
    "#f1b561",
  ],
  "frame-pentagram-stat": [
    "Neon Data",
    "Số liệu và biểu đồ mang sắc thái công nghệ",
    "#b8f17c",
  ],
  "frame-build-minimal": [
    "Wordplay",
    "Tối giản với typography chuyển động",
    "#ffa160",
  ],
  "frame-creative-voltage": [
    "Electric",
    "Sắc xanh điện, nhịp điệu sáng tạo",
    "#a0b8ff",
  ],
  "frame-glitch-title": ["Glitch", "Hiệu ứng RGB cho tin công nghệ", "#d99eff"],
  "frame-aicoding-list": [
    "Checklist",
    "Danh sách rõ ràng, dễ theo dõi",
    "#79d9b4",
  ],
  "frame-aicoding-comparison": [
    "Versus",
    "So sánh hai lựa chọn trực quan",
    "#89c9ec",
  ],
  "frame-logo-outro": [
    "Signature",
    "Kết thúc bằng tên kênh và lời mời theo dõi",
    "#c9a6ef",
  ],
  "frame-statement-outro": [
    "Final Word",
    "Lời kết kiểu poster trên nền giấy",
    "#edb5a8",
  ],
  "frame-photo-story": [
    "Photo Story",
    "Hình ảnh của bạn, câu chuyện của bạn",
    "#b9d79b",
  ],
};

export async function templateCatalog(root: string): Promise<TemplateInfo[]> {
  const ids = (await readdir(join(root, "templates"))).filter((id) =>
    id.startsWith("frame-"),
  );
  return Promise.all(
    ids.map(async (id) => {
      const html = await readFile(
        join(root, "templates", id, "compositions", "portrait.html"),
        "utf8",
      );
      const raw =
        html.match(/data-composition-variables='([^']*)'/)?.[1] ?? "{}";
      const [name, description, color] = details[id] ?? [
        id,
        "Template tuỳ chỉnh",
        "#b5c9a0",
      ];
      return {
        id,
        name,
        description,
        color,
        role: id.includes("outro")
          ? "outro"
          : id.includes("hero")
            ? "hook"
            : "body",
        defaults: JSON.parse(raw),
      };
    }),
  );
}

export function validTemplate(id: string) {
  return /^frame-[a-z0-9-]+$/.test(id);
}
