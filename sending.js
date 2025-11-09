// sending.js
(function () {
  const { debugLog, pcmToWavBlob, concatFloat32 } = SoundComm;
  
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

  const genBtn = document.getElementById("gen");
  const stopBtn = document.getElementById("stop");
  const dlLink = document.getElementById("dl");
  const player = document.getElementById("player");
  const encodePlayBtn = document.getElementById("encodePlay");

  const SAMPLE_RATE = 44100;

  let currentUrl = null;

  function showError(message) {
    if (!errEl) return;
    errEl.textContent = message || "";
    errEl.hidden = !message;
    if (message) {
      debugLog(`ERROR: ${message}`);
    }
  }

  function sanitizeBits(input) {
    if (!input) return "";
    return input.replace(/[^01]/g, "");
  }

  function buildPreamble(bitRate, seconds) {
    const sec = Math.max(0, Number(seconds) || 0);
    const bits = Math.max(0, Math.round(sec * bitRate));
    if (bits === 0) return "";
    let out = "";
    for (let i = 0; i < bits; i++) {
      out += i % 2 === 0 ? "1" : "0";
    }
    return out;
  }

  function applyHamming(bitString) {
    if (!bitString) return "";
    if (bitString.length % 8 !== 0) {
      throw new Error("Hamming(7,4) を適用するには 8bit 単位で入力してください。");
    }
    return HammingCodec.encode(bitString);
  }

  function encodeAndSend(bitStringOverride, options = {}) {
    try {
      const { logLabel, lenForLog, payloadBitLengthForLog } = options;

      let bits = sanitizeBits(
        bitStringOverride != null ? bitStringOverride : bitsEl.value
      );
      bitsEl.value = bits;
      if (!bits) {
        showError("ビット列が空です。0/1 のみを入力してください。");
        return;
      }

      const bitRate = Math.max(1, Number(brEl.value) || 30);
      const f0 = Number(f0El.value) || 1400;
      const f1 = Number(f1El.value) || 2200;
      const fadeMs = Math.max(0, Number(fadeEl.value) || 0);
      const amplitude = Math.min(1, Math.max(0, Number(ampEl.value) || 0.6));
      if (useHammingEl.checked) {
        bits = applyHamming(bits);
      }

      const preambleBits = addPreEl.checked
        ? buildPreamble(bitRate, preSecEl.value)
        : "";

      const frameBits = preambleBits + bits;
      if (!frameBits) {
        showError("有効なビット列が生成できませんでした。");
        return;
      }

      const pcm = encodeFSK(frameBits, {
        bitRate,
        f0,
        f1,
        fadeMs,
        amplitude,
        sampleRate: SAMPLE_RATE
      });

      updatePlayer(pcm, SAMPLE_RATE);
      showError("");
      if (logLabel) {
        debugLog(
          `[${logLabel}] len=${lenForLog}, payloadBits=${payloadBitLengthForLog}, frameBits=${frameBits.length}, samples=${pcm.length}`
        );
      } else {
        debugLog(
          `encodeAndSend: generated ${frameBits.length} bits -> ${pcm.length} samples`
        );
      }
    } catch (err) {
      console.error(err);
      showError(err.message || "エンコード中にエラーが発生しました。");
    }
  }

  // ヘッダー用の文字数を MSB first の8bit配列に変換する
  function buildLenBits(len) {
    const bits = [];
    for (let i = 7; i >= 0; i--) {
      bits.push(((len >> i) & 1).toString());
    }
    return bits.join("");
  }

  // 入力テキストから [Len(8bit) + Payload(8bit*len)] のビット列を生成する
  function createMessageBitsFromText(text) {
    const trimmed = (text || "").trim();
    const nChars = trimmed.length;
    const len = Math.min(nChars, 64);
    const limitedText = trimmed.slice(0, len);

    const payloadBits = len > 0 ? window.KanaCodec.textToBits(limitedText) : "";
    const lenBits = buildLenBits(len);
    const messageBits = lenBits + payloadBits;

    return { len, payloadBits, messageBits };
  }

  // テキスト入力をフレーム化して送信するハンドラ
  function encodeTextAndSend() {
    const text = hiraEl.value;
    const { len, payloadBits, messageBits } = createMessageBitsFromText(text);

    if (len === 0) {
      showError("送信する文字がありません。");
      return;
    }

    bitsEl.value = messageBits;
    encodeAndSend(messageBits, {
      logLabel: "encodeText",
      lenForLog: len,
      payloadBitLengthForLog: payloadBits.length
    });
  }

  function encodeFSK(bitString, {
    bitRate,
    f0,
    f1,
    fadeMs,
    amplitude,
    sampleRate
  }) {
    if (!bitString) {
      return new Float32Array();
    }

    const bitDuration = 1 / bitRate;
    const samplesPerBit = Math.max(1, Math.floor(bitDuration * sampleRate));
    const fadeSamples = Math.min(
      Math.floor((fadeMs / 1000) * sampleRate),
      Math.floor(samplesPerBit / 2)
    );

    let phase = 0;
    const chunks = [];

    for (let i = 0; i < bitString.length; i++) {
      const freq = bitString[i] === "1" ? f1 : f0;
      const { chunk, nextPhase } = generateTone({
        frequency: freq,
        samples: samplesPerBit,
        sampleRate,
        fadeSamples,
        amplitude,
        phase
      });
      chunks.push(chunk);
      phase = nextPhase;
    }

    return concatFloat32(chunks);
  }

  function generateTone({
    frequency,
    samples,
    sampleRate,
    fadeSamples,
    amplitude,
    phase
  }) {
    const chunk = new Float32Array(samples);
    const phaseIncrement = (2 * Math.PI * frequency) / sampleRate;
    let currentPhase = phase;

    for (let i = 0; i < samples; i++) {
      let env = 1;
      if (fadeSamples > 0) {
        if (i < fadeSamples) {
          env = i / fadeSamples;
        } else if (i >= samples - fadeSamples) {
          env = (samples - i) / fadeSamples;
        }
      }
      chunk[i] = Math.sin(currentPhase) * amplitude * env;
      currentPhase += phaseIncrement;
    }

    currentPhase %= 2 * Math.PI;
    return { chunk, nextPhase: currentPhase };
  }

  function updatePlayer(pcm, sampleRate) {
    if (!player) return;

    const wavBlob = pcmToWavBlob(pcm, sampleRate);
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
    currentUrl = URL.createObjectURL(wavBlob);

    player.pause();
    player.src = currentUrl;
    player.currentTime = 0;
    player.load();
    player.play().catch((err) => {
      debugLog(`player.play failed: ${err}`);
    });

    if (dlLink) {
      dlLink.href = currentUrl;
      dlLink.style.display = "inline-block";
    }
  }

  if (genBtn) {
    genBtn.addEventListener("click", encodeAndSend);
  }

  if (encodePlayBtn) {
    encodePlayBtn.addEventListener("click", encodeTextAndSend);
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (player) {
        player.pause();
        player.currentTime = 0;
      }
    });
  }
})();
