// LaTeX 原稿向けの textlint 設定。
module.exports = {
  plugins: ["latex2e"],
  filters: {},
  rules: {
    "preset-ja-spacing": {
      // 3 系で既定有効になった規則。LaTeX の \verb などの前後に置く
      // source 上の空白は許容し、2 系までと同じ校正結果を保つ。
      "ja-space-around-code": false,
      "ja-space-around-link": false,
      "ja-space-around-emphasis": false,
      "ja-space-around-strong": false
    },
    "preset-ja-technical-writing": {
      // 論文で使いやすい「，」「．」に合わせる。
      "ja-no-mixed-period": {
        periodMark: "．",
        commaMark: "，"
      },
      "max-comma": {
        max: 4
      },
      "max-ten": {
        max: 4
      },
      // 専門用語で過剰に反応しやすいため既定では無効化する。
      "max-kanji-continuous-len": false,
      "no-mix-dearu-desumasu": false,
      "no-exclamation-question-mark": false,
      "ja-no-weak-phrase": false
    }
  }
};
