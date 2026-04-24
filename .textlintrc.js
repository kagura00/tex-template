// LaTeX 原稿向けの textlint 設定。
module.exports = {
  plugins: ["latex2e"],
  filters: {},
  rules: {
    "preset-ja-spacing": true,
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
