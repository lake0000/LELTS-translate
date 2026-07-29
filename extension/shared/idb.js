(function initWordbookDb(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./normalize"));
  } else {
    root.WordbookDB = factory(root.WordTranslateNormalize);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createWordbookDb(normalize) {
  const DB_NAME = "wordbook_db";
  const DB_VERSION = 2;
  const DEFAULT_NOTEBOOKS = [
    { id: "notebook_essay", name: "小作文词", order: 1 },
    { id: "notebook_reading", name: "阅读", order: 2 }
  ];
  const DEFAULT_SENTENCE_NOTEBOOKS = [
    { id: "sentence_default", name: "句子本", order: 1 }
  ];

  let dbPromise;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("notebooks")) {
          const notebooks = db.createObjectStore("notebooks", { keyPath: "id" });
          notebooks.createIndex("order", "order", { unique: false });
          notebooks.createIndex("name", "name", { unique: false });
        }
        if (!db.objectStoreNames.contains("words")) {
          const words = db.createObjectStore("words", { keyPath: "id" });
          words.createIndex("notebookId", "notebookId", { unique: false });
          words.createIndex("normalized", "normalized", { unique: false });
          words.createIndex("notebookNormalized", ["notebookId", "normalized"], { unique: true });
          words.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("translation_cache")) {
          const cache = db.createObjectStore("translation_cache", { keyPath: "id" });
          cache.createIndex("normalized", "normalized", { unique: false });
          cache.createIndex("expiresAt", "expiresAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("sentence_notebooks")) {
          const notebooks = db.createObjectStore("sentence_notebooks", { keyPath: "id" });
          notebooks.createIndex("order", "order", { unique: false });
          notebooks.createIndex("name", "name", { unique: false });
        }
        if (!db.objectStoreNames.contains("sentences")) {
          const sentences = db.createObjectStore("sentences", { keyPath: "id" });
          sentences.createIndex("notebookId", "notebookId", { unique: false });
          sentences.createIndex("normalized", "normalized", { unique: false });
          sentences.createIndex("notebookNormalized", ["notebookId", "normalized"], { unique: true });
          sentences.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("sentence_analysis_cache")) {
          const cache = db.createObjectStore("sentence_analysis_cache", { keyPath: "id" });
          cache.createIndex("normalized", "normalized", { unique: false });
          cache.createIndex("expiresAt", "expiresAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function initDefaultNotebooks() {
    const db = await openDb();
    const tx = db.transaction("notebooks", "readwrite");
    const store = tx.objectStore("notebooks");
    for (const item of DEFAULT_NOTEBOOKS) {
      const existing = await requestToPromise(store.get(item.id));
      if (!existing) {
        const now = normalize.nowIso();
        store.add({ ...item, createdAt: now, updatedAt: now });
      }
    }
    await txDone(tx);
  }

  async function listNotebooks() {
    await initDefaultNotebooks();
    const db = await openDb();
    const notebooks = await requestToPromise(db.transaction("notebooks").objectStore("notebooks").getAll());
    return notebooks.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  }

  async function initDefaultSentenceNotebooks() {
    const db = await openDb();
    const tx = db.transaction("sentence_notebooks", "readwrite");
    const store = tx.objectStore("sentence_notebooks");
    for (const item of DEFAULT_SENTENCE_NOTEBOOKS) {
      const existing = await requestToPromise(store.get(item.id));
      if (!existing) {
        const now = normalize.nowIso();
        store.add({ ...item, createdAt: now, updatedAt: now });
      }
    }
    await txDone(tx);
  }

  async function listSentenceNotebooks() {
    await initDefaultSentenceNotebooks();
    const db = await openDb();
    const notebooks = await requestToPromise(db.transaction("sentence_notebooks").objectStore("sentence_notebooks").getAll());
    return notebooks.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  }

  async function createNotebook(name) {
    const cleaned = normalize.normalizeWhitespace(name);
    if (!cleaned) throw new Error("生词本名称不能为空");
    const notebooks = await listNotebooks();
    const now = normalize.nowIso();
    const item = {
      id: normalize.createId("notebook"),
      name: cleaned,
      order: notebooks.length + 1,
      createdAt: now,
      updatedAt: now
    };
    const db = await openDb();
    const tx = db.transaction("notebooks", "readwrite");
    tx.objectStore("notebooks").add(item);
    await txDone(tx);
    return item;
  }

  async function cacheKey(text, from = "auto", to = "zh-CHS") {
    return `${normalize.normalizeWord(text)}::${from}::${to}`;
  }

  async function getCachedTranslation(text, from = "auto", to = "zh-CHS") {
    const id = await cacheKey(text, from, to);
    const db = await openDb();
    const item = await requestToPromise(db.transaction("translation_cache").objectStore("translation_cache").get(id));
    if (!item) return null;
    if (item.expiresAt && Date.parse(item.expiresAt) < Date.now()) return null;
    return item.result;
  }

  async function setCachedTranslation(text, result, from = "auto", to = "zh-CHS") {
    const now = normalize.nowIso();
    const db = await openDb();
    const item = {
      id: await cacheKey(text, from, to),
      normalized: normalize.normalizeWord(text),
      from,
      to,
      result,
      createdAt: now,
      updatedAt: now,
      expiresAt: ""
    };
    const tx = db.transaction("translation_cache", "readwrite");
    tx.objectStore("translation_cache").put(item);
    await txDone(tx);
    return item;
  }

  async function sentenceCacheKey(text, mode = "zh-analysis") {
    return `${normalize.normalizeWord(text)}::${mode}`;
  }

  async function getCachedSentenceAnalysis(text, mode = "zh-analysis") {
    const id = await sentenceCacheKey(text, mode);
    const db = await openDb();
    const item = await requestToPromise(db.transaction("sentence_analysis_cache").objectStore("sentence_analysis_cache").get(id));
    if (!item) return null;
    if (item.expiresAt && Date.parse(item.expiresAt) < Date.now()) return null;
    return item.result;
  }

  async function setCachedSentenceAnalysis(text, result, mode = "zh-analysis") {
    const now = normalize.nowIso();
    const db = await openDb();
    const item = {
      id: await sentenceCacheKey(text, mode),
      normalized: normalize.normalizeWord(text),
      mode,
      result,
      createdAt: now,
      updatedAt: now,
      expiresAt: ""
    };
    const tx = db.transaction("sentence_analysis_cache", "readwrite");
    tx.objectStore("sentence_analysis_cache").put(item);
    await txDone(tx);
    return item;
  }

  async function addOrUpdateWord(input) {
    await initDefaultNotebooks();
    const now = normalize.nowIso();
    const normalized = normalize.normalizeWord(input.text || input.word);
    if (!normalized) throw new Error("单词不能为空");
    const notebookId = input.notebookId || DEFAULT_NOTEBOOKS[0].id;
    const db = await openDb();
    const tx = db.transaction("words", "readwrite");
    const store = tx.objectStore("words");
    const index = store.index("notebookNormalized");
    const existing = await requestToPromise(index.get([notebookId, normalized]));
    let saved;
    if (existing) {
      saved = {
        ...existing,
        text: input.text || input.word || existing.text,
        translation: input.translation || existing.translation,
        phonetic: input.phonetic ?? existing.phonetic ?? "",
        baseWord: input.baseWord || existing.baseWord || "",
        baseTranslation: input.baseTranslation || existing.baseTranslation || "",
        inflectionLabel: input.inflectionLabel || existing.inflectionLabel || "",
        inflectionNote: input.inflectionNote || existing.inflectionNote || "",
        explainsJson: input.explainsJson || existing.explainsJson || "",
        sourceUrl: input.sourceUrl || existing.sourceUrl || "",
        sourceTitle: input.sourceTitle || existing.sourceTitle || "",
        context: input.context || existing.context || "",
        updatedAt: now
      };
      store.put(saved);
      await txDone(tx);
      return { item: saved, duplicate: true };
    }
    saved = {
      id: normalize.createId("word"),
      text: input.text || input.word,
      normalized,
      translation: input.translation || "",
      phonetic: input.phonetic || "",
      baseWord: input.baseWord || "",
      baseTranslation: input.baseTranslation || "",
      inflectionLabel: input.inflectionLabel || "",
      inflectionNote: input.inflectionNote || "",
      explainsJson: input.explainsJson || "",
      notebookId,
      sourceUrl: input.sourceUrl || "",
      sourceTitle: input.sourceTitle || "",
      context: input.context || "",
      createdAt: now,
      updatedAt: now,
      reviewCount: 0,
      lastReviewedAt: ""
    };
    store.add(saved);
    await txDone(tx);
    return { item: saved, duplicate: false };
  }

  async function listWords(options = {}) {
    await initDefaultNotebooks();
    const db = await openDb();
    const tx = db.transaction("words");
    const store = tx.objectStore("words");
    let words;
    if (options.notebookId && options.notebookId !== "all") {
      words = await requestToPromise(store.index("notebookId").getAll(options.notebookId));
    } else {
      words = await requestToPromise(store.getAll());
    }
    const query = normalize.normalizeWord(options.query || "");
    if (query) {
      words = words.filter((word) =>
        [word.text, word.normalized, word.translation, word.phonetic, word.sourceTitle, word.sourceUrl]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)
      );
    }
    return words.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function addOrUpdateSentence(input) {
    await initDefaultSentenceNotebooks();
    const now = normalize.nowIso();
    const normalized = normalize.normalizeWord(input.text || input.sentence);
    if (!normalized) throw new Error("句子不能为空");
    const notebookId = input.notebookId || DEFAULT_SENTENCE_NOTEBOOKS[0].id;
    const analysis = input.analysis || {};
    const db = await openDb();
    const tx = db.transaction("sentences", "readwrite");
    const store = tx.objectStore("sentences");
    const index = store.index("notebookNormalized");
    const existing = await requestToPromise(index.get([notebookId, normalized]));
    const saved = {
      ...(existing || {}),
      id: existing ? existing.id : normalize.createId("sentence"),
      text: input.text || input.sentence || existing.text,
      normalized,
      translation: input.translation || analysis.translation || existing?.translation || "",
      analysisJson: input.analysisJson || JSON.stringify(analysis || {}),
      notebookId,
      sourceUrl: input.sourceUrl || existing?.sourceUrl || "",
      sourceTitle: input.sourceTitle || existing?.sourceTitle || "",
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    store.put(saved);
    await txDone(tx);
    return { item: saved, duplicate: Boolean(existing) };
  }

  async function listSentences(options = {}) {
    await initDefaultSentenceNotebooks();
    const db = await openDb();
    const tx = db.transaction("sentences");
    const store = tx.objectStore("sentences");
    let sentences;
    if (options.notebookId && options.notebookId !== "all") {
      sentences = await requestToPromise(store.index("notebookId").getAll(options.notebookId));
    } else {
      sentences = await requestToPromise(store.getAll());
    }
    const query = normalize.normalizeWord(options.query || "");
    if (query) {
      sentences = sentences.filter((sentence) =>
        [sentence.text, sentence.normalized, sentence.translation, sentence.sourceTitle, sentence.sourceUrl]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)
      );
    }
    return sentences.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function deleteSentence(id) {
    const db = await openDb();
    const tx = db.transaction("sentences", "readwrite");
    tx.objectStore("sentences").delete(id);
    await txDone(tx);
    return true;
  }

  async function updateWord(id, patch) {
    const db = await openDb();
    const tx = db.transaction("words", "readwrite");
    const store = tx.objectStore("words");
    const existing = await requestToPromise(store.get(id));
    if (!existing) throw new Error("单词不存在");
    const updated = { ...existing, ...patch, updatedAt: normalize.nowIso() };
    if (patch.text) updated.normalized = normalize.normalizeWord(patch.text);
    const targetNotebookId = updated.notebookId || existing.notebookId;
    const targetNormalized = updated.normalized || existing.normalized;
    const duplicate = await requestToPromise(store.index("notebookNormalized").get([targetNotebookId, targetNormalized]));
    if (duplicate && duplicate.id !== id) {
      const merged = {
        ...duplicate,
        translation: updated.translation || duplicate.translation,
        phonetic: updated.phonetic || duplicate.phonetic || "",
        baseWord: updated.baseWord || duplicate.baseWord || "",
        baseTranslation: updated.baseTranslation || duplicate.baseTranslation || "",
        inflectionLabel: updated.inflectionLabel || duplicate.inflectionLabel || "",
        inflectionNote: updated.inflectionNote || duplicate.inflectionNote || "",
        sourceUrl: updated.sourceUrl || duplicate.sourceUrl || "",
        sourceTitle: updated.sourceTitle || duplicate.sourceTitle || "",
        context: updated.context || duplicate.context || "",
        updatedAt: normalize.nowIso()
      };
      store.put(merged);
      store.delete(id);
      await txDone(tx);
      return merged;
    }
    store.put(updated);
    await txDone(tx);
    return updated;
  }

  async function deleteWord(id) {
    const db = await openDb();
    const tx = db.transaction("words", "readwrite");
    tx.objectStore("words").delete(id);
    await txDone(tx);
    return true;
  }

  async function exportSnapshot(notebookId = "all", query = "") {
    const notebooks = await listNotebooks();
    const words = await listWords({ notebookId, query });
    return { notebooks, words };
  }

  return {
    DB_NAME,
    DB_VERSION,
    DEFAULT_NOTEBOOKS,
    DEFAULT_SENTENCE_NOTEBOOKS,
    openDb,
    initDefaultNotebooks,
    listNotebooks,
    initDefaultSentenceNotebooks,
    listSentenceNotebooks,
    createNotebook,
    getCachedTranslation,
    setCachedTranslation,
    getCachedSentenceAnalysis,
    setCachedSentenceAnalysis,
    addOrUpdateWord,
    listWords,
    addOrUpdateSentence,
    listSentences,
    deleteSentence,
    updateWord,
    deleteWord,
    exportSnapshot
  };
});
