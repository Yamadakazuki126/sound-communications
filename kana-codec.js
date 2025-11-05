// kana-codec.js  — 1文字 = 6bitベース + 2bitフラグ (計8bit)
(function (global) {
  // 6bitベース文字テーブル（※濁点・小文字は入れない）
  // index と 6bitコードは、これまでの設計と同じ並びにしてある。
  // 例: "あ" = 1 (000001), "か" = 6 (000110), "ひ" = 27 (011011), "よ" = 38 (100110)
  const HIRA_TABLE = [
    " ",              // 0

    "あ", "い", "う", "え", "お",           // 1-5
    "か", "き", "く", "け", "こ",           // 6-10
    "さ", "し", "す", "せ", "そ",           // 11-15
    "た", "ち", "つ", "て", "と",           // 16-20
    "な", "に", "ぬ", "ね", "の",           // 21-25
    "は", "ひ", "ふ", "へ", "ほ",           // 26-30
    "ま", "み", "む", "め", "も",           // 31-35
    "や", "ゆ", "よ",                       // 36-38
    "ら", "り", "る", "れ", "ろ",           // 39-43
    "わ", "を", "ん",                       // 44-46
    "。", "、"                              // 47-48
    // 0〜63 までのうち、残りは未使用（拡張余地）
  ];

  // 文字 → ベースコード
  const charToCode = {};
  HIRA_TABLE.forEach((ch, i) => {
    charToCode[ch] = i;
  });

  // ==== 濁点・半濁点・小文字の対応表 ====

  // 入力文字 → ベース文字（濁点付き/半濁点付き/小文字）
  const DAKU_BASE = {
    "が": "か", "ぎ": "き", "ぐ": "く", "げ": "け", "ご": "こ",
    "ざ": "さ", "じ": "し", "ず": "す", "ぜ": "せ", "ぞ": "そ",
    "だ": "た", "ぢ": "ち", "づ": "つ", "で": "て", "ど": "と",
    "ば": "は", "び": "ひ", "ぶ": "ふ", "べ": "へ", "ぼ": "ほ"
  };

  const HANDAKU_BASE = {
    "ぱ": "は", "ぴ": "ひ", "ぷ": "ふ", "ぺ": "へ", "ぽ": "ほ"
  };

  const SMALL_BASE = {
    "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
    "ゃ": "や", "ゅ": "ゆ", "ょ": "よ",
    "っ": "つ", "ゎ": "わ"
  };

  // ベース文字 → 濁音 / 半濁音 / 小文字（復号側）
  const MAKE_DAKU = {
    "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
    "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
    "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど",
    "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ"
  };

  const MAKE_HANDAKU = {
    "は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ"
  };

  const MAKE_SMALL = {
    "あ": "ぁ", "い": "ぃ", "う": "ぅ", "え": "ぇ", "お": "ぉ",
    "や": "ゃ", "ゆ": "ゅ", "よ": "ょ",
    "つ": "っ", "わ": "ゎ"
  };

  // ==== 書式 ====
  // 1文字 = 6bit (ベース文字) + 2bit (フラグ)
  //
  //  フラグ 00: 通常
  //  フラグ 01: 濁点付き
  //  フラグ 10: 半濁点付き
  //  フラグ 11: 小文字
  //
  //  例:
  //   「あ」: base="あ"(1=000001), flag=00 → 000001 00
  //   「が」: base="か"(6=000110), flag=01 → 000110 01
  //   「ぴ」: base="ひ"(27=011011), flag=10 → 011011 10
  //   「ょ」: base="よ"(38=100110), flag=11 → 100110 11

  function encodeCharTo8bits(ch) {
    let base = ch;
    let flag = "00"; // デフォルト＝通常

    if (DAKU_BASE[ch]) {
      base = DAKU_BASE[ch];
      flag = "01";
    } else if (HANDAKU_BASE[ch]) {
      base = HANDAKU_BASE[ch];
      flag = "10";
    } else if (SMALL_BASE[ch]) {
      base = SMALL_BASE[ch];
      flag = "11";
    }

    if (!(base in charToCode)) {
      // 対応外文字は null で返してスキップさせる
      return null;
    }

    const code = charToCode[base];      // 0〜63
    const sixBits = code.toString(2).padStart(6, "0");
    return sixBits + flag;              // 8bit文字
  }

  function decode8bitsToChar(byteStr) {
    if (byteStr.length !== 8) return ""; // 想定外

    const sixBits = byteStr.slice(0, 6);
    const flagBits = byteStr.slice(6, 8);

    const val = parseInt(sixBits, 2);
    if (Number.isNaN(val) || val < 0 || val >= HIRA_TABLE.length) {
      return "□"; // 未定義コード
    }

    const base = HIRA_TABLE[val] || "□";

    switch (flagBits) {
      case "00": // 通常
        return base;

      case "01": // 濁点
        return MAKE_DAKU[base] || base;

      case "10": // 半濁点
        return MAKE_HANDAKU[base] || base;

      case "11": // 小文字
        return MAKE_SMALL[base] || base;

      default:
        return base;
    }
  }

  // ==== 公開関数 ====

  // ひらがなテキスト → 8bit列（"0/1"文字列）
  function textToBits(str) {
    if (!str) return "";
    let bits = "";

    for (let ch of str) {
      // 改行やタブはスペース扱い
      if (ch === "\n" || ch === "\r" || ch === "\t") {
        ch = " ";
      }

      const byteStr = encodeCharTo8bits(ch);
      if (!byteStr) {
        // 対応外文字はスキップ
        continue;
      }
      bits += byteStr;
    }

    return bits;
  }

  // 8bit列 → ひらがなテキスト
  function bitsToHiragana(bitString) {
    const out = [];

    for (let i = 0; i + 8 <= bitString.length; i += 8) {
      const chunk = bitString.slice(i, i + 8);
      out.push(decode8bitsToChar(chunk));
    }

    return out.join("");
  }

  // デバッグ用に一部公開
  global.KanaCodec = {
    HIRA_TABLE,
    charToCode,
    textToBits,
    bitsToHiragana,

    _encodeCharTo8bits: encodeCharTo8bits,
    _decode8bitsToChar: decode8bitsToChar
  };
})(window);
