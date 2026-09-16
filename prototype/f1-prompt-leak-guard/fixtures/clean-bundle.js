// Fixture mô phỏng bundle SẠCH — client chỉ gửi tin nhắn tới API, không hề có prompt.
"use strict";
async function sendMessage(text){
  const res = await fetch("/api/chat", { method:"POST", body: JSON.stringify({ text }) });
  return res.body; // prompt nằm ở server, client không bao giờ thấy
}
function renderChat(){/* ...app code... */}
export { sendMessage, renderChat };
