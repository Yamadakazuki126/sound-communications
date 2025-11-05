// hamming-codec.js
// 4bit → Hamming(7,4) / Hamming(7,4) → 4bit をまとめて扱うユーティリティ
(function (global) {
  // ---- 4bit -> 7bit ----
  // ビット配置: [p1, p2, d1, p3, d2, d3, d4]
  // parity:
  //  p1 = d1 ^ d2 ^ d4  (positions 3,5,7)
  //  p2 = d1 ^ d3 ^ d4  (3,6,7)
  //  p3 = d2 ^ d3 ^ d4  (5,6,7)
  function encodeNibble4To7(n) {
    const d1 = (n >> 3) & 1;
    const d2 = (n >> 2) & 1;
    const d3 = (n >> 1) & 1;
    const d4 = n & 1;

    const p1 = d1 ^ d2 ^ d4;
    const p2 = d1 ^ d3 ^ d4;
    const p3 = d2 ^ d3 ^ d4;

    const b1 = p1;
    const b2 = p2;
    const b3 = d1;
    const b4 = p3;
    const b5 = d2;
    const b6 = d3;
    const b7 = d4;

    return "" + b1 + b2 + b3 + b4 + b5 + b6 + b7;
  }

  // ---- 7bit -> 4bit（1bitエラー訂正つき） ----
  function decode7ToNibble(bits7) {
    if (bits7.length !== 7) return null;
    let b1 = bits7.charCodeAt(0) & 1;
    let b2 = bits7.charCodeAt(1) & 1;
    let b3 = bits7.charCodeAt(2) & 1;
    let b4 = bits7.charCodeAt(3) & 1;
    let b5 = bits7.charCodeAt(4) & 1;
    let b6 = bits7.charCodeAt(5) & 1;
    let b7 = bits7.charCodeAt(6) & 1;

    // syndrome
    const s1 = b1 ^ b3 ^ b5 ^ b7;
    const s2 = b2 ^ b3 ^ b6 ^ b7;
    const s3 = b4 ^ b5 ^ b6 ^ b7;

    const errPos = s1 | (s2 << 1) | (s3 << 2); // 0〜7

    if (errPos >= 1 && errPos <= 7) {
      // 対応するビットを反転
      switch (errPos) {
        case 1:
          b1 ^= 1;
          break;
        case 2:
          b2 ^= 1;
          break;
        case 3:
          b3 ^= 1;
          break;
        case 4:
          b4 ^= 1;
          break;
        case 5:
          b5 ^= 1;
          break;
        case 6:
          b6 ^= 1;
          break;
        case 7:
          b7 ^= 1;
          break;
      }
    }
    // （2bit以上のエラーは検出できないけど、今回はそこまで気にしない）

    const d1 = b3;
    const d2 = b5;
    const d3 = b6;
    const d4 = b7;

    const nibble = (d1 << 3) | (d2 << 2) | (d3 << 1) | d4;
    return nibble;
  }

  // ---- 8bit列 → Hamming付き（14bit列） ----
  function encode(bitString) {
    // 8bit単位で処理：8bit = nibbles(4+4) → 7bit+7bit = 14bit
    const out = [];
    for (let i = 0; i + 8 <= bitString.length; i += 8) {
      const byteBits = bitString.slice(i, i + 8);
      const hiNib = parseInt(byteBits.slice(0, 4), 2);
      const loNib = parseInt(byteBits.slice(4, 8), 2);
      if (Number.isNaN(hiNib) || Number.isNaN(loNib)) continue;
      out.push(encodeNibble4To7(hiNib));
      out.push(encodeNibble4To7(loNib));
    }
    return out.join("");
  }

  // ---- Hamming付き14bit列 → 元の8bit列 ----
  function decode(bitString) {
    const out = [];
    for (let i = 0; i + 14 <= bitString.length; i += 14) {
      const hi7 = bitString.slice(i, i + 7);
      const lo7 = bitString.slice(i + 7, i + 14);
      const hiNib = decode7ToNibble(hi7);
      const loNib = decode7ToNibble(lo7);
      if (hiNib == null || loNib == null) continue;
      const hiBits = hiNib.toString(2).padStart(4, "0");
      const loBits = loNib.toString(2).padStart(4, "0");
      out.push(hiBits + loBits);
    }
    return out.join("");
  }

  global.HammingCodec = {
    encode,
    decode
  };
})(window);
