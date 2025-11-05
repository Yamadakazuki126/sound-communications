// sending.js
const { debugLog, pcmToWavBlob, concatFloat32 } = SoundComm;

(function () {
  // 画面にデバッグログを出力するタイミングを最初に追加
  debugLog("sending.js initialized");

  const hiraEl = document.getElementById("hira");
  const bitsEl = document.getElementById("bits");
  const errEl = document.getElementById("err");
  const brEl = document.getElementById("br");
  const f0El = document.getElementById("f0");
  const f1El = document.getElementById("f1");
  const fadeEl = document.getElementById("fade");
  const ampEl = document.getElementById("amp");
  const addPreEl = document.getElementById("addPre");
  const preSecEl = document.getElementById("preSec");
  const useHammingEl = document.getElementById("useHamming");

  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const encodeBtn = document.getElementById("encode");

  // UIにログを表示するための関数
  function log(msg) {
    debugLog(msg);  // デバッグログにも出力
  }

  function setStatus(msg, cls = "") {
    statusEl.className = cls || "hint";
    statusEl.textContent = msg;
  }

  // ビット列を生成する関数
  function encodeAndSend() {
    const bits = bitsEl.value;
    if (!bits) {
      errEl.textContent = "ビット列が空です";
      debugLog("encodeAndSend: ビット列が空です");
      return;
    }

    errEl.textContent = "";
    log(`ビット列: ${bits}`);

    // ビット列を波形データに変換
    const f0 = Number(f0El.value) || 1400;
    const f1 = Number(f1El.value) || 2200;
    const br = Number(brEl.value) || 30;
    const fadeMs = Number(fadeEl.value) || 20;
    const amp = Number(ampEl.value) || 0.5;
    const useHamming = useHammingEl.checked;

    const pcm = encodeFSK(bits, f0, f1, br, fadeMs, amp, useHamming);

    // 波形データからWAVファイルを作成
    const wavBlob = pcmToWavBlob(pcm, 44100);

    // 作成したWAVファイルを再生
    const url = URL.createObjectURL(wavBlob);
    const audio = new Audio(url);
    audio.play();

    debugLog("encodeAndSend: WAV 再生開始");
  }

  // エンコードの処理
  function encodeFSK(bits, f0, f1, br, fadeMs, amp, useHamming) {
    // FSK（周波数変調）波形を生成
    let pcm = [];
    for (let i = 0; i < bits.length; i++) {
      const freq = bits[i] === "1" ? f1 : f0;
      pcm = pcm.concat(generateTone(freq, br, fadeMs, amp));
    }
    if (useHamming) {
      pcm = HammingCodec.encode(pcm);  // Hamming符号化を適用
    }
    return pcm;
  }

  // 周波数のトーンを生成する関数
  function generateTone(frequency, br, fadeMs, amp) {
    const sampleRate = 44100;
    const duration = 1 / br;
    const numSamples = Math.floor(duration * sampleRate);
    const fadeSamples = Math.floor(fadeMs * sampleRate / 1000);
    const pcm = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const fade = i < fadeSamples ? i / fadeSamples : 1;
      pcm[i] = Math.sin(2 * Math.PI * frequency * t) * fade * amp;
    }

    return pcm;
  }

  // イベントリスナー
  startBtn.addEventListener("click", () => {
    encodeAndSend();
    setStatus("データ送信中...", "ok");
  });

  stopBtn.addEventListener("click", () => {
    setStatus("送信停止", "err");
  });

  encodeBtn.addEventListener("click", encodeAndSend);
})();
