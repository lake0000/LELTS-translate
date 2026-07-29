(function initNormalize(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.WordTranslateNormalize = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createNormalize() {
  const MAX_SELECTION_LENGTH = 300;
  const MAX_SHORT_PHRASE_LENGTH = 120;
  const MAX_SENTENCE_LENGTH = 800;

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeWord(value) {
    return normalizeWhitespace(value)
      .normalize("NFKC")
      .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
      .toLocaleLowerCase();
  }

  function validateSelection(value) {
    const text = normalizeWhitespace(value);
    if (!text) {
      return { ok: false, code: "EMPTY", message: "未选择可翻译内容", text };
    }
    if (text.length > MAX_SELECTION_LENGTH) {
      return {
        ok: false,
        code: "TOO_LONG",
        message: "选区过长，请选择单词或短句",
        text
      };
    }
    if (!/[\p{L}\p{N}]/u.test(text)) {
      return { ok: false, code: "INVALID", message: "请选择单词或短句", text };
    }
    return {
      ok: true,
      text,
      normalized: normalizeWord(text),
      isShortPhrase: text.length <= MAX_SHORT_PHRASE_LENGTH
    };
  }

  function validateSentence(value) {
    const text = normalizeWhitespace(value);
    if (!text) {
      return { ok: false, code: "EMPTY", message: "未选择可分析句子", text };
    }
    if (text.length > MAX_SENTENCE_LENGTH) {
      return {
        ok: false,
        code: "TOO_LONG",
        message: "句子过长，请选择一个句子或较短段落",
        text
      };
    }
    if (!/[\p{L}\p{N}]/u.test(text)) {
      return { ok: false, code: "INVALID", message: "请选择含文字的句子", text };
    }
    return {
      ok: true,
      text,
      normalized: normalizeWord(text),
      isShortPhrase: text.length <= MAX_SHORT_PHRASE_LENGTH
    };
  }

  function truncateForYoudaoSign(value) {
    const chars = Array.from(String(value || ""));
    if (chars.length <= 20) return chars.join("");
    return `${chars.slice(0, 10).join("")}${chars.length}${chars.slice(-10).join("")}`;
  }

  function safeDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (_error) {
      return "";
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    const base =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return prefix ? `${prefix}_${base}` : base;
  }

  return {
    MAX_SELECTION_LENGTH,
    MAX_SHORT_PHRASE_LENGTH,
    MAX_SENTENCE_LENGTH,
    normalizeWhitespace,
    normalizeWord,
    validateSelection,
    validateSentence,
    truncateForYoudaoSign,
    safeDomain,
    nowIso,
    createId
  };
});
