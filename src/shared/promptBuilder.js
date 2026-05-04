(function () {
  "use strict";

  var VERSION = "0.6.2";
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
    var customSuffix = normalizeText(settings.customSuffix);
    var sections = [];

    if (!originalQuestion) {
      throw new Error("缺少原始问题 A。请先输入原始提示词 A。");
    }

    if (!latestAnswer) {
      throw new Error("缺少上一轮回答。请先完成上一轮。");
    }

    sections.push(originalQuestion);

    if (customSuffix) {
      sections.push(customSuffix);
      sections.push("----- 以上是问题，以下是其他AI的回答 -----");
    }

    sections.push(latestAnswer);

    if (customSuffix) {
      sections.push("");
      sections.push(customSuffix);
    }

    return sections.join("\n");
  }

  window.DiggAIPromptBuilder = {
    VERSION: VERSION,
    buildNextPrompt: buildNextPrompt,
    detectConverged: detectConverged,
    labelForAnswerIndex: labelForAnswerIndex
  };
})();
