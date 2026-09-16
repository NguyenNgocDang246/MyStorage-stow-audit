// F3 — đo độ trễ của /api/chat tại biên client.
//
// Cách dùng: mở https://stow.mystorage.vn/chat, mở DevTools → Console,
// dán TOÀN BỘ file này, Enter, rồi gửi câu hỏi. Mỗi lượt in một dòng [stow].
// Dán lại sau mỗi lần reload trang.
//
// Vì sao không dùng thẳng tab Network: /api/chat là endpoint streaming, cột Status
// nhảy 200 ngay khi headers về (~0,2 s) trong khi body còn chảy thêm cả phút. Cột
// Status vì thế vô dụng, và "thời gian phản hồi" cần được tách làm ba mốc riêng.
//
// response.body.tee() nhân đôi stream: một bản cho ứng dụng, một bản để đo.
// Ứng dụng không hề bị ảnh hưởng, chat chạy bình thường.

(() => {
  if (window.__stowTimingHook) {
    console.log('[stow] hook đã cài rồi — cứ gửi câu hỏi.');
    return;
  }
  window.__stowTimingHook = true;

  const orig = window.fetch;
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    if (!url || !url.includes('/api/chat')) return orig(...args);

    const t0 = performance.now();
    const res = await orig(...args);
    const tHeaders = performance.now();          // TTFB: headers đã về
    if (!res.body) return res;

    const [forApp, forMeasure] = res.body.tee();

    (async () => {
      const reader = forMeasure.getReader();
      let tFirstByte = null, bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (tFirstByte === null) tFirstByte = performance.now();
        bytes += value.length;
      }
      const tEnd = performance.now();
      const s = (t) => ((t - t0) / 1000).toFixed(2) + 's';
      console.log(
        '[stow] TTFB', s(tHeaders),
        '| byte đầu', tFirstByte ? s(tFirstByte) : 'n/a',
        '| xong', s(tEnd),
        '|', bytes, 'bytes'
      );
    })();

    return new Response(forApp, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  console.log('[stow] hook đã cài — gửi câu hỏi đi.');
})();

// Đọc ba con số:
//   TTFB      — vận chuyển. Ở stow luôn dưới 1 s, nên mạng/cold start không phải vấn đề.
//   byte đầu  — byte body đầu tiên. KHÔNG đồng nghĩa "token đầu tiên": frame đầu của
//               giao thức SSE có thể chỉ là metadata.
//   xong      — stream đóng, tức là lúc khách thật sự đọc được câu trả lời, vì client
//               không hiện chữ nào trước đó.
