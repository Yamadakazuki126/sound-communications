// sound-utils.js
(function (global) {
  function debugLog(msg) {
    console.log(msg);  // コンソールにも出力
    const box = document.getElementById("debug-log");
    if (!box) {
      console.warn("debug-log element not found!");
      return;
    }
    const time = new Date().toISOString().split("T")[1].split(".")[0];
    box.textContent += `[${time}] ${msg}\n`;  // ログを追加
    box.scrollTop = box.scrollHeight;  // スクロールを下に
  }

  function pcmToWavBlob(pcm, sampleRate) {
    const numFrames = pcm.length;
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * bytesPerSample;

    const buf = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(buf);

    writeStr(dv, 0, "RIFF");
    dv.setUint32(4, 36 + dataSize, true);
    writeStr(dv, 8, "WAVE");

    writeStr(dv, 12, "fmt ");
    dv.setUint32(16, 16, true); // PCM
    dv.setUint16(20, 1, true);  // PCM
    dv.setUint16(22, numChannels, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, byteRate, true);
    dv.setUint16(32, blockAlign, true);
    dv.setUint16(34, 16, true); // 16bit

    writeStr(dv, 36, "data");
    dv.setUint32(40, dataSize, true);

    let o = 44;
    for (let i = 0; i < numFrames; i++) {
      let s = Math.max(-1, Math.min(1, pcm[i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    return new Blob([dv], { type: "audio/wav" });

    function writeStr(dv, offset, str) {
      for (let i = 0; i < str.length; i++) {
        dv.setUint8(offset + i, str.charCodeAt(i));
      }
    }
  }

  function concatFloat32(chunks) {
    const total = chunks.reduce((sum, a) => sum + a.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const a of chunks) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  function createAudioContext(sampleRate = 44100) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      throw new Error("Web Audio API is not supported in this browser");
    }

    try {
      return new AudioCtx({ sampleRate });
    } catch (err) {
      // 一部ブラウザでは sampleRate オプションが未対応なので、フォールバックする
      console.warn("createAudioContext: fallback without explicit sampleRate", err);
      return new AudioCtx();
    }
  }

  // グローバルにまとめてぶら下げる
  global.SoundComm = {
    debugLog,
    pcmToWavBlob,
    concatFloat32,
    createAudioContext
  };
})(window);
