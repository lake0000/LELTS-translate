const crypto = require("node:crypto");
const { truncateForYoudaoSign, normalizeWhitespace } = require("../shared/normalize");

const YOUDAO_URL = "https://openapi.youdao.com/api";
const YOUDAO_DICT_URL = "https://openapi.youdao.com/v2/dict";
const FREE_DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en";

const POS_LABELS = {
  noun: "n.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  pronoun: "pron.",
  preposition: "prep.",
  conjunction: "conj.",
  interjection: "int.",
  determiner: "det.",
  numeral: "num.",
  article: "art."
};

const IRREGULAR_INFLECTIONS = {
  burnt: { baseWord: "burn", label: "过去式/过去分词" },
  burned: { baseWord: "burn", label: "过去式/过去分词" },
  went: { baseWord: "go", label: "过去式" },
  gone: { baseWord: "go", label: "过去分词" },
  seen: { baseWord: "see", label: "过去分词" },
  saw: { baseWord: "see", label: "过去式" },
  written: { baseWord: "write", label: "过去分词" },
  wrote: { baseWord: "write", label: "过去式" },
  taken: { baseWord: "take", label: "过去分词" },
  took: { baseWord: "take", label: "过去式" },
  made: { baseWord: "make", label: "过去式/过去分词" },
  found: { baseWord: "find", label: "过去式/过去分词" },
  taught: { baseWord: "teach", label: "过去式/过去分词" },
  bought: { baseWord: "buy", label: "过去式/过去分词" },
  brought: { baseWord: "bring", label: "过去式/过去分词" },
  thought: { baseWord: "think", label: "过去式/过去分词" },
  better: { baseWord: "good", label: "比较级" },
  best: { baseWord: "good", label: "最高级" },
  worse: { baseWord: "bad", label: "比较级" },
  worst: { baseWord: "bad", label: "最高级" }
};

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function createSign({ appKey, query, salt, curtime, appSecret }) {
  const input = truncateForYoudaoSign(query);
  return sha256(`${appKey}${input}${salt}${curtime}${appSecret}`);
}

function isEnglishWordLike(text) {
  return /^[A-Za-z][A-Za-z' -]{0,48}$/.test(String(text || "").trim());
}

function dictionaryCandidates(text) {
  const cleaned = String(text || "").trim().toLocaleLowerCase();
  const compact = cleaned.replace(/^[^a-z]+|[^a-z]+$/g, "");
  const candidates = new Set([compact]);
  if (compact.endsWith("ies") && compact.length > 4) candidates.add(`${compact.slice(0, -3)}y`);
  if (compact.endsWith("es") && compact.length > 4) candidates.add(compact.slice(0, -2));
  if (compact.endsWith("s") && compact.length > 3) candidates.add(compact.slice(0, -1));
  return [...candidates].filter(Boolean);
}

function detectInflection(text) {
  const compact = String(text || "").trim().toLocaleLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!compact || compact.includes(" ")) return null;
  if (IRREGULAR_INFLECTIONS[compact]) {
    return {
      inflected: text,
      normalizedInflected: compact,
      ...IRREGULAR_INFLECTIONS[compact]
    };
  }
  if (compact.endsWith("ies") && compact.length > 4) {
    return { inflected: text, normalizedInflected: compact, baseWord: `${compact.slice(0, -3)}y`, label: "复数/第三人称单数" };
  }
  if (compact.endsWith("ing") && compact.length > 5) {
    const stem = compact.slice(0, -3);
    return { inflected: text, normalizedInflected: compact, baseWord: stem.endsWith(stem.slice(-1).repeat(2)) ? stem.slice(0, -1) : stem, label: "现在分词/动名词" };
  }
  if (compact.endsWith("ed") && compact.length > 4) {
    const stem = compact.slice(0, -2);
    return { inflected: text, normalizedInflected: compact, baseWord: stem.endsWith(stem.slice(-1).repeat(2)) ? stem.slice(0, -1) : stem, label: "过去式/过去分词" };
  }
  if (compact.endsWith("s") && compact.length > 3 && !compact.endsWith("ss")) {
    return { inflected: text, normalizedInflected: compact, baseWord: compact.slice(0, -1), label: "复数/第三人称单数" };
  }
  return null;
}

async function buildInflectionInfo(query, env = process.env) {
  const detected = detectInflection(query);
  if (!detected || !detected.baseWord || detected.baseWord === detected.normalizedInflected) return null;
  const data = await requestYoudaoText({ query: detected.baseWord, from: "auto", to: "zh-CHS", env }).catch(() => null);
  const baseTranslation = data && data.errorCode === "0" ? (data.translation || []).join("；") : "";
  return {
    inflected: String(query),
    baseWord: detected.baseWord,
    label: detected.label,
    baseTranslation,
    note: `${String(query)} 是 ${detected.baseWord} 的${detected.label}`
  };
}

async function requestYoudaoText({ query, from = "auto", to = "zh-CHS", env = process.env }) {
  const appKey = env.YOUDAO_APP_KEY;
  const appSecret = env.YOUDAO_APP_SECRET;
  const salt = crypto.randomUUID();
  const curtime = Math.floor(Date.now() / 1000).toString();
  const params = new URLSearchParams({
    q: query,
    from,
    to,
    appKey,
    salt,
    sign: createSign({ appKey, query, salt, curtime, appSecret }),
    signType: "v3",
    curtime
  });
  const response = await fetch(YOUDAO_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: params
  });
  return response.json().catch(() => null);
}

function mockTranslate(text) {
  const normalized = String(text || "").toLocaleLowerCase();
  const dictionary = {
    apple: { translation: "苹果；苹果树", phonetic: "ˈæpəl" },
    significant: { translation: "显著的；重要的", phonetic: "sɪɡˈnɪfɪkənt" },
    fluctuate: { translation: "波动；起伏", phonetic: "ˈflʌktʃueɪt" }
  };
  const item = dictionary[normalized] || { translation: `模拟翻译：${text}`, phonetic: "" };
  return {
    ok: true,
    text,
    translation: item.translation,
    phonetic: item.phonetic,
    inflection: detectInflection(text),
    raw: { mock: true }
  };
}

function sanitizeUrl(value) {
  if (!value || typeof value !== "string") return value;
  try {
    const url = new URL(value);
    for (const key of ["appKey", "sign", "salt"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch (_error) {
    return value;
  }
}

function sanitizeYoudaoRaw(data) {
  if (!data || typeof data !== "object") return {};
  const allowed = {
    requestId: data.requestId,
    query: data.query,
    translation: data.translation,
    errorCode: data.errorCode,
    l: data.l,
    isWord: data.isWord,
    basic: data.basic,
    dict: data.dict,
    webdict: data.webdict,
    mTerminalDict: data.mTerminalDict,
    speakUrl: sanitizeUrl(data.speakUrl),
    tSpeakUrl: sanitizeUrl(data.tSpeakUrl)
  };
  return JSON.parse(JSON.stringify(allowed));
}

function parseYoudaoDict(data, query) {
  if (!data || data.errorCode !== "0" || !Array.isArray(data.result)) return null;
  const entries = [];
  let phonetic = "";
  for (const result of data.result) {
    const ec = result.ec || result.ce || result.ee || {};
    phonetic = phonetic || ec.usPhonetic || ec.ukPhonetic || ec.phonetic || "";
    const explains = Array.isArray(ec.explains) ? ec.explains : [];
    for (const item of explains) {
      if (!item) continue;
      const text = typeof item === "string" ? item : item.text || "";
      const explain = typeof item === "string" ? [] : item.explain || [];
      const match = String(text).match(/^([a-z.]+)\s*(.+)$/i);
      entries.push({
        partOfSpeech: match ? match[1] : "",
        definitions: [match ? match[2] : text, ...explain].filter(Boolean).slice(0, 4)
      });
    }
  }
  if (!entries.length) return null;
  return {
    source: "youdao-dict",
    query,
    phonetic,
    entries
  };
}

async function fetchYoudaoDictionary(query, env = process.env) {
  const appKey = env.YOUDAO_APP_KEY;
  const appSecret = env.YOUDAO_APP_SECRET;
  if (!appKey || !appSecret) return null;
  const salt = crypto.randomUUID();
  const curtime = Math.floor(Date.now() / 1000).toString();
  const params = new URLSearchParams({
    q: query,
    langType: "en",
    appKey,
    dicts: "ec",
    salt,
    sign: createSign({ appKey, query, salt, curtime, appSecret }),
    signType: "v3",
    curtime,
    docType: "json"
  });
  const response = await fetch(YOUDAO_DICT_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: params
  });
  const data = await response.json().catch(() => null);
  return parseYoudaoDict(data, query);
}

function parseFreeDictionary(data, query) {
  if (!Array.isArray(data) || !data.length) return null;
  const first = data[0];
  const entries = [];
  for (const meaning of first.meanings || []) {
    const definitions = (meaning.definitions || [])
      .map((item) => item.definition)
      .filter(Boolean)
      .slice(0, 5);
    if (definitions.length) {
      entries.push({
        partOfSpeech: POS_LABELS[meaning.partOfSpeech] || meaning.partOfSpeech || "",
        definitions
      });
    }
  }
  if (!entries.length) return null;
  const phonetic =
    first.phonetic ||
    ((first.phonetics || []).find((item) => item.text) || {}).text ||
    "";
  return {
    source: "free-dictionary",
    query: first.word || query,
    phonetic: String(phonetic).replace(/^\/|\/$/g, ""),
    entries
  };
}

async function fetchFreeDictionary(query) {
  const response = await fetch(`${FREE_DICT_URL}/${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return parseFreeDictionary(data, query);
}

async function translateDictionaryDefinitions(dictionary, env = process.env) {
  const appKey = env.YOUDAO_APP_KEY;
  const appSecret = env.YOUDAO_APP_SECRET;
  if (!dictionary || dictionary.source !== "free-dictionary" || !appKey || !appSecret) return dictionary;
  const translatedEntries = [];
  for (const entry of dictionary.entries.slice(0, 3)) {
    const definitions = [];
    for (const definition of entry.definitions.slice(0, 3)) {
      const data = await requestYoudaoText({ query: definition, from: "en", to: "zh-CHS", env });
      const zh = data && data.errorCode === "0" ? (data.translation || []).join("；") : "";
      definitions.push({ en: definition, zh });
    }
    translatedEntries.push({ ...entry, definitions });
  }
  return { ...dictionary, entries: translatedEntries };
}

function dictionaryToSummary(dictionary, fallback) {
  if (!dictionary || !Array.isArray(dictionary.entries)) return fallback || "";
  const entryText = dictionary.entries
    .map((entry) => {
      const defs = entry.definitions
        .map((definition) => (typeof definition === "string" ? definition : definition.zh || definition.en || ""))
        .filter(Boolean)
        .slice(0, 3)
        .join("；");
      return `${entry.partOfSpeech ? `${entry.partOfSpeech} ` : ""}${defs}`;
    })
    .filter(Boolean)
    .slice(0, 4)
    .join("\n");
  if (fallback && !isSuspiciousDirectTranslation(fallback) && !entryText.includes(fallback)) {
    return `${fallback}\n${entryText}`;
  }
  return entryText;
}

async function repairSummaryHead(query, summary, from, to, env) {
  const lines = String(summary || "").split("\n");
  const head = lines[0] || "";
  const compact = String(query || "").trim().toLocaleLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!isSuspiciousDirectTranslation(head) || !compact.endsWith("s") || compact.length <= 3) {
    return summary;
  }
  const singularQuery = compact.slice(0, -1);
  const singularResult = await translateWithYoudao({ text: singularQuery, from, to, env }).catch(() => null);
  const singularHead = singularResult && singularResult.ok ? String(singularResult.translation || "").split("\n")[0] : "";
  if (isSuspiciousDirectTranslation(singularHead)) return summary;
  lines[0] = singularHead;
  return lines.filter(Boolean).join("\n");
}

function isSuspiciousDirectTranslation(value) {
  const text = String(value || "").trim();
  return !text || /^[的地得]/.test(text) || text.length <= 1;
}

async function bestDirectTranslation(query, current, from, to, env, preferred = "") {
  if (!isSuspiciousDirectTranslation(current)) return current;
  const candidates = dictionaryCandidates(query);
  const preferredCandidates = preferred ? dictionaryCandidates(preferred) : [];
  const compact = String(query || "").trim().toLocaleLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  const singularFirst = compact.endsWith("s") && compact.length > 3 ? [compact.slice(0, -1)] : [];
  const baseCandidates = [...singularFirst, ...preferredCandidates, ...candidates.slice(1), ...candidates.slice(0, 1)];
  const seen = new Set();
  for (const candidate of baseCandidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (candidate.toLocaleLowerCase() === String(query).toLocaleLowerCase() && candidates.length > 1) continue;
    const data = await requestYoudaoText({ query: candidate, from, to, env }).catch(() => null);
    const translated = data && data.errorCode === "0" ? (data.translation || []).join("；") : "";
    if (!isSuspiciousDirectTranslation(translated)) return translated;
  }
  return current;
}

async function lookupDictionary(text, env = process.env) {
  if (!isEnglishWordLike(text)) return null;
  for (const candidate of dictionaryCandidates(text)) {
    const youdaoDict = await fetchYoudaoDictionary(candidate, env).catch(() => null);
    if (youdaoDict) return youdaoDict;
    const freeDict = await fetchFreeDictionary(candidate).catch(() => null);
    if (freeDict) return translateDictionaryDefinitions(freeDict, env);
  }
  return null;
}

async function translateWithYoudao({ text, from = "auto", to = "zh-CHS", env = process.env }) {
  const query = normalizeWhitespace(text);
  if (!query) {
    return { ok: false, errorCode: "EMPTY_TEXT", message: "翻译文本不能为空" };
  }
  if (String(env.YOUDAO_MOCK).toLowerCase() === "true") {
    return mockTranslate(query);
  }
  const appKey = env.YOUDAO_APP_KEY;
  const appSecret = env.YOUDAO_APP_SECRET;
  if (!appKey || !appSecret) {
    return {
      ok: false,
      errorCode: "CONFIG_MISSING",
      message: "有道密钥未配置，请检查 local-server/.env"
    };
  }
  const data = await requestYoudaoText({ query, from, to, env });
  if (!data) {
    return { ok: false, errorCode: "YOUDAO_HTTP_ERROR", message: "翻译失败，请稍后重试" };
  }
  if (data.errorCode && data.errorCode !== "0") {
    return {
      ok: false,
      errorCode: "YOUDAO_ERROR",
      message: "有道翻译返回错误，请检查密钥或稍后重试",
      raw: { errorCode: data.errorCode }
    };
  }
  const basic = data.basic || {};
  const explains = Array.isArray(basic.explains) ? basic.explains : [];
  const dictionary = explains.length
    ? {
        source: "youdao-translation-basic",
        query,
        phonetic: basic["us-phonetic"] || basic["uk-phonetic"] || basic.phonetic || "",
        entries: explains.map((item) => {
          const match = String(item).match(/^([a-z.]+)\s*(.+)$/i);
          return {
            partOfSpeech: match ? match[1] : "",
            definitions: [match ? match[2] : String(item)]
          };
        })
      }
    : await lookupDictionary(query, env);
  const inflection = await buildInflectionInfo(query, env);
  let directTranslation = (data.translation || []).join("；");
  const compactQuery = query.toLocaleLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (isSuspiciousDirectTranslation(directTranslation) && compactQuery.endsWith("s") && compactQuery.length > 3) {
    const singularQuery = compactQuery.slice(0, -1);
    const singularResult = await translateWithYoudao({ text: singularQuery, from, to, env }).catch(() => null);
    const singularTranslation = singularResult && singularResult.ok ? String(singularResult.translation || "").split("\n")[0] : "";
    if (!isSuspiciousDirectTranslation(singularTranslation)) {
      directTranslation = singularTranslation;
    }
  }
  if (dictionary && dictionary.query && dictionary.query !== query) {
    const baseData = await requestYoudaoText({ query: dictionary.query, from, to, env }).catch(() => null);
    if (baseData && baseData.errorCode === "0" && Array.isArray(baseData.translation)) {
      const baseTranslation = baseData.translation.join("；");
      if (!isSuspiciousDirectTranslation(baseTranslation)) {
        directTranslation = baseTranslation;
      }
    }
  }
  directTranslation = await bestDirectTranslation(query, directTranslation, from, to, env, dictionary && dictionary.query);
  const translation = await repairSummaryHead(query, dictionaryToSummary(dictionary, directTranslation), from, to, env);
  let outputTranslation = translation;
  if (isSuspiciousDirectTranslation(String(outputTranslation).split("\n")[0]) && compactQuery.endsWith("s") && compactQuery.length > 3) {
    const fallbackData = await requestYoudaoText({ query: compactQuery.slice(0, -1), from, to, env }).catch(() => null);
    const fallbackHead = fallbackData && fallbackData.errorCode === "0" ? (fallbackData.translation || []).join("；") : "";
    if (!isSuspiciousDirectTranslation(fallbackHead)) {
      outputTranslation = String(outputTranslation).replace(/^[^\n]*/, fallbackHead);
    }
  }
  return {
    ok: true,
    text: query,
    translation: outputTranslation,
    phonetic: (dictionary && dictionary.phonetic) || basic["us-phonetic"] || basic["uk-phonetic"] || basic.phonetic || "",
    dictionary,
    inflection,
    raw: sanitizeYoudaoRaw(data)
  };
}

module.exports = {
  YOUDAO_URL,
  sha256,
  createSign,
  mockTranslate,
  sanitizeYoudaoRaw,
  lookupDictionary,
  requestYoudaoText,
  detectInflection,
  buildInflectionInfo,
  isSuspiciousDirectTranslation,
  repairSummaryHead,
  translateWithYoudao
};
