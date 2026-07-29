(function initSelectionListener() {
  if (window.__instantWordbookSelectionListenerReady) return;
  window.__instantWordbookSelectionListenerReady = true;

  let shiftDown = false;
  let activeRequestId = 0;
  let lastPayload;

  function getSelectionRect(selection) {
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) return rect;
    const fallback = range.getClientRects()[0];
    return fallback || null;
  }

  function selectedTextFromInput(target) {
    if (!target || !["INPUT", "TEXTAREA"].includes(target.tagName)) return "";
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number" || start === end) return "";
    return target.value.slice(start, end);
  }

  function selectionPayload(event) {
    const target = event && event.target ? event.target : document.activeElement;
    const inputText = selectedTextFromInput(target);
    if (inputText) {
      const rect = target.getBoundingClientRect();
      return { text: inputText, rect };
    }
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    const rect = getSelectionRect(selection);
    return { text, rect };
  }

  async function translateSelection(event) {
    if (!shiftDown && !event.shiftKey) return;
    const payload = selectionPayload(event);
    const check = WordTranslateNormalize.validateSelection(payload.text);
    if (!check.ok) {
      if (check.code === "TOO_LONG" && payload.rect) {
        InstantWordbookBubble.showLongText(check.message, payload.rect);
      }
      return;
    }
    if (!payload.rect) return;
    const requestId = ++activeRequestId;
    lastPayload = { text: check.text, rect: payload.rect };
    InstantWordbookBubble.showLoading(check.text, payload.rect);
    const response = await chrome.runtime
      .sendMessage({
        type: "translate",
        payload: { text: check.text, from: "auto", to: "zh-CHS" }
      })
      .catch((error) => ({ ok: false, message: error.message }));
    if (requestId !== activeRequestId) return;
    if (!response || !response.ok) {
      InstantWordbookBubble.showError(
        (response && response.message) || "翻译失败，点击重试",
        payload.rect,
        () => translateSelection({ ...event, shiftKey: true, target: event.target })
      );
      return;
    }
    InstantWordbookBubble.showSuccess(response, payload.rect);
  }

  async function analyzeSentenceSelection(event) {
    const payload = selectionPayload(event);
    const check = WordTranslateNormalize.validateSentence(payload.text);
    if (!check.ok) {
      if (check.code === "TOO_LONG" && payload.rect) {
        InstantWordbookBubble.showLongText(check.message, payload.rect);
      }
      return false;
    }
    if (!payload.rect) return false;
    const requestId = ++activeRequestId;
    lastPayload = { text: check.text, rect: payload.rect };
    InstantWordbookBubble.showSentenceLoading(check.text, payload.rect);
    const response = await chrome.runtime
      .sendMessage({
        type: "analyzeSentence",
        payload: { text: check.text }
      })
      .catch((error) => ({ ok: false, message: error.message }));
    if (requestId !== activeRequestId) return true;
    if (!response || !response.ok) {
      InstantWordbookBubble.showError(
        (response && response.message) || "句子分析失败，点击重试",
        payload.rect,
        () => analyzeSentenceSelection({ ...event, target: event.target })
      );
      return true;
    }
    InstantWordbookBubble.showSentenceSuccess(response, payload.rect);
    return true;
  }

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && !event.altKey && !event.metaKey && String(event.key).toLowerCase() === "r") {
      const payload = selectionPayload(event);
      const check = WordTranslateNormalize.validateSentence(payload.text);
      if (check.ok || check.code === "TOO_LONG") {
        event.preventDefault();
        event.stopPropagation();
        analyzeSentenceSelection(event);
      }
      return;
    }
    if (event.key !== "Shift") return;
    shiftDown = true;
    if (event.repeat) return;
    translateSelection({ target: document.activeElement, shiftKey: true });
  }, true);

  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift") shiftDown = false;
  });

  document.addEventListener(
    "instant-wordbook-trigger",
    () => {
      translateSelection({ target: document.activeElement, shiftKey: true });
    },
    true
  );

  document.addEventListener(
    "instant-wordbook-analyze-trigger",
    () => {
      analyzeSentenceSelection({ target: document.activeElement });
    },
    true
  );

  window.addEventListener("scroll", () => {
    if (lastPayload && activeRequestId) {
      const selection = window.getSelection();
      const rect = getSelectionRect(selection);
      if (rect) lastPayload.rect = rect;
    }
  }, { passive: true });

  document.documentElement.dataset.instantWordbook = "ready";
})();
