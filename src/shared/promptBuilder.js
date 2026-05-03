(function () {
  "use strict";

  var VERSION = "0.5.2";
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
      "请判断上一轮回答 " + latestLabel + " 是否已经局部收敛，并继续把这个代码问题问到尽头。",
      "这里的“局部收敛”指：在当前问题范围内，继续追问已经很难得到实质性新增价值；主要漏洞、边界条件、反例、工程风险、替代方案和实现细节已经被覆盖。",
      "",
      "请按以下规则回答：",
      "1. 如果还没有局部收敛，请指出未收敛的具体原因，并继续改进分析或实现方案。",
      "2. 如果存在反例、遗漏场景、隐藏依赖、浏览器兼容问题、状态机问题、DOM 选择器风险、异步竞态或用户体验问题，请继续展开。",
      "3. 如果你认为已经局部收敛，请说明为什么继续追问的边际收益已经很低。",
      "4. 不要只给结论；先给出判断依据，再给出必要的修正或最终方案。",
      "5. 最后一行必须严格二选一，且单独成行：",
      "局部收敛：是",
      "局部收敛：否",
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
