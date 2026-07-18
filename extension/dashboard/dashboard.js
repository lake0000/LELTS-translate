(function initDashboard() {
  const state = {
    notebooks: [],
    words: [],
    activeNotebookId: "all",
    query: "",
    editingId: ""
  };

  const els = {
    notebookList: document.getElementById("notebook-list"),
    wordTable: document.getElementById("word-table"),
    emptyState: document.getElementById("empty-state"),
    searchInput: document.getElementById("search-input"),
    wordCount: document.getElementById("word-count"),
    activeTitle: document.getElementById("active-notebook-title"),
    activeMeta: document.getElementById("active-notebook-meta"),
    newNotebookForm: document.getElementById("new-notebook-form"),
    newNotebookName: document.getElementById("new-notebook-name"),
    exportScope: document.getElementById("export-scope"),
    toast: document.getElementById("toast")
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), 2400);
  }

  function notebookName(id) {
    return (state.notebooks.find((item) => item.id === id) || {}).name || "";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function sourceLabel(word) {
    if (word.sourceTitle) return word.sourceTitle;
    return WordTranslateNormalize.safeDomain(word.sourceUrl) || "";
  }

  async function loadData() {
    await WordbookDB.initDefaultNotebooks();
    state.notebooks = await WordbookDB.listNotebooks();
    state.words = await WordbookDB.listWords({
      notebookId: state.activeNotebookId,
      query: state.query
    });
    render();
  }

  function renderNotebooks() {
    const allCount = state.words.length;
    const buttons = [
      `<button type="button" class="notebook-button ${state.activeNotebookId === "all" ? "active" : ""}" data-notebook-id="all">
        <span>全部生词</span><span>${allCount}</span>
      </button>`
    ];
    for (const notebook of state.notebooks) {
      const count = state.words.filter((word) => state.activeNotebookId === notebook.id || word.notebookId === notebook.id).length;
      buttons.push(
        `<button type="button" class="notebook-button ${state.activeNotebookId === notebook.id ? "active" : ""}" data-notebook-id="${escapeHtml(notebook.id)}">
          <span>${escapeHtml(notebook.name)}</span><span>${count}</span>
        </button>`
      );
    }
    els.notebookList.innerHTML = buttons.join("");
    els.notebookList.querySelectorAll("[data-notebook-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.activeNotebookId = button.dataset.notebookId;
        state.editingId = "";
        await loadData();
      });
    });
  }

  function editRow(word) {
    const notebookOptions = state.notebooks
      .map((notebook) => `<option value="${escapeHtml(notebook.id)}" ${notebook.id === word.notebookId ? "selected" : ""}>${escapeHtml(notebook.name)}</option>`)
      .join("");
    return `<td colspan="6">
      <form class="inline-edit" data-edit-id="${escapeHtml(word.id)}">
        <input name="translation" value="${escapeHtml(word.translation)}" />
        <select name="notebookId">${notebookOptions}</select>
        <button type="submit">保存</button>
        <button type="button" data-cancel-edit="${escapeHtml(word.id)}">取消</button>
      </form>
    </td>`;
  }

  function renderRows() {
    els.emptyState.classList.toggle("hidden", state.words.length > 0);
    els.wordTable.innerHTML = state.words
      .map((word) => {
        if (state.editingId === word.id) return `<tr>${editRow(word)}</tr>`;
        return `<tr>
          <td class="word-cell">${escapeHtml(word.text)}</td>
          <td class="translation-cell">${escapeHtml(word.translation)}</td>
          <td>${escapeHtml(word.phonetic || "")}</td>
          <td class="source-cell">${escapeHtml(sourceLabel(word))}</td>
          <td>${escapeHtml(formatDate(word.createdAt))}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-edit="${escapeHtml(word.id)}">编辑</button>
              <button type="button" data-copy="${escapeHtml(word.id)}">复制</button>
              <button type="button" class="danger" data-delete="${escapeHtml(word.id)}">删除</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
    bindRowActions();
  }

  function renderMeta() {
    const current = state.activeNotebookId === "all" ? null : state.notebooks.find((item) => item.id === state.activeNotebookId);
    els.activeTitle.textContent = current ? current.name : "全部生词";
    els.activeMeta.textContent = state.query ? `搜索结果 ${state.words.length} 条` : `${state.words.length} 条记录`;
    els.wordCount.textContent = `${state.words.length} words`;
  }

  function render() {
    renderMeta();
    renderNotebooks();
    renderRows();
  }

  function bindRowActions() {
    els.wordTable.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingId = button.dataset.edit;
        render();
      });
    });
    els.wordTable.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const word = state.words.find((item) => item.id === button.dataset.copy);
        if (!word) return;
        await navigator.clipboard.writeText(`${word.text}\n${word.translation}`).catch(() => {});
        showToast("已复制");
      });
    });
    els.wordTable.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const word = state.words.find((item) => item.id === button.dataset.delete);
        if (!word) return;
        if (!confirm(`删除 ${word.text}？`)) return;
        await WordbookDB.deleteWord(word.id);
        showToast("已删除");
        await loadData();
      });
    });
    els.wordTable.querySelectorAll("[data-cancel-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        state.editingId = "";
        render();
      });
    });
    els.wordTable.querySelectorAll("[data-edit-id]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        await WordbookDB.updateWord(form.dataset.editId, {
          translation: data.get("translation"),
          notebookId: data.get("notebookId")
        });
        state.editingId = "";
        showToast("已保存");
        await loadData();
      });
    });
  }

  async function serverUrl() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get({ serverUrl: "http://127.0.0.1:8787" });
      return String(stored.serverUrl || "http://127.0.0.1:8787").replace(/\/+$/, "");
    }
    return "http://127.0.0.1:8787";
  }

  async function exportData(kind) {
    const scope = els.exportScope.value;
    const notebookId = scope === "all" ? "all" : state.activeNotebookId;
    const snapshot = await WordbookDB.exportSnapshot(notebookId, state.query);
    if (!snapshot.words.length) {
      showToast("暂无单词可导出");
      return;
    }
    const scopeName = scope === "all" || notebookId === "all" ? "全部生词" : notebookName(notebookId);
    if (kind === "csv") {
      const csv = WordbookExport.buildCsv(snapshot.notebooks, snapshot.words);
      WordbookExport.downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), WordbookExport.timestampName(scopeName, "csv"));
      showToast("CSV 已导出");
      return;
    }
    const url = `${await serverUrl()}/api/export/${kind}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...snapshot, scopeName })
    }).catch(() => null);
    if (!response || !response.ok) {
      showToast("本地导出服务未启动");
      return;
    }
    const blob = await response.blob();
    WordbookExport.downloadBlob(blob, WordbookExport.timestampName(scopeName, kind));
    showToast(`${kind.toUpperCase()} 已导出`);
  }

  els.searchInput.addEventListener("input", async () => {
    state.query = els.searchInput.value;
    state.editingId = "";
    await loadData();
  });

  els.newNotebookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = els.newNotebookName.value;
    if (!name.trim()) return;
    const notebook = await WordbookDB.createNotebook(name);
    els.newNotebookName.value = "";
    state.activeNotebookId = notebook.id;
    showToast("已新建生词本");
    await loadData();
  });

  document.getElementById("export-csv").addEventListener("click", () => exportData("csv"));
  document.getElementById("export-xlsx").addEventListener("click", () => exportData("xlsx"));
  document.getElementById("export-pdf").addEventListener("click", () => exportData("pdf"));

  loadData().catch((error) => showToast(error.message || "加载失败"));
})();

