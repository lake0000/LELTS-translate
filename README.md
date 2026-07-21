<p align="center">
  <img src="docs/cover.png" alt="Instant Wordbook cover" width="920">
</p>

<h1 align="center">Instant Wordbook</h1>

<p align="center">
  <strong>浏览器划词翻译 + 本地生词本 + Dashboard 管理 + CSV/XLSX/PDF 导出</strong>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-1d6fd8">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D18-2f855a">
  <img alt="Storage" src="https://img.shields.io/badge/Storage-IndexedDB-f59e0b">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-111827">
</p>

## 目录

- [项目亮点](#项目亮点)
- [工作方式](#工作方式)
- [快速开始](#快速开始)
- [配置有道 Key](#配置有道-key)
- [浏览器加载插件](#浏览器加载插件)
- [日常使用](#日常使用)
- [测试](#测试)
- [目录结构](#目录结构)
- [隐私与安全](#隐私与安全)
- [常见问题](#常见问题)
- [License](#license)

## 项目亮点

Instant Wordbook 是一个本地优先的英语学习浏览器插件，适合阅读网页、雅思阅读材料、本地 HTML 练习页时快速收集生词。

- 先划词，再按 `Shift`，避免按住 Shift 拖选时和网页快捷键冲突
- 支持普通网页和已授权的 `file:///` 本地 HTML 页面
- 翻译浮窗展示主译、词性、多义项和加入生词本入口
- 默认生词本：`小作文词`、`阅读`
- Dashboard 支持搜索、编辑、移动、删除和新建分组
- 支持导出 `CSV`、`XLSX`、`PDF`
- 翻译缓存会保存已查过的词，减少重复 API 调用
- 有道密钥只保存在本地服务 `.env`，不会进入插件源码

## 工作方式

```txt
网页选区
  ↓
Chrome / Edge Manifest V3 content script
  ↓
extension service worker
  ↓
本地 Node.js 翻译代理服务
  ↓
有道文本翻译 API / 词典增强回退
  ↓
IndexedDB 缓存和本地生词本
```

为什么需要本地服务：

- 浏览器插件源码容易被查看，不能把有道密钥写进插件
- 本地服务负责读取 `.env`、签名和请求有道 API
- 插件只和 `http://127.0.0.1:8787` 通信

## 快速开始

```powershell
git clone <your-repo-url>
cd <repo-folder>
npm install
cp local-server/.env.example local-server/.env
npm run server
```

然后在浏览器扩展管理页加载 `extension` 目录。

如果只是想先体验流程，没有有道 Key，可以把 `local-server/.env` 设置成 mock 模式：

```txt
YOUDAO_MOCK=true
PORT=8787
```

mock 模式只适合测试，不会返回真实翻译。

## 配置有道 Key

复制配置文件：

```powershell
cp local-server/.env.example local-server/.env
```

编辑 `local-server/.env`：

```txt
YOUDAO_APP_KEY=你的应用ID
YOUDAO_APP_SECRET=你的应用密钥
YOUDAO_MOCK=false
PORT=8787
PDF_FONT_PATH=
```

字段说明：

- `YOUDAO_APP_KEY`：有道智云应用 ID
- `YOUDAO_APP_SECRET`：有道智云应用密钥
- `YOUDAO_MOCK`：是否启用模拟翻译；真实使用填 `false`
- `PORT`：本地服务端口，默认 `8787`
- `PDF_FONT_PATH`：可选，PDF 导出使用的中文字体路径

启动服务：

```powershell
npm run server
```

健康检查：

```txt
http://127.0.0.1:8787/health
```

正常返回类似：

```json
{
  "ok": true,
  "service": "instant-wordbook-local-server",
  "mock": false,
  "port": 8787
}
```

## 浏览器加载插件

Chrome：

```txt
chrome://extensions
```

Edge：

```txt
edge://extensions
```

加载步骤：

1. 打开“开发者模式”
2. 点击“加载已解压的扩展程序”
3. 选择项目里的 `extension` 目录
4. 如果要在本地 HTML 文件中使用，打开“允许访问文件 URL”
5. 加载或重新加载插件后，刷新要翻译的网页

## 日常使用

```txt
划选英文单词或短语 → 按一下 Shift → 查看翻译浮窗 → 加入生词本
```

点击插件图标可以打开 Dashboard：

- 切换生词本
- 搜索单词
- 编辑翻译
- 移动到其他分组
- 删除生词
- 导出 CSV / XLSX / PDF

## 测试

完整测试：

```powershell
npm run test:all
```

单独运行：

```powershell
npm test
npm run smoke:server
npm run test:ui
npm run test:e2e
```

覆盖内容：

- 文本标准化和长度校验
- 有道签名
- CSV BOM 和转义
- 词典增强
- 本地服务健康检查和导出
- Dashboard UI
- 插件端到端链路

## 目录结构

```txt
extension/       浏览器插件代码
  content/       划词监听和浮窗
  dashboard/     生词本管理页
  icons/         扩展图标
local-server/    本地翻译代理和导出服务
shared/          插件与服务共用工具
tests/           自动化测试
docs/            README 图片资源
scripts/         开发辅助脚本
```

## 隐私与安全

- `.env` 已被 `.gitignore` 忽略
- 仓库只提交 `local-server/.env.example`
- 不要把真实 Key 写进插件源码
- 不要把真实 Key 提交到 Git
- 发布包不应包含 `local-server/.env`
- 生词默认保存在本地浏览器 IndexedDB
- 新词翻译会请求有道 API；已缓存词可直接本地读取

确认 `.env` 没有被 Git 跟踪：

```powershell
git status --short
git ls-files local-server/.env
```

如果第二个命令没有输出，说明 `.env` 没有被提交。

## 常见问题

### 插件 UI 能打开，但划词没反应

检查：

- 当前页面是否是 `http://`、`https://` 或已授权的 `file:///`
- 加载插件后是否刷新过当前网页
- 扩展详情页是否允许访问当前站点
- 本地文件页面是否打开“允许访问文件 URL”

在网页 Console 输入：

```js
document.documentElement.dataset.instantWordbook
```

正常应返回：

```txt
"ready"
```

### 没网能不能用

可以离线使用：

- Dashboard
- 已保存的生词
- 已缓存翻译
- CSV / XLSX / PDF 导出

新单词首次翻译需要联网。

### 别人拉取项目后在哪里填 Key

每个人都在自己的本地文件里填写：

```txt
local-server/.env
```

不要把这个文件提交。

## 参考

- [GitHub Docs: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Chrome Extensions: Manifest icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons)
- [Chrome Extensions: action default_icon](https://developer.chrome.com/docs/extensions/reference/api/action)

## License

MIT. See [LICENSE](LICENSE).

