(async function initOptions() {
  const input = document.getElementById("server-url");
  const status = document.getElementById("status");
  const stored = await chrome.storage.local.get({ serverUrl: "http://127.0.0.1:8787" });
  input.value = stored.serverUrl;

  function setStatus(message) {
    status.textContent = message;
  }

  document.getElementById("options-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.local.set({ serverUrl: input.value.replace(/\/+$/, "") });
    setStatus("已保存");
  });

  document.getElementById("test-server").addEventListener("click", async () => {
    const url = input.value.replace(/\/+$/, "");
    const response = await fetch(`${url}/health`).catch(() => null);
    if (!response || !response.ok) {
      setStatus("本地服务未启动");
      return;
    }
    const data = await response.json();
    setStatus(data.ok ? "本地服务可用" : "本地服务异常");
  });
})();

