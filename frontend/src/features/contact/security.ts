/*
 * Lớp bảo vệ cho form Liên hệ (2026-11-05). CHỈ dùng phía server (import từ actions.ts).
 *
 * Tệp đính kèm:
 *   1. Đuôi tệp nằm trong danh sách cho phép, kích thước <= 10 MB, chỉ 1 tệp.
 *   2. Kiểm tra "magic bytes": nội dung thật phải khớp đuôi (chặn exe đổi tên thành .pdf).
 *   3. PDF có nội dung chủ động (JavaScript, Launch, tệp nhúng, OpenAction) bị từ chối.
 *   4. Tên tệp được làm sạch, không dùng tên gốc để lưu hay làm đường dẫn.
 *   Không nhận ZIP: tệp nén có thể giấu tệp thực thi và không kiểm tra được bên trong.
 *   Lớp này KHÔNG thay được quét virus: khi nối gửi thật, quét bằng ClamAV / dịch vụ quét
 *   trước khi chuyển tệp cho nhân viên, lưu ở kho riêng tư (không đặt trong public/).
 *
 * Văn bản: bỏ ký tự điều khiển; trường một dòng bỏ cả xuống dòng (chống chèn header email).
 * Giới hạn tần suất: theo IP, bộ nhớ trong tiến trình (đủ cho 1 server; nhiều instance
 * hoặc serverless cần chuyển sang Redis / Upstash).
 */

import { inflateSync } from "node:zlib";
import { FILE_EXTENSIONS, MAX_FILE_BYTES } from "./inquiry";

type Ext = (typeof FILE_EXTENSIONS)[number];

function extOf(name: string): Ext | null {
  const lower = name.toLowerCase();
  return FILE_EXTENSIONS.find((e) => lower.endsWith(e)) ?? null;
}

function startsWith(bytes: Uint8Array, sig: number[]) {
  return sig.every((b, i) => bytes[i] === b);
}

/** Nội dung thật có khớp đuôi tệp không */
function matchesSignature(ext: Ext, bytes: Uint8Array) {
  switch (ext) {
    case ".pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case ".png":
      return startsWith(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case ".jpg":
    case ".jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case ".dwg":
      return startsWith(bytes, [0x41, 0x43, 0x31]); // "AC1" (AC1012...AC1032)
    case ".dxf": {
      const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64));
      if (head.startsWith("AutoCAD Binary DXF")) return true;
      // DXF dạng chữ: mở đầu bằng group code 0 (SECTION) hoặc 999 (chú thích)
      return /^\s*(0|999)\s*\r?\n/.test(head);
    }
  }
}

const PDF_ACTIVE =
  /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)\b/;
/** Object stream (PDF 1.5+): các đối tượng nằm ở dạng nén, giải nén mới thấy bên trong */
const PDF_OBJSTM = /\/Type\s*\/ObjStm\b[^>]*?>>\s*stream\r?\n/g;
const PDF_INFLATE_LIMIT = 20 * 1024 * 1024;

/** Tên PDF viết bằng mã #xx (/J#61vaScript = /JavaScript): giải mã trước khi so */
function unhex(text: string) {
  return text.replace(/#([0-9A-Fa-f]{2})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  );
}

/**
 * PDF có hành động tự chạy / tệp nhúng: từ chối. Kể cả tên viết bằng #xx hay nằm trong object
 * stream nén (QC 09/11); cùng cách với backend/apps/inquiries/files.py. Chỉ giải nén object
 * stream, không giải nén ảnh (điểm ảnh có thể tình cờ chứa "/JS").
 */
function pdfHasActiveContent(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  if (PDF_ACTIVE.test(unhex(text))) return true;
  let budget = PDF_INFLATE_LIMIT;
  for (const match of text.matchAll(PDF_OBJSTM)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = text.indexOf("endstream", start);
    const raw = bytes.subarray(start, end === -1 ? bytes.length : end);
    let out: Buffer;
    try {
      // Vượt giới hạn (bom nén) hay không giải nén được thì không kiểm được: từ chối
      out = inflateSync(raw, { maxOutputLength: budget, finishFlush: 2 });
    } catch {
      return true;
    }
    budget -= out.length;
    if (PDF_ACTIVE.test(unhex(out.toString("latin1")))) return true;
  }
  return false;
}

export type FileCheck =
  | { ok: true; file: null }
  | { ok: true; file: { name: string; type: Ext; bytes: Uint8Array } }
  | { ok: false };

export async function checkAttachment(formData: FormData): Promise<FileCheck> {
  const entries = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (entries.length === 0) return { ok: true, file: null };
  if (entries.length > 1) return { ok: false };

  const f = entries[0];
  const ext = extOf(f.name);
  if (!ext || f.size > MAX_FILE_BYTES) return { ok: false };

  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes.byteLength !== f.size || !matchesSignature(ext, bytes)) {
    return { ok: false };
  }
  if (ext === ".pdf" && pdfHasActiveContent(bytes)) return { ok: false };

  return {
    ok: true,
    file: { name: safeFileName(f.name, ext), type: ext, bytes },
  };
}

/** Tên tệp an toàn: chỉ chữ, số, gạch; luôn kết thúc bằng đúng một đuôi cho phép */
export function safeFileName(original: string, ext: Ext) {
  const base = original
    .replace(/^.*[\\/]/, "")
    .slice(0, -ext.length)
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${base || "attachment"}${ext}`;
}

/** CR, LF và hai ký tự xuống dòng Unicode (U+2028, U+2029) */
const LINE_BREAKS = new RegExp(
  "[" + String.fromCharCode(10, 13, 0x2028, 0x2029) + "]+",
  "g",
);

/** Bỏ ký tự điều khiển; singleLine = bỏ cả xuống dòng */
export function cleanText(value: string, singleLine: boolean) {
  const noControl = value.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
    "",
  );
  return singleLine ? noControl.replace(LINE_BREAKS, " ") : noControl;
}

/* ---------- Giới hạn tần suất theo IP ---------- */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

export function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Dọn bộ nhớ để Map không phình mãi
  if (hits.size > 5000) {
    for (const [key, list] of hits) {
      if (list.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

export function clientIp(h: Headers) {
  // Sau Nginx (deploy/): X-Real-IP = $remote_addr, khách không giả được. Không lấy phần tử đầu
  // x-forwarded-for vì khách tự gửi header đó để lách giới hạn theo IP (QC 07/11); chỉ dùng phần tử
  // cuối (do proxy gần nhất thêm) khi không có X-Real-IP.
  const real = h.get("x-real-ip")?.trim();
  const fwd = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return real || fwd || "unknown";
}

/** Gửi quá nhanh sau khi trang tải (< 3 giây) gần như chắc chắn là bot */
export function submittedTooFast(startedAt: FormDataEntryValue | null) {
  if (typeof startedAt !== "string" || !/^\d{13}$/.test(startedAt))
    return false;
  const elapsed = Date.now() - Number(startedAt);
  return elapsed >= 0 && elapsed < 3000;
}
