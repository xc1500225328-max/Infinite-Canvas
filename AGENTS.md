# 项目说明

## 项目概览

Infinite Canvas 是一个本地运行的 AI 图像/视频创作工具，后端使用 FastAPI，前端是静态 HTML/CSS/JavaScript 页面。项目支持通过多种后端能力生成或处理媒体，包括 OpenAI 兼容 API、APIMart 异步协议、Gemini 协议、火山方舟/火山引擎、RunningHub、ModelScope、即梦 CLI，以及本地或局域网 ComfyUI 工作流。

应用可以以两种形态运行：

- Web 服务模式：运行 `main.py`，浏览器访问 `http://127.0.0.1:3000/`。
- 桌面应用模式：运行 `desktop_launcher.py`，用 `pywebview` 打开本地窗口，并在后台启动同一个 FastAPI 应用。

## 技术栈

- Python 后端：`fastapi`、`uvicorn`、`pydantic`、`requests`、`httpx`、`python-multipart`、`pillow`、`websockets`。
- 桌面壳：`pywebview`、`pyinstaller`。
- 前端：原生 HTML/CSS/JavaScript，使用本地镜像的 `tailwindcss-cdn.js`、`lucide.js`、`three-0.160.0.module.js`。
- 国际化：`static/js/i18n*.js` 与 `static/js/i18n/` 下的字典文件。
- 打包：PowerShell 脚本 + PyInstaller，安装包使用 `installer/InfiniteCanvasDesktop.iss`。

## 重要目录

- `main.py`：核心后端，包含 FastAPI 应用、API 路由、WebSocket、配置加载、运行时数据管理、ComfyUI/RunningHub/ModelScope/火山/即梦等集成逻辑。
- `desktop_launcher.py`：桌面版入口，负责单实例互斥、端口选择、启动 uvicorn、创建 pywebview 窗口、保存窗口状态和主题。
- `static/`：前端页面和静态资源。
  - `static/index.html`：入口页。
  - `static/canvas.html`、`static/smart-canvas.html`：画布相关主界面。
  - `static/api-settings.html`：API 平台和密钥设置。
  - `static/comfyui-settings.html`：ComfyUI 工作流设置。
  - `static/asset-manager.html`：素材库和提示词库管理。
  - `static/js/canvas.js`、`static/js/smart-canvas.js`：画布主要交互逻辑。
  - `static/css/`：页面样式。
  - `static/vendor/`：离线第三方前端依赖和字体。
- `workflows/`：内置 ComfyUI 工作流 JSON 及配置，例如 `Z-Image.json`、`Flux2-Klein.json`、`upscale.json`。
- `data/`：默认配置种子数据，如 API 平台、素材库、提示词库。注意运行时会根据模式迁移或写入用户数据目录。
- `assets/`：应用图标和部分资源；运行时上传/输出资源可能写入数据目录中的 `assets/`。
- `tools/`：辅助脚本，例如应用图标生成和即梦 CLI 安装/登录脚本。
- `installer/`：Windows 安装包脚本和本地化文件。
- `packages/`、`python/`：项目自带的离线 Python wheel 包和便携 Python 运行时。
- `build/`、`dist/`：构建产物目录，通常不应手工编辑。

## 运行方式

### 普通 Web 模式

```powershell
python main.py
```

或者直接运行：

```powershell
.\run.bat
```

`run.bat` 会优先使用项目内置 `python\python.exe`，不存在时回退到系统 `python`，并自动打开 `http://127.0.0.1:3000/`。

如果系统或便携 Python 依赖不完整，可以使用构建虚拟环境启动本地浏览器预览：

```powershell
.\.venv-build\Scripts\python.exe main.py
```

启动后浏览器访问 `http://127.0.0.1:3000/`。

### 桌面模式

```powershell
python desktop_launcher.py
```

如果需要使用构建虚拟环境运行桌面模式：

```powershell
.\.venv-build\Scripts\python.exe desktop_launcher.py
```

桌面模式默认监听 `127.0.0.1`，首选端口为 `3000`。如果端口被占用，`desktop_launcher.py` 会尝试 `8000`、`8080`、`3001-3999`、`8001-8999` 和一段临时端口。

### 桌面自检

```powershell
python desktop_launcher.py --self-test
```

自检会启动后端，检查首页是否可访问，并检查 `/ws/stats` WebSocket 是否能返回 `pong`。

## 常用开发与校验命令

安装依赖：

```powershell
pip install -r requirements.txt
pip install -r requirements-desktop.txt
```

校验 i18n 字典：

```powershell
node static/js/i18n/validate-i18n.js
```

桌面版打包：

```powershell
.\build_desktop_exe.ps1
```

Web/服务版 EXE 打包：

```powershell
.\build_exe.ps1
```

安装包构建：

```powershell
.\build_installer.ps1
```

构建并上传 GitHub Release：

```powershell
.\build_and_upload_release.ps1
```

上传 Release 需要 `GITHUB_TOKEN` 或 Git Credential Manager 中已有 GitHub 凭据。

## 运行时数据与配置

后端会计算两个重要路径：

- `BASE_DIR`：应用安装目录或源码目录。
- `DATA_ROOT_DIR`：运行时数据根目录。

数据目录规则：

- 设置 `INFINITE_CANVAS_DATA_DIR` 时，使用该路径。
- 设置 `INFINITE_CANVAS_PORTABLE_DATA=1` 时，运行时数据保存在应用目录旁。
- 冻结打包或桌面模式下，Windows 默认写入 `%APPDATA%\InfiniteCanvas`。
- 普通源码 Web 模式默认使用项目根目录。

重要运行时文件：

- `API/.env`：API Key 等密钥写入位置。不要提交真实密钥。
- `global_config.json`：全局配置。
- `history.json`：生成历史。
- `data/api_providers.json`：API 平台配置。
- `data/asset_library.json`：素材库索引。
- `data/prompt_libraries.json`：提示词库。
- `data/canvases/`：画布数据。
- `data/conversations/`：聊天会话数据。
- `assets/input/`、`assets/output/`、`assets/library/`：上传、输出和素材库文件。
- `logs/backend.log`、`logs/desktop.log`：后端和桌面日志。

## 关键环境变量

- `INFINITE_CANVAS_DATA_DIR`：指定运行时数据目录。
- `INFINITE_CANVAS_PORTABLE_DATA=1`：启用便携数据模式。
- `INFINITE_CANVAS_DESKTOP_DATA=1`：桌面模式默认设置，使用系统应用数据目录。
- `INFINITE_CANVAS_PORT`：桌面启动时的首选端口。
- `INFINITE_CANVAS_LOG_LEVEL`：uvicorn 日志级别。
- `INFINITE_CANVAS_DESKTOP_DEBUG=1`：开启 pywebview 调试。
- `INFINITE_CANVAS_ALLOW_MULTIPLE=1`：允许桌面应用多实例。
- `INFINITE_CANVAS_GITHUB_REPO_URL`、`INFINITE_CANVAS_GITHUB_BRANCH`、`INFINITE_CANVAS_GITHUB_VERSION_URL`、`INFINITE_CANVAS_UPDATE_MANIFEST_URL`：更新检查和自更新相关配置。
- `INFINITE_CANVAS_GITHUB_TOKEN` 或 `GITHUB_TOKEN`：访问 GitHub API 时使用。
- `JIMENG_POLL_SECONDS`：即梦任务轮询默认等待秒数。
- `LOCAL_IMAGE_IMPORT_MAX_BYTES`：本地图片导入大小限制。

## 后端接口概览

主要接口集中在 `main.py`：

- `/`：返回前端入口页。
- `/ws/stats`：WebSocket，广播在线统计、画布更新、素材库更新、新生成图片等消息。
- `/api/app-info`：应用路径、版本、环境等信息。
- `/api/config`、`/api/models`、`/api/providers`：AI 平台配置和模型列表。
- `/api/providers/test-connection`、`/api/providers/fetch-models`：平台连通性测试和模型拉取。
- `/api/online-image`、`/api/canvas-image-tasks`、`/api/canvas-video`、`/api/canvas-llm`：画布生成任务。
- `/api/generate`、`/generate`、`/api/ms/generate`：兼容旧页面或特定生成流程的入口。
- `/api/upload`、`/api/ai/upload`、`/api/ai/import-local-image`：上传和导入媒体。
- `/api/workflows`、`/api/workflows/{name}/run`：ComfyUI 工作流管理和运行。
- `/api/comfyui/instances`：ComfyUI 后端实例配置。
- `/api/runninghub/*`：RunningHub 应用、工作流、任务查询和资产上传。
- `/api/jimeng/*`：即梦 CLI 状态、登录、积分、查询和辅助能力。
- `/api/canvases/*`：画布创建、读取、保存、删除、恢复。
- `/api/asset-library/*`、`/api/prompt-libraries/*`：素材库和提示词库管理。
- `/api/update-*`、`/api/installer-update-info`：GitHub 更新和安装包更新相关接口。

## 开发注意事项

- `main.py` 很大，改动前先用 `rg` 定位相关路由、模型类和辅助函数，避免在不相关区域重构。
- 前端多数页面使用原生脚本和全局函数，新增 UI 时要同时检查对应 HTML、CSS、JS 和 i18n 字典。
- 页面引用静态资源时通常带版本参数，例如 `?v=2026.06.04.2`；如果修改静态文件导致缓存问题，要同步考虑版本更新逻辑。
- API Key 等敏感信息通过 `API/.env` 或运行时数据目录保存，页面不会回显完整密钥。不要把真实密钥写入仓库。
- 内置工作流位于项目 `workflows/`，用户上传或自定义工作流位于运行时数据目录下的 `workflows/`。内置工作流不应被删除。
- 打包脚本会迁移旧运行时数据，并清理 `dist` 内不应保留的运行时目录。修改打包逻辑时要保留路径安全检查。
- `build/`、`dist/`、日志、运行时输出、用户数据通常是生成物，不应作为功能改动的核心来源。
- README 和部分历史配置文件可能存在编码显示异常；以源码逻辑和当前可运行行为为准。
