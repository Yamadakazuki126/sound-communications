// receiving.js
const {
  debugLog,
  pcmToWavBlob,
  concatFloat32,
  createAudioContext,
  demodFSK,
  FSKDemodState,
  demodFSKChunk
} = SoundComm;

(function () {
  // 画面にデバッグログを出力するタイミングを最初に追加
  debugLog("receiving.js initialized");

  const startBtn = document.getElementById("start");
  const stopBtn = document.getElementById("stop");
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const hiraEl = document.getElementById("decodedHira");
  const logEl = document.getElementById("log");
  const useHammingRxEl = document.getElementById("useHammingRx");
  const recPlayer = document.getElementById("recPlayer");
  const recvTextEl = document.getElementById("recvText");

  const brEl = document.getElementById("br");
  const f0El = document.getElementById("f0");
  const f1El = document.getElementById("f1");
  const secsEl = document.getElementById("secs");
  const bitsExpectedEl = document.getElementById("bitsExpected");
  const usePreambleEl = document.getElementById("usePreamble");
  const preSecEl = document.getElementById("preSec");
  const thEl = document.getElementById("th");

  let ctx, mediaStream, source, processor;
  let captured = [];
  let sampleRate = 44100;
  let recUrl = null;
  let stopTimer = null;

  let streamingDemodState = null;
  let streamingPendingBits = "";
  let streamingDecodedText = "";

  function setStatus(msg, cls = "") {
    statusEl.className = cls || "hint";
    statusEl.textContent = msg;
  }

  // 音声の正規化
  function normalizeFloat32(arr) {
    let sum = 0;
    for (const v of arr) sum += v * v;
    const rms = Math.sqrt(sum / arr.length) || 1;
    const g = 0.5 / rms;
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++)
      out[i] = Math.max(-1, Math.min(1, arr[i] * g));
    return out;
  }

  // 受信したビット列からヘッダー付きフレームを解析する
  function decodeFrameBits(rawBitString, { context = "decode", suppressPartialLog = false } = {}) {
    const rawBits = rawBitString || "";
    const useHamming = useHammingRxEl.checked;

    const blockSize = useHamming ? 14 : 8;
    const usableLength = Math.floor(rawBits.length / blockSize) * blockSize;
    if (usableLength === 0) {
      if (!suppressPartialLog) {
        debugLog(`[${context}] ヘッダー解析に必要なビット数が不足しています (raw=${rawBits.length})`);
      }
      return { success: false, reason: "insufficient-raw" };
    }

    const decodableRawBits = rawBits.slice(0, usableLength);
    const messageBits = useHamming
      ? HammingCodec.decode(decodableRawBits)
      : decodableRawBits;

    if (!messageBits || messageBits.length < 8) {
      if (!suppressPartialLog) {
        debugLog(`[${context}] ヘッダー8bitを取得できませんでした (messageBits=${messageBits ? messageBits.length : 0})`);
      }
      return { success: false, reason: "no-header" };
    }

    const lenBits = messageBits.slice(0, 8);
    let len = 0;
    for (let i = 0; i < 8; i++) {
      len = (len << 1) | (lenBits.charCodeAt(i) & 1);
    }

    if (len > 64) {
      debugLog(`[${context}] header len=${len} (max 64). discard frame`);
      return { success: false, reason: "len-too-large" };
    }

    const needBits = len * 8;
    const availablePayloadBits = messageBits.length - 8;
    if (availablePayloadBits < needBits) {
      if (!suppressPartialLog) {
        debugLog(
          `[${context}] not enough bits for payload: need=${needBits}, actual=${availablePayloadBits}`
        );
      }
      return { success: false, reason: "insufficient-payload" };
    }

    const payloadBits = messageBits.slice(8, 8 + needBits);
    const text = window.KanaCodec.bitsToHiragana(payloadBits) || "";
    const usedMessageBits = messageBits.slice(0, 8 + needBits);

    debugLog(
      `[${context}] header len=${len}, payloadBits=${payloadBits.length}, text="${text}"`
    );

    return {
      success: true,
      len,
      payloadBits,
      text,
      messageBits: usedMessageBits,
      consumedRawBits: decodableRawBits.length
    };
  }

  function handleStreamingBits(bitStr) {
    if (!bitStr) return;

    // ビットを貯める
    streamingPendingBits += bitStr;

    // いま持っているビット全部からテキストに変換
    // ストリーミング時もヘッダー解析を試みる（不足時は静かに待機）
    const result = decodeFrameBits(streamingPendingBits, {
      context: "streaming",
      suppressPartialLog: true
    });

    if (result.success) {
      const nextText = result.text || "";
      if (recvTextEl) {
        recvTextEl.textContent = nextText;
      }

      streamingDecodedText = nextText;
    }
  }

  // 録音開始処理
  async function startRecording() {
    try {
      debugLog("startRecording: 録音開始");

      // 既存の録音があれば停止してから再開する
      if (processor || source || mediaStream) {
        stopRecording();
      }

      captured = [];

      if (!ctx) {
        ctx = createAudioContext(44100);
      }

      await ctx.resume();

      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });

      sampleRate = ctx.sampleRate;
      debugLog("startRecording: MediaStream 確保 OK, sampleRate=" + sampleRate);

      const fs = sampleRate;
      const br = Number(brEl.value) || 30;
      const f0 = Number(f0El.value) || 1400;
      const f1 = Number(f1El.value) || 2200;
      const usePre = usePreambleEl.checked;
      const preSec = Number(preSecEl.value) || 0;
      const th = Number(thEl.value) || 1.4;

      streamingDemodState = new FSKDemodState({
        fs,
        br,
        f0,
        f1,
        threshold: th,
        expectedLength: null,
        usePre,
        preSec
      });
      streamingPendingBits = "";
      streamingDecodedText = "";
      if (recvTextEl) {
        recvTextEl.textContent = "";
      }

      source = ctx.createMediaStreamSource(mediaStream);

      const bufferSize = 2048;
      processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processor.onaudioprocess = (e) => {
        const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
        captured.push(chunk);

        if (streamingDemodState) {
          const bitsArray = demodFSKChunk(chunk, streamingDemodState);
          if (bitsArray && bitsArray.length) {
            const bitStr = bitsArray.map((b) => (b ? "1" : "0")).join("");
            handleStreamingBits(bitStr);
          }
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      const secs = Math.max(1, Math.min(20, Number(secsEl.value) || 4));
      setStatus(`録音中…（${secs}秒）`, "ok");
      startBtn.disabled = true;
      stopBtn.disabled = false;

      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      stopTimer = setTimeout(() => {
        stopTimer = null;
        stopRecording();
      }, secs * 1000);
    } catch (err) {
      debugLog("startRecording: エラー", err);
      console.error(err);

      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }

      if (processor) {
        processor.disconnect();
        processor.onaudioprocess = null;
        processor = null;
      }

      if (source) {
        source.disconnect();
        source = null;
      }

      streamingDemodState = null;
      streamingPendingBits = "";
      streamingDecodedText = "";
      if (recvTextEl) {
        recvTextEl.textContent = "";
      }

      startBtn.disabled = false;
      stopBtn.disabled = true;

      setStatus(
        "マイク取得に失敗しました。HTTPSと権限を確認してください。",
        "err"
      );
    }
  }

  // 録音停止処理
  function stopRecording() {
    debugLog("stopRecording: 呼び出し, チャンク数=" + captured.length);
    if (processor) {
      processor.disconnect();
      processor.onaudioprocess = null;
      processor = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }

    // 録音した音を再生できるようにする
    if (captured.length && recPlayer) {
      const pcm = concatFloat32(captured); // 全チャンクを1本に
      const blob = pcmToWavBlob(pcm, sampleRate); // WAVに変換
      if (recUrl) {
        URL.revokeObjectURL(recUrl);
      }
      recUrl = URL.createObjectURL(blob);
      recPlayer.pause();
      recPlayer.src = recUrl;
      recPlayer.load();
      recPlayer.currentTime = 0;
      debugLog("stopRecording: WAV を recPlayer にセット");
    } else {
      debugLog("stopRecording: captured が空, 再生用データなし");
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (captured.length) {
      setStatus("録音停止。解析を開始します…", "hint");
      decodeNow();
    } else {
      setStatus("録音データがありません。", "err");
    }
  }

  // 解析処理（復調）
  function decodeNow() {
    debugLog("decodeNow: 解析開始, captured チャンク数=" + captured.length);
    if (!captured.length) {
      setStatus("録音データがありません。", "err");
      return;
    }

    const fs = sampleRate;
    const br = Number(brEl.value) || 30;
    const f0 = Number(f0El.value) || 1400;
    const f1 = Number(f1El.value) || 2200;
    const bitsExpected = Number(bitsExpectedEl.value) || null;
    const usePre = usePreambleEl.checked;
    const preSec = Number(preSecEl.value) || 0;
    const th = Number(thEl.value) || 1.4;

    const raw = concatFloat32(captured);

    setStatus("解析中…", "hint");
    const t0 = performance.now();
    const out = demodFSK(
      raw,
      fs,
      br,
      f0,
      f1,
      bitsExpected,
      usePre,
      th,
      preSec
    );
    const t1 = performance.now();

    const rawBits = out.bits || "";
    const frame = decodeFrameBits(rawBits, { context: "decodeNow" });

    if (!frame.success) {
      resultEl.textContent = rawBits || "(空)";
      hiraEl.textContent = "(デコード結果なし)";
      setStatus("フレームの解析に失敗しました。ログを確認してください。", "err");
      return;
    }

    resultEl.textContent = frame.messageBits || "(空)";

    const hiraText = frame.text || "";
    hiraEl.textContent = hiraText || "(デコード結果なし)";

    setStatus(
      `解析完了（${(t1 - t0).toFixed(1)} ms, 生=${rawBits.length}bit / メッセージ=${frame.messageBits.length}bit / ペイロード=${frame.payloadBits.length}bit）`,
      "ok"
    );
    debugLog(
      `decodeNow: 完了 rawBits=${rawBits.length}, messageBits=${frame.messageBits.length}, elapsed=${(
        t1 - t0
      ).toFixed(1)}ms`
    );
  }

  startBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", stopRecording);
})();
