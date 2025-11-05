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

  function demodFSK(raw, fs, br, f0, f1, bitsExpected, usePre, th, preSec) {
    debugLog(
      `demodFSK: fs=${fs}, br=${br}, f0=${f0}, f1=${f1}, len=${raw.length}`
    );

    const N = raw.length;

    // ── 1. RMS 正規化 ─────────────────────
    const x = new Float32Array(N);
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = raw[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / N) || 1;
    const g = 0.5 / rms;
    for (let i = 0; i < N; i++) {
      let v = raw[i] * g;
      if (v > 1) v = 1;
      if (v < -1) v = -1;
      x[i] = v;
    }

    // ── 2. ビット長・開始位置計算 ─────────
    const samplesPerBit = Math.max(1, Math.round(fs / br));

    let start = 0;
    if (usePre && preSec > 0) {
      // プリアンブルぶんスキップ（雑に時間指定）
      start = Math.min(N, Math.floor(preSec * fs));
    }

    const maxBits = Math.floor((N - start) / samplesPerBit);
    const totalBits = bitsExpected
      ? Math.min(bitsExpected, maxBits)
      : maxBits;

    debugLog(
      `demodFSK: samplesPerBit=${samplesPerBit}, start=${start}, totalBits=${totalBits}`
    );

    let bits = "";

    // ── 3. 各ビット区間ごとにエネルギーを測って 0/1 判定 ─
    const invFs = 1 / fs;
    const TWO_PI = 2 * Math.PI;

    for (let b = 0; b < totalBits; b++) {
      const offset = start + b * samplesPerBit;

      let c0 = 0, s0 = 0;
      let c1 = 0, s1 = 0;

      for (let n = 0; n < samplesPerBit; n++) {
        const idx = offset + n;
        if (idx >= N) break;
        const sample = x[idx];
        const t = idx * invFs;

        const w0 = TWO_PI * f0 * t;
        const w1 = TWO_PI * f1 * t;

        const cos0 = Math.cos(w0);
        const sin0 = Math.sin(w0);
        const cos1 = Math.cos(w1);
        const sin1 = Math.sin(w1);

        c0 += sample * cos0;
        s0 += sample * sin0;
        c1 += sample * cos1;
        s1 += sample * sin1;
      }

      const p0 = c0 * c0 + s0 * s0;
      const p1 = c1 * c1 + s1 * s1;

      const ratio = (p1 + 1e-12) / (p0 + 1e-12);

      let bit;
      // th > 1 (デフォルト 1.4 前提)
      if (ratio > th) {
        bit = "1";
      } else if (ratio < 1 / th) {
        bit = "0";
      } else {
        // あいまいゾーンは強い方に寄せる
        bit = p1 >= p0 ? "1" : "0";
      }

      bits += bit;
    }
    debugLog(`demodFSK: decoded bits length = ${bits.length}`);
    return { bits };
  }

  // グローバルにまとめてぶら下げる
  global.SoundComm = {
    debugLog,
    pcmToWavBlob,
    concatFloat32,
    createAudioContext,
    demodFSK
  };
})(window);
