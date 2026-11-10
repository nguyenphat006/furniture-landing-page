/*
 * Chuẩn hoá chữ để tìm kiếm (2026-11-09): viết thường, bỏ dấu tiếng Việt (kể cả đ → d), mọi ký tự
 * không phải chữ / số thành khoảng trắng. "Ghế tắm nắng" và "ghe tam nang" cho cùng một chuỗi.
 * Dùng chung cho chỉ mục (server) và ô tìm (client) nên không import gì phía server.
 */

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Từ khoá đã chuẩn hoá, tách theo khoảng trắng; bỏ từ trùng */
export function tokens(query: string): string[] {
  return [...new Set(normalize(query).split(" ").filter(Boolean))];
}

/** Số ký tự tối thiểu (sau chuẩn hoá) để bắt đầu tìm */
export const MIN_QUERY = 2;
