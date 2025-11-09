// handshake.js
(function (global) {
  function setupHandshakeUI() {
    // ここでは「固定文字列を message に入れて sendBtn をクリックする」だけに留める
    const msgInput = document.getElementById("message");
    const sendBtn = document.getElementById("sendBtn");

    if (!msgInput || !sendBtn) {
      console.warn("送信 UI が見つかりません。");
      return;
    }

    function sendFixed(text) {
      msgInput.value = text;
      // sending.js 側で click ハンドラを拾うことを想定
      sendBtn.click();
    }

    const map = [
      ["sendReqBtn", "REQ"],
      ["sendPermitBtn", "PERMIT"],
      ["sendOkBtn", "OK"],
      ["sendNgBtn", "NG"],
    ];

    map.forEach(([id, text]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener("click", function () {
        sendFixed(text);
      });
    });

    // 送信成功 / 失敗の表示を外から変更できるフック
    global.SoundHandshakeUI = {
      setTxStatus(message) {
        const el = document.getElementById("txStatus");
        if (el) el.textContent = message;
      },
    };
  }

  // DOM 構築後にボタンへイベントを張る
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupHandshakeUI);
  } else {
    setupHandshakeUI();
  }
})(window);
