(function initExportUtils(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./normalize"));
  } else {
    root.WordbookExport = factory(root.WordTranslateNormalize);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createExportUtils(normalize) {
  const CSV_HEADERS = ["生词本", "单词", "原形", "词形说明", "翻译", "音标", "来源标题", "来源链接", "添加时间"];

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function notebookNameMap(notebooks) {
    return new Map((notebooks || []).map((notebook) => [notebook.id, notebook.name]));
  }

  function buildCsv(notebooks, words) {
    const names = notebookNameMap(notebooks);
    const rows = [CSV_HEADERS];
    for (const word of words || []) {
      rows.push([
        names.get(word.notebookId) || "",
        word.text || "",
        word.baseWord || "",
        word.inflectionLabel || "",
        word.translation || "",
        word.phonetic || "",
        word.sourceTitle || "",
        word.sourceUrl || "",
        word.createdAt || ""
      ]);
    }
    return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function timestampName(prefix, ext) {
    const stamp = normalize.nowIso().replace(/[:.]/g, "-");
    return `${prefix}_${stamp}.${ext}`;
  }

  return {
    CSV_HEADERS,
    buildCsv,
    downloadBlob,
    timestampName
  };
});
