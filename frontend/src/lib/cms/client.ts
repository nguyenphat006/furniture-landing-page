import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
/*
 * Client gọi API CMS (Django + Wagtail, backend/). CHỈ dùng phía server: địa chỉ CMS nằm trong
 * biến môi trường không có tiền tố NEXT_PUBLIC_, trình duyệt không gọi thẳng CMS.
 *
 * Cache: mọi request gắn tag CMS_TAG và tự làm mới sau REVALIDATE_SECONDS. Khi quản trị viên xuất bản
 * trong admin, CMS gọi webhook /api/revalidate để đánh dấu tag cũ ngay (xem app/api/revalidate).
 *
 * Ghi (form Liên hệ): cmsPostForm ký HMAC bằng bí mật chung, CMS từ chối mọi request không ký.
 */

/** Tag cache chung cho mọi dữ liệu CMS: xuất bản bất kỳ nội dung nào thì làm mới toàn bộ */
export const CMS_TAG = "cms";

/** Lưới an toàn khi webhook lỗi: dữ liệu cũ tối đa 1 giờ */
const REVALIDATE_SECONDS = 3600;
// Lần đầu CMS có thể phải tạo ảnh WebP (rendition) nên cho chờ lâu hơn bình thường
/** Số lần thử lại khi lỗi mạng (không thử lại khi CMS đã trả lời, kể cả lỗi 5xx) */
const RETRIES = 2;
const TIMEOUT_MS = 30_000;

export class CmsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CmsError";
  }
}

/** Địa chỉ API CMS (vd http://127.0.0.1:9000/api/v1). Chưa đặt = dùng dữ liệu mock */
export function cmsApiUrl(): string | null {
  const url = process.env.CMS_API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

export function cmsEnabled(): boolean {
  return cmsApiUrl() !== null;
}

type Query = Record<string, string | number | string[] | undefined>;

function buildUrl(base: string, path: string, query: Query): string {
  const url = new URL(`${base}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(v));
    }
  }
  return url.toString();
}

/*
 * Bản tốt gần nhất (QC 09/11, nhóm Dự phòng). Webhook xuất bản cho dữ liệu CMS hết hạn ngay
 * (expire 0, xem app/api/revalidate); nếu sau đó CMS sập thì lần dựng lại đầu tiên của mọi trang
 * không còn dữ liệu nào và trả 500. Mỗi lần CMS trả lời (200 hoặc 404) thì ghi JSON ra đĩa, khoá
 * theo đường dẫn API (không kèm địa chỉ gốc, vì lúc build dùng URL công khai còn lúc chạy dùng URL
 * nội bộ). CMS lỗi mạng / 5xx thì đọc lại bản này: trang hiện nội dung trước đó thay vì báo lỗi.
 * Lúc build mọi lời gọi đều chạy thật nên thư mục có đủ bản của mọi trang; Dockerfile chép thư
 * mục này sang image chạy. Thư mục: CMS_FALLBACK_DIR, mặc định .cms-fallback trong thư mục chạy.
 */
function fallbackDir(): string {
  return (
    process.env.CMS_FALLBACK_DIR?.trim() ||
    path.join(process.cwd(), ".cms-fallback")
  );
}

function fallbackFile(key: string): string {
  const name = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return path.join(fallbackDir(), `${name}.json`);
}

/** Nội dung đã ghi trong tiến trình này, để không ghi lại khi dữ liệu không đổi */
const written = new Map<string, string>();

async function remember(key: string, data: unknown): Promise<void> {
  const text = JSON.stringify({ key, data });
  if (written.get(key) === text) return;
  const file = fallbackFile(key);
  // Ghi tệp tạm rồi đổi tên: lần đọc song song không gặp tệp ghi dở
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(fallbackDir(), { recursive: true });
    await writeFile(tmp, text);
    await rename(tmp, file);
    written.set(key, text);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    // Windows: nhiều tiến trình build cùng đổi tên vào một tệp thì báo EPERM; tiến trình khác đã ghi
    // cùng dữ liệu nên chỉ cảnh báo khi tệp đích thật sự chưa có
    const exists = await stat(file).then(
      () => true,
      () => false,
    );
    if (!exists) console.warn("[cms] không ghi được bản dự phòng", String(err));
  }
}

async function fallback<T>(key: string, error: CmsError): Promise<T | null> {
  try {
    const saved = JSON.parse(await readFile(fallbackFile(key), "utf8")) as {
      key: string;
      data: T | null;
    };
    if (saved.key === key) {
      console.warn(`[cms] dùng bản dự phòng do CMS lỗi: ${error.message}`);
      return saved.data;
    }
  } catch {
    // Chưa có bản dự phòng: báo lỗi như thường
  }
  throw error;
}

/**
 * GET một endpoint CMS, trả JSON. 404 trả null (để trang gọi notFound()); lỗi khác ném CmsError,
 * trừ khi đã có bản dự phòng của đường dẫn đó (xem fallback ở trên).
 */
export async function cmsGet<T>(
  path: string,
  query: Query = {},
): Promise<T | null> {
  const base = cmsApiUrl();
  if (!base) throw new CmsError("CMS_API_URL chưa được đặt");

  const url = buildUrl(base, path, query);
  const key = url.slice(base.length);
  let res: Response | undefined;
  // Lỗi mạng (CMS đang khởi động lại, quá tải lúc build dựng nhiều trang cùng lúc): thử lại 2 lần
  for (let attempt = 0; !res; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { tags: [CMS_TAG], revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt >= RETRIES)
        return fallback<T>(
          key,
          new CmsError(`Không gọi được CMS (${url}): ${String(err)}`),
        );
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  if (res.status === 404) {
    await remember(key, null);
    return null;
  }
  if (res.status >= 500)
    return fallback<T>(
      key,
      new CmsError(`CMS trả lỗi ${res.status} (${url})`, res.status),
    );
  if (!res.ok)
    throw new CmsError(`CMS trả lỗi ${res.status} (${url})`, res.status);
  const data = (await res.json()) as T;
  await remember(key, data);
  return data;
}

type Page<T> = { count: number; total_pages: number; results: T[] };

/** Lấy hết các trang của một danh sách có phân trang (page_size tối đa 100) */
export async function cmsGetAll<T>(
  path: string,
  query: Query = {},
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const data = await cmsGet<Page<T>>(path, {
      ...query,
      page,
      page_size: 100,
    });
    if (!data) break;
    items.push(...data.results);
    if (page >= data.total_pages) break;
  }
  return items;
}

/**
 * Bí mật chung với CMS (CMS_SHARED_SECRET bên backend), dùng cho cả hai chiều:
 * CMS → Next (webhook revalidate) và Next → CMS (form Liên hệ).
 * CMS_REVALIDATE_SECRET là tên cũ (trước 2026-11-07), vẫn đọc để .env.local cũ chạy tiếp.
 */
export function cmsSharedSecret(): string | null {
  const secret =
    process.env.CMS_SHARED_SECRET?.trim() ||
    process.env.CMS_REVALIDATE_SECRET?.trim();
  return secret || null;
}

/**
 * GET có ký HMAC (body rỗng), không cache: dữ liệu riêng tư như bản nháp xem trước.
 * 404 trả null; chưa đặt bí mật hoặc lỗi khác ném CmsError.
 */
export async function cmsGetSigned<T>(path: string): Promise<T | null> {
  const base = cmsApiUrl();
  const secret = cmsSharedSecret();
  if (!base || !secret)
    throw new CmsError("Chưa đặt CMS_API_URL / CMS_SHARED_SECRET");
  const url = buildUrl(base, path, {});
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-BFC-Timestamp": timestamp,
        "X-BFC-Signature": signBody(secret, timestamp, new Uint8Array()),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new CmsError(`Không gọi được CMS (${url}): ${String(err)}`);
  }
  if (res.status === 404) return null;
  if (!res.ok)
    throw new CmsError(`CMS trả lỗi ${res.status} (${url})`, res.status);
  return (await res.json()) as T;
}

/** hex(HMAC-SHA256(secret, "<timestamp>.<body>")), cùng định dạng apps/core/revalidate.py */
export function signBody(secret: string, timestamp: string, body: Uint8Array) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest("hex");
}

/**
 * POST multipart lên CMS có ký HMAC, không cache. Trả JSON khi 2xx; lỗi ném CmsError
 * (status 400 = CMS không nhận dữ liệu).
 */
export async function cmsPostForm<T>(path: string, form: FormData): Promise<T> {
  const base = cmsApiUrl();
  const secret = cmsSharedSecret();
  if (!base) throw new CmsError("CMS_API_URL chưa được đặt");
  if (!secret) throw new CmsError("CMS_SHARED_SECRET chưa được đặt");

  // Mã hoá FormData thành bytes trước để ký đúng nội dung sẽ gửi (kèm boundary)
  const encoded = new Request("http://local/", { method: "POST", body: form });
  const body = new Uint8Array(await encoded.arrayBuffer());
  const contentType = encoded.headers.get("content-type") ?? "";
  const timestamp = String(Math.floor(Date.now() / 1000));

  const url = buildUrl(base, path, {});
  const send = () =>
    fetch(url, {
      method: "POST",
      body,
      headers: {
        Accept: "application/json",
        "Content-Type": contentType,
        "X-BFC-Timestamp": timestamp,
        "X-BFC-Signature": signBody(secret, timestamp, body),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  let res: Response;
  try {
    res = await send();
  } catch {
    // Lỗi mạng (kết nối keep-alive bị đóng...): thử lại 1 lần. CMS chặn bản gửi trùng nên không
    // sinh 2 yêu cầu nếu lần đầu thực ra đã tới nơi (QC 07/11).
    try {
      res = await send();
    } catch (err) {
      throw new CmsError(`Không gọi được CMS (${url}): ${String(err)}`);
    }
  }
  if (!res.ok) {
    throw new CmsError(`CMS trả lỗi ${res.status} (${url})`, res.status);
  }
  return (await res.json()) as T;
}
