export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error || `Không thực hiện được yêu cầu (${response.status}).`,
    );
  }
  return response.json();
}
export const body = (value: unknown) => JSON.stringify(value);
export function upload(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được tệp."));
    reader.readAsDataURL(file);
  });
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Có lỗi xảy ra. Vui lòng thử lại.";
}
