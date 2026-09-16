# Prototype F1 — Guard chặn rò rỉ system prompt

Sửa finding **F1**: toàn bộ system prompt của STOW (~19.000 token) đang nằm trong bundle JS công khai, ai mở DevTools cũng đọc được.

Guard này **không cần biết nguyên nhân nội bộ** (Client Component nào import prompt). Nó bắt **hậu quả** — sự hiện diện của những chuỗi đặc trưng của prompt trong file client — nên đúng đường rò nào cũng bị chặn, và chặn cả các lần tái diễn về sau.

## Cách chạy

Không phụ thuộc gói ngoài. Cần Node ≥ 18 (có `fetch` sẵn).

```bash
# Demo before/after bằng fixtures (không cần mạng)
node check-prompt-leak.mjs fixtures/leaky-bundle.js    # -> FAIL (exit 1)
node check-prompt-leak.mjs fixtures/clean-bundle.js    # -> PASS (exit 0)

# Quét thư mục build thật trong CI
node check-prompt-leak.mjs .next/static

# Quét site đang chạy (dùng để chứng minh trạng thái hiện tại)
node check-prompt-leak.mjs --url https://stow.mystorage.vn/chat
```

Exit code: `0` = sạch · `1` = phát hiện rò rỉ · `2` = lỗi sử dụng. Đúng chuẩn một bước CI.

## Kết quả kiểm chứng (2026-09-16)

Chạy trên site thật bắt được rò rỉ ở **hai** chunk (xem [evidence/F1-prompt-leak-guard-output.txt](../../evidence/F1-prompt-leak-guard-output.txt)):

```
Quét 8 file · 6 sentinel
...
  ✗ /_next/static/chunks/app/chat/layout-b6ab9543125dad74.js  (577,138 bytes)
      • "HARD RULES" ×2
      • "Examples of slips that have happened in production" ×1
      • "currently FULL internally" ×1
      ...
  ✗ /_next/static/chunks/app/chat/%5B%5B...id%5D%5D/page-fcf58426d41dc68a.js  (930,792 bytes)
      • "HARD RULES" ×2
      ...

FAIL — phát hiện system prompt trong bundle client. Prompt phải ở lại server (xem F1).
```

6/8 chunk sạch, 2 chunk của `/chat` dính đủ 6 sentinel. Output đầy đủ (không cắt) nằm trong file
evidence ở trên.

Fixtures chứng minh guard phân biệt đúng: bản rò → FAIL, bản sạch (client chỉ gọi `/api/chat`) → PASS.

> Các fixture **không** chứa prompt thật của MyStorage — chỉ vài chuỗi sentinel để minh hoạ. Nhất quán với F1: không phát tán nội dung prompt.

## Cắm vào CI

Thêm một bước sau `next build`. Ví dụ GitHub Actions ([ci-example.yml](ci-example.yml)):

```yaml
- run: npm run build
- run: node check-prompt-leak.mjs .next/static   # fail build nếu prompt lọt ra client
```

Kết hợp với bản vá gốc của F1 (chuyển prompt sang module `import 'server-only'`, gọi model qua Route Handler): bản vá bịt lỗ hiện tại, guard này ngăn nó quay lại.

## Chỉnh sentinel

Sửa mảng `SENTINELS` ở đầu `check-prompt-leak.mjs` cho khớp câu chữ đặc trưng trong prompt của bạn. Chọn chuỗi càng “văn xuôi hướng dẫn” càng tốt (vd `HARD RULES`, `do NOT tell the customer`) để tránh báo nhầm với tên hàm/biến thông thường.
