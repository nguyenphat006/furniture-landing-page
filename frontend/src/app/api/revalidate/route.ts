import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { CMS_TAG, cmsSharedSecret } from "@/lib/cms/client";

/*
 * Webhook CMS gọi khi quản trị viên xuất bản / gỡ / sửa nội dung: đánh dấu cache dữ liệu CMS là cũ
 * (stale-while-revalidate), lượt xem kế tiếp sẽ lấy dữ liệu mới.
 *
 * Xác thực bằng chữ ký HMAC-SHA256 với bí mật chung CMS_SHARED_SECRET (cùng giá trị bên backend;
 * tên cũ CMS_REVALIDATE_SECRET vẫn đọc được): header X-BFC-Timestamp (giây) và X-BFC-Signature = hex(HMAC(secret, "<timestamp>.<body>")).
 * Chữ ký quá 5 phút bị từ chối để chống gửi lại.
 * Body: {"tags": ["cms"]}; chỉ chấp nhận tag đã biết.
 */

const MAX_SKEW_SECONDS = 300;
const ALLOWED_TAGS = new Set([CMS_TAG]);

function validSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
) {
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const secret = cmsSharedSecret();
  if (!secret) {
    return Response.json({ error: "revalidate_disabled" }, { status: 503 });
  }

  const timestamp = request.headers.get("x-bfc-timestamp") ?? "";
  const signature = request.headers.get("x-bfc-signature") ?? "";
  const body = await request.text();

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!/^\d+$/.test(timestamp) || !(age <= MAX_SKEW_SECONDS)) {
    return Response.json({ error: "invalid_timestamp" }, { status: 401 });
  }
  if (!validSignature(secret, timestamp, body, signature)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let tags: unknown;
  try {
    tags = (JSON.parse(body) as { tags?: unknown }).tags;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    !tags.every((t) => typeof t === "string" && ALLOWED_TAGS.has(t))
  ) {
    return Response.json({ error: "invalid_tags" }, { status: 400 });
  }

  for (const tag of tags as string[]) revalidateTag(tag, "max");
  return Response.json({ revalidated: tags });
}
