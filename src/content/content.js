(function () {
  "use strict";

  if (window.__DiggAIInstalled) {
    return;
  }
  window.__DiggAIInstalled = true;

  var PANEL_VERSION = "0.6.0";
  var STORAGE_KEY = "diggAI.state.v0.6.0";
  var DEFAULT_STATE = {
    originalQuestion: "",
    latestAnswer: "",
    answerIndex: 0,
    nextPrompt: "",
    customSuffix: "",
    maxRounds: 5,
    stopOnConverged: true,
    stableMs: 2800,
    timeoutMs: 180000,
    status: "idle",
    logLines: []
  };
  var storageApi = typeof browser !== "undefined" && browser.storage && browser.storage.local
    ? browser.storage.local
    : null;
  var promptBuilder = window.DiggAIPromptBuilder;
  var root = null;
  var adapter = null;
  var ui = {};
  var state = cloneState(DEFAULT_STATE);
  var abortRequested = false;
  var isRunning = false;
  var stopWords = [
    "stop",
    "stop generating",
    "stop streaming",
    "停止生成",
    "停止回答",
    "停止响应"
  ];

  if (!promptBuilder) {
    console.error("[DiggAI] promptBuilder.js 未按顺序加载。");
    return;
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  }

  function cloneState(source) {
    var input = source || {};
    return {
      originalQuestion: normalizeText(input.originalQuestion || ""),
      latestAnswer: normalizeText(input.latestAnswer || ""),
      answerIndex: toPositiveInt(input.answerIndex, 0),
      nextPrompt: normalizeText(input.nextPrompt || ""),
      customSuffix: normalizeText(input.customSuffix || ""),
      maxRounds: toPositiveInt(input.maxRounds, DEFAULT_STATE.maxRounds),
      stopOnConverged: input.stopOnConverged !== false,
      stableMs: toPositiveInt(input.stableMs, DEFAULT_STATE.stableMs),
      timeoutMs: toPositiveInt(input.timeoutMs, DEFAULT_STATE.timeoutMs),
      status: normalizeText(input.status || DEFAULT_STATE.status) || DEFAULT_STATE.status,
      logLines: Array.isArray(input.logLines) ? input.logLines.slice(-200) : []
    };
  }

  function toPositiveInt(value, fallback) {
    var parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  function simpleHash(text) {
    var input = String(text || "");
    var hash = 0;
    var index = 0;

    for (index = 0; index < input.length; index += 1) {
      hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }

    return String(hash);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function checkAbort() {
    if (abortRequested) {
      throw new Error("用户已停止。");
    }
  }

  function isVisible(node) {
    if (!node || !node.isConnected) {
      return false;
    }

    var rect = node.getBoundingClientRect();
    var style = window.getComputedStyle(node);

    return rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none";
  }

  function compareDomOrder(left, right) {
    if (left === right) {
      return 0;
    }

    var position = left.compareDocumentPosition(right);

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    return 0;
  }

  function getNodeText(node) {
    if (!node) {
      return "";
    }

    var preferred = node.querySelector
      ? node.querySelector(".markdown, [data-message-content], .whitespace-pre-wrap")
      : null;
    var target = preferred || node;

    return normalizeText(target.innerText || target.textContent || "");
  }

  function setStatus(nextStatus) {
    state.status = nextStatus;

    if (ui.status) {
      ui.status.textContent = "状态：" + nextStatus;
    }

    updateButtonStates();
    void persistState();
  }

  function appendLog(message, isError) {
    var timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    var line = "[" + timestamp + "] " + message;

    state.logLines.push(line);
    state.logLines = state.logLines.slice(-200);

    if (ui.logLines) {
      ui.logLines.value = state.logLines.join("\n");
      ui.logLines.scrollTop = ui.logLines.scrollHeight;
    }

    if (isError) {
      console.error("[DiggAI]", message);
    } else {
      console.log("[DiggAI]", message);
    }

    void persistState();
  }

  async function persistState() {
    if (!storageApi) {
      return;
    }

    try {
      await storageApi.set((function () {
        var payload = {};
        payload[STORAGE_KEY] = cloneState(state);
        return payload;
      })());
    } catch (error) {
      console.warn("[DiggAI] 持久化失败:", error);
    }
  }

  async function restoreState() {
    if (!storageApi) {
      return;
    }

    try {
      var result = await storageApi.get(STORAGE_KEY);
      if (result && result[STORAGE_KEY]) {
        state = cloneState(result[STORAGE_KEY]);
      }
    } catch (error) {
      console.warn("[DiggAI] 读取持久化状态失败:", error);
    }
  }

  function syncStateFromUi() {
    if (!ui.originalQuestion) {
      return;
    }

    state.originalQuestion = normalizeText(ui.originalQuestion.value);
    state.latestAnswer = normalizeText(ui.latestAnswer.value);
    state.customSuffix = normalizeText(ui.customSuffix.value);
    state.nextPrompt = normalizeText(ui.nextPrompt.value);
    state.maxRounds = Math.max(1, toPositiveInt(ui.maxRounds.value, DEFAULT_STATE.maxRounds) || DEFAULT_STATE.maxRounds);
    state.stableMs = Math.max(100, toPositiveInt(ui.stableMs.value, DEFAULT_STATE.stableMs) || DEFAULT_STATE.stableMs);
    state.timeoutMs = Math.max(1000, toPositiveInt(ui.timeoutMs.value, DEFAULT_STATE.timeoutMs) || DEFAULT_STATE.timeoutMs);
    state.stopOnConverged = Boolean(ui.stopOnConverged.checked);
  }

  function syncUiFromState() {
    if (!ui.originalQuestion) {
      return;
    }

    ui.originalQuestion.value = state.originalQuestion;
    ui.latestAnswer.value = state.latestAnswer;
    ui.customSuffix.value = state.customSuffix;
    ui.maxRounds.value = String(state.maxRounds);
    ui.stableMs.value = String(state.stableMs);
    ui.timeoutMs.value = String(state.timeoutMs);
    ui.stopOnConverged.checked = Boolean(state.stopOnConverged);
    ui.nextPrompt.value = state.nextPrompt;
    ui.logLines.value = state.logLines.join("\n");
    ui.status.textContent = "状态：" + state.status;
    updateButtonStates();
  }

  function updateButtonStates() {
    if (!ui.startFromA) {
      return;
    }

    ui.startFromA.disabled = isRunning;
    ui.stop.disabled = !isRunning;

    if (ui.captureAB) {
      ui.captureAB.disabled = isRunning;
    }
    if (ui.captureLatest) {
      ui.captureLatest.disabled = isRunning;
    }
    if (ui.generate) {
      ui.generate.disabled = isRunning;
    }
    if (ui.fill) {
      ui.fill.disabled = isRunning;
    }
  }

  function setFieldValue(element, value) {
    if (element) {
      element.value = value;
    }
  }

  function createLabeledBlock(labelText, control) {
    var wrapper = document.createElement("label");
    var title = document.createElement("span");

    wrapper.className = "diggai-field";
    title.className = "diggai-label";
    title.textContent = labelText;
    wrapper.appendChild(title);
    wrapper.appendChild(control);

    return wrapper;
  }

  function createPanel() {
    root = document.createElement("section");
    root.id = "diggai-panel-root";
    root.innerHTML = [
      '<div class="diggai-shell">',
      '  <div class="diggai-header">',
      '    <div class="diggai-title">DiggAI</div>',
      '    <div class="diggai-subtitle">ChatGPT 迭代收敛追问器 v' + PANEL_VERSION + '</div>',
      '    <div class="diggai-status" data-role="status">状态：idle</div>',
      "  </div>",
      '  <div class="diggai-actions">',
      '    <button type="button" data-action="start-from-a">开始迭代</button>',
      '    <button type="button" data-action="stop">停止</button>',
      "  </div>",
      '  <div class="diggai-body"></div>',
      "</div>"
    ].join("");

    (document.body || document.documentElement).appendChild(root);

    var body = root.querySelector(".diggai-body");
    var originalQuestion = document.createElement("textarea");
    var customSuffix = document.createElement("textarea");
    var maxRounds = document.createElement("input");
    var stableMs = document.createElement("input");
    var timeoutMs = document.createElement("input");
    var stopOnConverged = document.createElement("input");
    var latestAnswer = document.createElement("textarea");
    var nextPrompt = document.createElement("textarea");
    var logLines = document.createElement("textarea");
    var debugDetails = document.createElement("details");
    var debugSummary = document.createElement("summary");
    var debugBody = document.createElement("div");
    var debugActions = document.createElement("div");

    originalQuestion.rows = 4;
    customSuffix.rows = 3;
    latestAnswer.rows = 6;
    nextPrompt.rows = 8;
    logLines.rows = 8;

    maxRounds.type = "number";
    maxRounds.min = "1";
    stableMs.type = "number";
    stableMs.min = "100";
    timeoutMs.type = "number";
    timeoutMs.min = "1000";
    stopOnConverged.type = "checkbox";

    logLines.readOnly = true;

    body.appendChild(createLabeledBlock("原始提示词 A", originalQuestion));
    body.appendChild(createLabeledBlock("自定义追加字符串", customSuffix));
    body.appendChild(createLabeledBlock("最大迭代轮数", maxRounds));
    body.appendChild(createLabeledBlock("稳定等待 ms", stableMs));
    body.appendChild(createLabeledBlock("单轮超时 ms", timeoutMs));

    var checkboxWrapper = document.createElement("label");
    var checkboxTitle = document.createElement("span");
    checkboxWrapper.className = "diggai-field diggai-checkbox";
    checkboxTitle.className = "diggai-label";
    checkboxTitle.textContent = "检测到独立行“局部收敛：是”后停止";
    checkboxWrapper.appendChild(checkboxTitle);
    checkboxWrapper.appendChild(stopOnConverged);
    body.appendChild(checkboxWrapper);

    body.appendChild(createLabeledBlock("运行日志", logLines));

    debugDetails.className = "diggai-debug";
    debugSummary.className = "diggai-debug-summary";
    debugSummary.textContent = "高级调试区";
    debugBody.className = "diggai-debug-body";
    debugActions.className = "diggai-debug-actions";

    debugActions.innerHTML = [
      '<button type="button" data-action="capture-ab">捕获 A+B</button>',
      '<button type="button" data-action="capture-latest">仅捕获最新回答</button>',
      '<button type="button" data-action="generate">生成下一轮 Prompt</button>',
      '<button type="button" data-action="fill">填入输入框</button>'
    ].join("");

    debugBody.appendChild(createLabeledBlock("最新回答", latestAnswer));
    debugBody.appendChild(createLabeledBlock("下一轮 Prompt 预览", nextPrompt));
    debugBody.appendChild(debugActions);
    debugDetails.appendChild(debugSummary);
    debugDetails.appendChild(debugBody);
    body.appendChild(debugDetails);

    ui = {
      status: root.querySelector('[data-role="status"]'),
      startFromA: root.querySelector('[data-action="start-from-a"]'),
      stop: root.querySelector('[data-action="stop"]'),
      captureAB: debugActions.querySelector('[data-action="capture-ab"]'),
      captureLatest: debugActions.querySelector('[data-action="capture-latest"]'),
      generate: debugActions.querySelector('[data-action="generate"]'),
      fill: debugActions.querySelector('[data-action="fill"]'),
      originalQuestion: originalQuestion,
      latestAnswer: latestAnswer,
      customSuffix: customSuffix,
      maxRounds: maxRounds,
      stableMs: stableMs,
      timeoutMs: timeoutMs,
      stopOnConverged: stopOnConverged,
      nextPrompt: nextPrompt,
      logLines: logLines
    };
  }

  function bindUiEvents() {
    [
      ui.originalQuestion,
      ui.latestAnswer,
      ui.customSuffix,
      ui.maxRounds,
      ui.stableMs,
      ui.timeoutMs,
      ui.stopOnConverged,
      ui.nextPrompt
    ].forEach(function (element) {
      element.addEventListener("input", function () {
        syncStateFromUi();
        void persistState();
      });
      element.addEventListener("change", function () {
        syncStateFromUi();
        void persistState();
      });
    });

    ui.startFromA.addEventListener("click", function () {
      void guardedAction(startFromOriginalQuestion);
    });
    ui.stop.addEventListener("click", function () {
      abortRequested = true;
      appendLog("已请求停止。");

      if (!isRunning) {
        setStatus("stopped");
      }
    });
    ui.captureAB.addEventListener("click", function () {
      void guardedAction(captureAB);
    });
    ui.captureLatest.addEventListener("click", function () {
      void guardedAction(captureLatestAnswerOnly);
    });
    ui.generate.addEventListener("click", function () {
      void guardedAction(generateNextPrompt);
    });
    ui.fill.addEventListener("click", function () {
      void guardedAction(fillComposerFromPreview);
    });
  }

  function guardedAction(handler) {
    return handler().catch(function (error) {
      handleError(error);
    });
  }

  function handleError(error) {
    var message = error && error.message ? error.message : String(error);

    if (message === "用户已停止。") {
      setStatus("stopped");
      appendLog("用户已停止。");
      return;
    }

    setStatus("error");
    appendLog("错误：" + message, true);
  }

  function buildPromptFromState() {
    syncStateFromUi();
    state.nextPrompt = promptBuilder.buildNextPrompt({
      originalQuestion: state.originalQuestion,
      latestAnswer: state.latestAnswer,
      answerIndex: state.answerIndex || 1,
      customSuffix: state.customSuffix
    });
    setFieldValue(ui.nextPrompt, state.nextPrompt);
    setStatus("building_followup");
    appendLog("已生成下一轮 Prompt。");
    void persistState();
    return state.nextPrompt;
  }

  async function captureAB() {
    var userText = adapter.getLatestUserText();
    var assistantText = adapter.getLatestAssistantText();

    if (!userText) {
      throw new Error("未找到 ChatGPT 的最新用户消息。");
    }

    if (!assistantText) {
      throw new Error("未找到 ChatGPT 的最新回答。");
    }

    state.originalQuestion = userText;
    state.latestAnswer = assistantText;
    state.answerIndex = 1;
    state.nextPrompt = "";
    setStatus("captured_b");
    syncUiFromState();
    appendLog("已捕获 A+B。");
    await persistState();
  }

  async function captureLatestAnswerOnly() {
    var assistantText = adapter.getLatestAssistantText();

    if (!assistantText) {
      throw new Error("未找到 ChatGPT 的最新回答。");
    }

    if (state.latestAnswer && state.latestAnswer !== assistantText && state.answerIndex > 0) {
      state.answerIndex += 1;
    } else if (!state.answerIndex) {
      state.answerIndex = 1;
    }

    state.latestAnswer = assistantText;
    state.nextPrompt = "";
    setStatus("captured_next_answer");
    syncUiFromState();
    appendLog("已捕获最新回答。");
    await persistState();
  }

  async function generateNextPrompt() {
    buildPromptFromState();
    syncUiFromState();
    await persistState();
  }

  async function fillComposerFromPreview() {
    syncStateFromUi();

    if (!state.nextPrompt) {
      buildPromptFromState();
    }

    adapter.fillComposer(state.nextPrompt);
    setStatus("filling");
    appendLog("已填入输入框。");
    await persistState();
  }

  async function sendRawPromptAndCapture(promptText) {
    checkAbort();

    var prompt = normalizeText(promptText);
    var beforeSnapshot = null;
    var answer = "";
    var isFirstRound = state.answerIndex === 0;

    if (!prompt) {
      throw new Error("待发送 Prompt 为空。");
    }

    beforeSnapshot = adapter.getAssistantSnapshot();

    setStatus("filling");
    adapter.fillComposer(prompt);
    appendLog("已填入 ChatGPT 输入框。");

    await sleep(150);
    checkAbort();

    setStatus(isFirstRound ? "sending_original_a" : "sending_followup");
    await adapter.clickSend();
    appendLog("已点击发送，等待新回答出现。");

    setStatus(isFirstRound ? "waiting_first_answer" : "waiting_followup_answer");
    await adapter.waitForNewAssistant(beforeSnapshot, state.timeoutMs);

    checkAbort();

    setStatus("waiting_stable");
    answer = await adapter.waitForStableAssistantAnswer({
      stableMs: state.stableMs,
      timeoutMs: state.timeoutMs
    });

    if (!answer) {
      throw new Error("新回答为空。");
    }

    return answer;
  }

  async function startFromOriginalQuestion() {
    var maxRounds = 0;
    var round = 0;
    var converged = false;
    var firstAnswer = "";

    if (isRunning) {
      throw new Error("已有 DiggAI 任务正在运行。");
    }

    syncStateFromUi();

    if (!state.originalQuestion) {
      throw new Error("请先输入原始提示词 A。");
    }

    abortRequested = false;
    isRunning = true;
    updateButtonStates();

    try {
      state.latestAnswer = "";
      state.answerIndex = 0;
      state.nextPrompt = "";
      setStatus("ready_from_a");
      syncUiFromState();
      await persistState();

      appendLog("开始从原始提示词 A 进行自动迭代。");

      maxRounds = Math.max(1, state.maxRounds);

      setStatus("sending_original_a");
      appendLog("第 1 轮：发送原始提示词 A。");

      firstAnswer = await sendRawPromptAndCapture(state.originalQuestion);

      state.latestAnswer = firstAnswer;
      state.answerIndex = 1;
      state.nextPrompt = "";
      setStatus("captured_b");
      syncUiFromState();
      appendLog("已捕获第一轮回答 B。");
      await persistState();

      if (state.stopOnConverged && promptBuilder.detectConverged(firstAnswer)) {
        setStatus("converged");
        appendLog("第一轮回答中检测到 局部收敛：是，自动停止。");
        return;
      }

      for (round = 2; round <= maxRounds; round += 1) {
        checkAbort();

        setStatus("building_followup");
        appendLog("第 " + round + " 轮：基于原始问题 A 和最新回答生成收敛追问。");

        state.nextPrompt = promptBuilder.buildNextPrompt({
          originalQuestion: state.originalQuestion,
          latestAnswer: state.latestAnswer,
          answerIndex: state.answerIndex,
          customSuffix: state.customSuffix
        });

        syncUiFromState();
        await persistState();

        state.latestAnswer = await sendRawPromptAndCapture(state.nextPrompt);
        state.answerIndex += 1;
        state.nextPrompt = "";
        setStatus("captured_next_answer");
        syncUiFromState();
        appendLog("已捕获第 " + round + " 轮回答。");
        await persistState();

        if (state.stopOnConverged && promptBuilder.detectConverged(state.latestAnswer)) {
          converged = true;
          setStatus("converged");
          appendLog("检测到独立行“局部收敛：是”，自动停止。");
          break;
        }
      }

      if (!converged) {
        setStatus("loop_done");
        appendLog("已达到最大迭代轮数。");
      }
    } finally {
      isRunning = false;
      updateButtonStates();
    }
  }

  function ChatGPTDomAdapter(panelRoot) {
    this.panelRoot = panelRoot;
  }

  ChatGPTDomAdapter.prototype.queryAll = function (selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function (node) {
      return !(root && root.contains(node));
    });
  };

  ChatGPTDomAdapter.prototype.getMessages = function (role) {
    var primary = this.queryAll('[data-message-author-role="' + role + '"]');
    var fallbackSelectors = role === "assistant"
      ? [
        'main article [data-testid="assistant-turn"]',
        'main [data-testid*="assistant-message"]'
      ]
      : [
        'main article [data-testid="user-turn"]',
        'main [data-testid*="user-message"]'
      ];
    var index = 0;

    if (primary.length) {
      return primary.sort(compareDomOrder);
    }

    for (index = 0; index < fallbackSelectors.length; index += 1) {
      var nodes = this.queryAll(fallbackSelectors[index]).filter(isVisible);
      if (nodes.length) {
        return nodes.sort(compareDomOrder);
      }
    }

    return [];
  };

  ChatGPTDomAdapter.prototype.getLatestMessage = function (role) {
    var messages = this.getMessages(role);
    return messages.length ? messages[messages.length - 1] : null;
  };

  ChatGPTDomAdapter.prototype.getLatestUserText = function () {
    return getNodeText(this.getLatestMessage("user"));
  };

  ChatGPTDomAdapter.prototype.getLatestAssistantText = function () {
    return getNodeText(this.getLatestMessage("assistant"));
  };

  ChatGPTDomAdapter.prototype.getAssistantSnapshot = function () {
    var messages = this.getMessages("assistant");
    var latestText = messages.length ? getNodeText(messages[messages.length - 1]) : "";

    return {
      count: messages.length,
      latestText: latestText,
      latestHash: simpleHash(latestText)
    };
  };

  ChatGPTDomAdapter.prototype.isAssistantStillGenerating = function () {
    var buttons = this.queryAll("button");

    return buttons.some(function (button) {
      if (!isVisible(button)) {
        return false;
      }

      var testId = normalizeText(button.getAttribute("data-testid") || "").toLowerCase();
      var label = normalizeText([
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.innerText
      ].join(" ")).toLowerCase();

      if (testId === "stop-button") {
        return true;
      }

      return stopWords.some(function (word) {
        return label.indexOf(word) >= 0;
      });
    });
  };

  ChatGPTDomAdapter.prototype.findComposer = function () {
    var selectors = [
      "#prompt-textarea",
      '[data-testid="composer-text-input"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="询问"]',
      'div[contenteditable="true"]'
    ];
    var outerIndex = 0;

    for (outerIndex = 0; outerIndex < selectors.length; outerIndex += 1) {
      var nodes = this.queryAll(selectors[outerIndex]).filter(isVisible);
      if (nodes.length) {
        return nodes[nodes.length - 1];
      }
    }

    return null;
  };

  ChatGPTDomAdapter.prototype.fillComposer = function (text) {
    var composer = this.findComposer();
    var value = String(text || "");

    if (!composer) {
      throw new Error("未找到 ChatGPT 输入框。");
    }

    composer.focus();

    if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
      var prototype = composer.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

      if (descriptor && descriptor.set) {
        descriptor.set.call(composer, value);
      } else {
        composer.value = value;
      }

      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      return composer;
    }

    if (composer.isContentEditable) {
      var inserted = false;

      try {
        var range = document.createRange();
        var selection = window.getSelection();

        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
        inserted = document.execCommand("insertText", false, value);
      } catch (error) {
        inserted = false;
      }

      if (!inserted) {
        composer.textContent = value;
      }

      try {
        composer.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: value,
          inputType: "insertText"
        }));
      } catch (inputError) {
        composer.dispatchEvent(new Event("input", { bubbles: true }));
      }

      composer.dispatchEvent(new Event("change", { bubbles: true }));
      return composer;
    }

    throw new Error("识别到了输入节点，但不支持的输入框类型。");
  };

  ChatGPTDomAdapter.prototype.findSendButton = function () {
    var selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="发送提示"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      'form button[type="submit"]'
    ];
    var outerIndex = 0;

    for (outerIndex = 0; outerIndex < selectors.length; outerIndex += 1) {
      var buttons = this.queryAll(selectors[outerIndex]).filter(function (button) {
        return isVisible(button) &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true";
      });

      if (buttons.length) {
        return buttons[buttons.length - 1];
      }
    }

    return null;
  };

  ChatGPTDomAdapter.prototype.clickSend = async function () {
    var startedAt = Date.now();
    var timeoutMs = 8000;
    var button = null;

    while (Date.now() - startedAt < timeoutMs) {
      checkAbort();

      button = this.findSendButton();
      if (button) {
        button.click();
        await sleep(300);
        return;
      }

      await sleep(200);
    }

    throw new Error("未找到可点击的发送按钮。请确认输入框已填入内容，且 ChatGPT 页面允许发送。");
  };

  ChatGPTDomAdapter.prototype.waitForNewAssistant = async function (beforeSnapshot, timeoutMs) {
    var startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      var currentSnapshot = this.getAssistantSnapshot();
      checkAbort();

      if (currentSnapshot.count > beforeSnapshot.count) {
        return currentSnapshot;
      }

      if (currentSnapshot.latestHash !== beforeSnapshot.latestHash && currentSnapshot.latestText) {
        return currentSnapshot;
      }

      await sleep(350);
    }

    throw new Error("等待新回答出现超时。");
  };

  ChatGPTDomAdapter.prototype.waitForStableAssistantAnswer = async function (options) {
    var settings = options || {};
    var timeoutMs = toPositiveInt(settings.timeoutMs, DEFAULT_STATE.timeoutMs);
    var stableMs = toPositiveInt(settings.stableMs, DEFAULT_STATE.stableMs);
    var startTime = Date.now();
    var lastHash = "";
    var stableSince = 0;

    while (Date.now() - startTime < timeoutMs) {
      checkAbort();

      var latestText = this.getLatestAssistantText();
      var latestHash = simpleHash(latestText);
      var generating = this.isAssistantStillGenerating();

      if (latestText) {
        if (latestHash !== lastHash) {
          lastHash = latestHash;
          stableSince = Date.now();
        } else if (!generating && stableSince && Date.now() - stableSince >= stableMs) {
          return latestText;
        }
      }

      await sleep(350);
    }

    throw new Error("等待回答稳定超时。");
  };

  async function init() {
    createPanel();
    adapter = new ChatGPTDomAdapter(root);
    bindUiEvents();
    await restoreState();
    syncUiFromState();
    appendLog("插件已加载。");
  }

  void init().catch(function (error) {
    handleError(error);
  });
})();
