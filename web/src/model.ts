import type {
  Draft,
  PublicSettings,
  TemplateInfo,
} from "../../src/studio/schema";
export type {
  Draft,
  PublicSettings,
  TemplateInfo,
  Project,
  Asset,
  RenderJob,
} from "../../src/studio/schema";
export interface Agent {
  id: "claude" | "codex" | "gemini";
  name: string;
  available: boolean;
  path: string;
  version: string;
}
export type Scene = Draft["script"]["scenes"][number];
export const SAMPLE =
  "Một ý tưởng tốt bắt đầu từ một câu chuyện rõ ràng. Hãy chọn một chủ đề bạn quan tâm, tìm những chi tiết đáng nhớ và viết theo cách bạn muốn kể.\n\nHình ảnh giúp người xem cảm nhận. Giọng đọc tạo nhịp điệu. Một thiết kế nhất quán sẽ kết nối mọi thứ thành một video có cá tính.\n\nBắt đầu bằng một video ngắn. Xem lại, chỉnh sửa và kể câu chuyện tiếp theo theo cách của bạn.";

export function newDraft(
  settings: PublicSettings,
  templates: TemplateInfo[],
): Draft {
  const ids = ["frame-liquid-bg-hero", "frame-photo-story", "frame-logo-outro"];
  const texts = [
    "Ý tưởng của bạn xứng đáng được kể.",
    "Kết hợp hình ảnh, giọng đọc và thiết kế để tạo nên câu chuyện của riêng bạn.",
    "Bắt đầu câu chuyện tiếp theo cùng chúng tôi.",
  ];
  return {
    title: "Câu chuyện mới",
    sourceText: "",
    sourceUrl: "",
    sfx: true,
    quality: "standard",
    musicVolume: 0.12,
    script: {
      version: "1.0",
      renderer: "hyperframes",
      aspect: "9:16",
      metadata: {
        title: "Câu chuyện mới",
        channel: settings.brand.channel,
        source: { url: "", domain: "local", image: null },
      },
      voice: {
        provider: settings.tts.provider,
        speed: 1,
        mode: "design",
        ...(settings.tts.voice ? { voice: settings.tts.voice } : {}),
        ...(settings.tts.provider === "omnivoice" && settings.tts.instructions
          ? { instructions: settings.tts.instructions, numStep: 16 }
          : {}),
      },
      scenes: ids.map((templateId, i) => {
        const template = templates.find((t) => t.id === templateId);
        const inputs = structuredClone(template?.defaults ?? {});
        if (i === 0)
          Object.assign(inputs, {
            kicker: "MỘT KHỞI ĐẦU MỚI",
            headline: "Ý tưởng thành câu chuyện.",
            subheadline: "Tạo video theo cách của bạn.",
            brand: settings.brand.channel,
          });
        if (i === 1)
          Object.assign(inputs, {
            headline: "Góc nhìn của riêng bạn.",
            subtitle: "Từ hình ảnh đến những điều đáng nhớ.",
            brand: settings.brand.channel,
          });
        if (i === 2)
          Object.assign(inputs, {
            brand_name: settings.brand.channel,
            tagline: "Mỗi ngày, một câu chuyện.",
            primary_url: "",
          });
        return {
          id: ["hook", "body-1", "outro"][i],
          type: ["hook", "body", "outro"][i] as Scene["type"],
          templateId,
          voiceText: texts[i],
          inputs,
        };
      }),
    },
  };
}
export function sceneHeadline(scene: Scene) {
  const text =
    scene.inputs.headline ??
    scene.inputs.hero ??
    scene.inputs.label ??
    scene.inputs.brand_name ??
    scene.inputs.cta;
  return Array.isArray(text)
    ? text.join(" ")
    : String(text || scene.voiceText).slice(0, 60);
}
export const slotLabels: Record<string, string> = {
  headline: "Tiêu đề",
  illustration: "Tranh minh hoạ có sẵn",
  caption: "Phụ đề riêng (trống = dùng lời đọc)",
  subheadline: "Mô tả ngắn",
  subtitle: "Dòng mô tả",
  kicker: "Nhãn đầu trang",
  brand: "Tên kênh",
  brand_name: "Tên thương hiệu",
  tagline: "Thông điệp",
  primary_url: "Đường dẫn",
  cta: "Lời kêu gọi",
  figure: "Con số nổi bật",
  date: "Ngày / số báo",
  standfirst: "Đoạn dẫn",
  footer_left: "Chân trang trái",
  footer_right: "Chân trang phải",
  hero: "Từ khoá chính",
  label: "Nhãn",
  anchor: "Điểm nhấn",
  items: "Các mục",
  left: "Bên trái",
  right: "Bên phải",
  eyebrow: "Nhãn nhỏ",
  title: "Tiêu đề",
  source: "Nguồn",
  url: "Đường dẫn",
};
