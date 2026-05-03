(function () {
  "use strict";

  var VERSION = "0.5.1";
  var CONVERGED_PATTERN = /^\s*局部收敛\s*[:：]\s*是\s*$/m;

  function normalizeText(value) {
    return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  }

  function toAlphabetLabel(index) {
    var number = Math.floor(index);
    var label = "";

    while (number > 0) {
      var remainder = (number - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      number = Math.floor((number - 1) / 26);
    }

    return label || "A";
  }

  function labelForAnswerIndex(answerIndex) {
    var normalizedIndex = Number(answerIndex);

    if (!Number.isFinite(normalizedIndex) || normalizedIndex < 1) {
      return "B";
    }

    return toAlphabetLabel(normalizedIndex + 1);
  }

  function detectConverged(answerText) {
    return CONVERGED_PATTERN.test(normalizeText(answerText));
  }

  function buildNextPrompt(options) {
    var settings = options || {};
    var originalQuestion = normalizeText(settings.originalQuestion);
    var latestAnswer = normalizeText(settings.latestAnswer);
    var answerIndex = Number(settings.answerIndex);
    var customSuffix = normalizeText(settings.customSuffix);
    var latestLabel = labelForAnswerIndex(answerIndex || 1);

    if (!originalQuestion) {
      throw new Error("缺少原始问题 A。请先点击“捕获 A+B”，或手动填写原始问题 A。");
    }

    if (!latestAnswer) {
      throw new Error("缺少上一轮回答。请先捕获 ChatGPT 的最新回答。");
    }

    return [
      "【原始问题 A】",
      originalQuestion,
      "",
      "【上一轮回答 " + latestLabel + "】",
      latestAnswer,
      "",
      "【任务】",
      "请围绕原始问题 A，对上一轮回答 " + latestLabel + " 做进一步迭代收敛。",
      "先判断当前回答是否已经局部收敛，并在最终输出中单独保留一行：",
      "局部收敛：是",
      "或",
      "局部收敛：否",
      "如果尚未局部收敛，请继续补全、纠错、压缩歧义，并给出更稳定的下一版答案。",
      "",
      "【自定义追加要求】",
      customSuffix || "无"
    ].join("\n");
  }

  window.DiggAIPromptBuilder = {
    VERSION: VERSION,
    buildNextPrompt: buildNextPrompt,
    detectConverged: detectConverged,
    labelForAnswerIndex: labelForAnswerIndex
  };
})();
