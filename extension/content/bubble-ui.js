(function initBubble() {
  if (window.__instantWordbookBubbleReady) return;
  window.__instantWordbookBubbleReady = true;

  const BUBBLE_ID = "instant-wordbook-bubble";
  let root;
  let currentResult;
  let currentRect;

  function ensureBubble() {
    if (root) return root;
    root = document.createElement("div");
    root.id = BUBBLE_ID;
    root.className = "iwb-bubble iwb-hidden";
    document.documentElement.appendChild(root);
    document.addEventListener("pointerdown", (event) => {
      if (root && !root.contains(event.target)) hide();
    });
    return root;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function positionBubble(rect) {
    const bubble = ensureBubble();
    currentRect = rect || currentRect;
    if (!currentRect) return;
    bubble.classList.remove("iwb-hidden");
    const width = Math.min(340, window.innerWidth - 24);
    bubble.style.width = `${width}px`;
    const height = bubble.offsetHeight || 170;
    const gap = 10;
    const left = clamp(currentRect.left, 12, window.innerWidth - width - 12);
    const preferTop = currentRect.bottom + height + gap > window.innerHeight;
    const top = preferTop
      ? clamp(currentRect.top - height - gap, 12, window.innerHeight - height - 12)
      : clamp(currentRect.bottom + gap, 12, window.innerHeight - height - 12);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function render(html, rect) {
    const bubble = ensureBubble();
    bubble.innerHTML = html;
    positionBubble(rect);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showLoading(text, rect) {
    currentResult = null;
    render(
      `<div class="iwb-topline"><span class="iwb-word">${escapeHtml(text)}</span></div>
       <div class="iwb-loading">翻译中...</div>`,
      rect
    );
  }

  function showLongText(message, rect) {
    currentResult = null;
    render(
      `<div class="iwb-state iwb-state-warn">${escapeHtml(message)}</div>`,
      rect
    );
  }

  function showError(message, rect, onRetry) {
    currentResult = null;
    render(
      `<button type="button" class="iwb-error">${escapeHtml(message || "翻译失败，点击重试")}</button>`,
      rect
    );
    root.querySelector(".iwb-error").addEventListener("click", () => onRetry && onRetry());
  }

  function notebookListHtml(notebooks) {
    return notebooks
      .map((item) => `<button type="button" class="iwb-menu-item" data-notebook-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`)
      .join("");
  }

  function definitionText(definition) {
    if (typeof definition === "string") return definition;
    const zh = definition && definition.zh ? definition.zh : "";
    const en = definition && definition.en ? definition.en : "";
    return zh || en;
  }

  function dictionaryHtml(dictionary) {
    if (!dictionary || !Array.isArray(dictionary.entries) || !dictionary.entries.length) return "";
    const entries = dictionary.entries
      .slice(0, 4)
      .map((entry) => {
        const definitions = (entry.definitions || [])
          .map(definitionText)
          .filter(Boolean)
          .slice(0, 4)
          .map((definition) => `<li>${escapeHtml(definition)}</li>`)
          .join("");
        if (!definitions) return "";
        return `<section class="iwb-dict-entry">
          ${entry.partOfSpeech ? `<div class="iwb-pos">${escapeHtml(entry.partOfSpeech)}</div>` : ""}
          <ol>${definitions}</ol>
        </section>`;
      })
      .filter(Boolean)
      .join("");
    return entries ? `<div class="iwb-dictionary">${entries}</div>` : "";
  }

  async function loadNotebooks() {
    const response = await chrome.runtime.sendMessage({ type: "listNotebooks" });
    if (!response || !response.ok) throw new Error((response && response.message) || "生词本加载失败");
    return response.notebooks || [];
  }

  async function addWord(notebookId, notebookName, trigger) {
    if (!currentResult) return;
    if (trigger) {
      trigger.disabled = true;
      trigger.classList.add("iwb-menu-item-busy");
      trigger.textContent = "加入中...";
    }
    const response = await chrome.runtime.sendMessage({
      type: "addWord",
      payload: {
        ...currentResult,
        notebookId,
        sourceUrl: location.href,
        sourceTitle: document.title || location.hostname
      }
    });
    if (!response || !response.ok) {
      if (trigger) {
        trigger.disabled = false;
        trigger.classList.remove("iwb-menu-item-busy");
        trigger.textContent = notebookName;
      }
      setToast((response && response.message) || "加入失败");
      return;
    }
    const label = notebookName || "生词本";
    const message = response.duplicate ? `已在${label}` : `已加入${label}`;
    const menu = root.querySelector(".iwb-menu");
    const primary = root.querySelector('[data-action="toggle-menu"]');
    if (menu) menu.classList.add("iwb-hidden");
    if (primary) primary.textContent = message;
    setToast(message);
    positionBubble();
  }

  function setToast(message) {
    const toast = root.querySelector(".iwb-toast");
    if (toast) toast.textContent = message;
  }

  function showSuccess(result, rect) {
    currentResult = {
      text: result.text,
      word: result.text,
      normalized: WordTranslateNormalize.normalizeWord(result.text),
      translation: result.translation || "",
      phonetic: result.phonetic || "",
      dictionary: result.dictionary || null,
      explainsJson: JSON.stringify(result.raw || {})
    };
    const dictHtml = dictionaryHtml(result.dictionary);
    const summary = result.translation ? String(result.translation).split("\n")[0] : "";
    render(
      `<div class="iwb-topline">
        <span class="iwb-word">${escapeHtml(result.text)}</span>
        ${result.cached ? '<span class="iwb-cache">已缓存</span>' : ""}
       </div>
       ${result.phonetic ? `<div class="iwb-phonetic">/${escapeHtml(result.phonetic)}/</div>` : ""}
       ${summary ? `<div class="iwb-summary">${escapeHtml(summary)}</div>` : ""}
       ${dictHtml || `<div class="iwb-translation">${escapeHtml(result.translation || "无翻译结果")}</div>`}
       <div class="iwb-actions">
         <div class="iwb-menu-wrap">
           <button type="button" class="iwb-primary" data-action="toggle-menu">加入生词本</button>
           <div class="iwb-menu iwb-hidden"></div>
         </div>
         <button type="button" class="iwb-ghost" data-action="copy">复制</button>
         <button type="button" class="iwb-ghost" data-action="dashboard">词库</button>
       </div>
       <div class="iwb-toast" aria-live="polite"></div>`,
      rect
    );
    bindSuccessActions();
  }

  function bindSuccessActions() {
    root.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      const text = `${currentResult.text}\n${currentResult.translation}`;
      await navigator.clipboard.writeText(text).catch(() => {});
      setToast("已复制");
    });
    root.querySelector('[data-action="dashboard"]').addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openDashboard" });
    });
    root.querySelector('[data-action="toggle-menu"]').addEventListener("click", async () => {
      const menu = root.querySelector(".iwb-menu");
      if (!menu.classList.contains("iwb-hidden")) {
        menu.classList.add("iwb-hidden");
        return;
      }
      menu.innerHTML = '<div class="iwb-menu-loading">加载中...</div>';
      menu.classList.remove("iwb-hidden");
      try {
        const notebooks = await loadNotebooks();
        menu.innerHTML = `${notebookListHtml(notebooks)}<button type="button" class="iwb-menu-item" data-new-notebook="1">+ 新建生词本</button>`;
        menu.querySelectorAll("[data-notebook-id]").forEach((button) => {
          button.addEventListener("click", () => addWord(button.dataset.notebookId, button.textContent.trim(), button));
        });
        menu.querySelector("[data-new-notebook]").addEventListener("click", async () => {
          const name = prompt("新建生词本名称");
          if (!name) return;
          const response = await chrome.runtime.sendMessage({ type: "createNotebook", name });
          if (response && response.ok) {
            await addWord(response.notebook.id, response.notebook.name);
          } else {
            setToast((response && response.message) || "新建失败");
          }
        });
      } catch (error) {
        menu.innerHTML = `<div class="iwb-menu-loading">${escapeHtml(error.message)}</div>`;
      }
      positionBubble();
    });
  }

  function hide() {
    if (root) root.classList.add("iwb-hidden");
  }

  window.InstantWordbookBubble = {
    showLoading,
    showLongText,
    showError,
    showSuccess,
    hide
  };
})();
