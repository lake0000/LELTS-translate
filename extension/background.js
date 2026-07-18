importScripts("shared/normalize.js", "shared/idb.js");

const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";

async function getServerUrl() {
  const stored = await chrome.storage.local.get({ serverUrl: DEFAULT_SERVER_URL });
  return String(stored.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, "");
}

function friendlyTranslateError(error) {
  const message = String(error && error.message ? error.message : error || "");
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return {
      errorCode: "LOCAL_SERVER_OFFLINE",
      message: "本地翻译服务未启动"
    };
  }
  return {
    errorCode: "TRANSLATE_ERROR",
    message: message || "翻译失败，点击重试"
  };
}

async function requestLocalTranslate(payload) {
  const serverUrl = await getServerUrl();
  const response = await fetch(`${serverUrl}/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok) {
    throw new Error((data && data.message) || "翻译失败，点击重试");
  }
  return data;
}

async function translate(payload) {
  const check = WordTranslateNormalize.validateSelection(payload.text);
  if (!check.ok) {
    return { ok: false, errorCode: check.code, message: check.message };
  }
  await WordbookDB.initDefaultNotebooks();
  const from = payload.from || "auto";
  const to = payload.to || "zh-CHS";
  const cached = await WordbookDB.getCachedTranslation(check.text, from, to);
  const englishWordLike = /^[A-Za-z][A-Za-z' -]{0,48}$/.test(check.text);
  const suspiciousCached = cached && /^[的地得]/.test(String(cached.translation || "").trim());
  if (cached && (!englishWordLike || (cached.dictionary && !suspiciousCached))) {
    return { ok: true, cached: true, ...cached };
  }
  try {
    const result = await requestLocalTranslate({ text: check.text, from, to });
    const normalized = {
      ok: true,
      cached: false,
      text: result.text || check.text,
      translation: result.translation || "",
      phonetic: result.phonetic || "",
      dictionary: result.dictionary || null,
      raw: result.raw || {}
    };
    await WordbookDB.setCachedTranslation(check.text, normalized, from, to);
    return normalized;
  } catch (error) {
    return { ok: false, ...friendlyTranslateError(error) };
  }
}

async function openDashboard() {
  const url = chrome.runtime.getURL("dashboard/dashboard.html");
  await chrome.tabs.create({ url });
}

function isInjectableUrl(url) {
  return /^(https?|file):\/\//i.test(url || "");
}

async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["shared/normalize.js", "content/bubble-ui.js", "content/selection-listener.js"]
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/content.css"]
  });
}

async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id && isInjectableUrl(tab.url))
      .map((tab) => injectContentScripts(tab.id))
  );
}

chrome.runtime.onInstalled.addListener(() => {
  WordbookDB.initDefaultNotebooks().catch(console.error);
  injectIntoOpenTabs().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoOpenTabs().catch(console.error);
});

chrome.action.onClicked.addListener(() => {
  openDashboard().catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) {
      sendResponse({ ok: false, message: "未知请求" });
      return;
    }
    if (message.type === "translate") {
      sendResponse(await translate(message.payload || {}));
      return;
    }
    if (message.type === "listNotebooks") {
      sendResponse({ ok: true, notebooks: await WordbookDB.listNotebooks() });
      return;
    }
    if (message.type === "addWord") {
      const result = await WordbookDB.addOrUpdateWord(message.payload || {});
      sendResponse({ ok: true, ...result });
      return;
    }
    if (message.type === "createNotebook") {
      const notebook = await WordbookDB.createNotebook(message.name || "");
      sendResponse({ ok: true, notebook });
      return;
    }
    if (message.type === "openDashboard") {
      await openDashboard();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, message: "未知请求" });
  })().catch((error) => {
    sendResponse({ ok: false, message: error.message || "操作失败" });
  });
  return true;
});
