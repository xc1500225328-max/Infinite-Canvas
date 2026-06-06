# ComfyUI 本地运行包实施计划

## 目标

为 Infinite Canvas 提供一个可选下载安装的 ComfyUI 本地运行包，使用户无需手动配置 Python、PyTorch、ComfyUI、自定义节点和模型，即可运行项目内置的本地工作流。

该方案不把 ComfyUI 打进主应用安装包，而是作为独立的大体积组件下载、解压和管理。主应用保持轻量，ComfyUI 运行包只服务于 Infinite Canvas 已适配的固定工作流。

## 产品定位

建议命名为：

```text
Infinite Canvas Local Runtime for ComfyUI
```

它不是通用 ComfyUI 管理器，也不承诺兼容所有第三方工作流。它的边界是：

- 支持项目内置并经过验证的 ComfyUI 工作流。
- 固定 ComfyUI 版本、Python 版本、PyTorch/CUDA 版本、自定义节点版本和模型清单。
- 以解压即用为目标。
- 允许用户已有外部 ComfyUI 继续通过实例配置接入。
- 不强制主应用依赖本地运行包。

## 推荐运行包结构

```text
InfiniteCanvasRuntime/
  runtime_manifest.json
  start_comfyui.bat
  stop_comfyui.bat
  README.txt
  python/
    python.exe
  ComfyUI/
    main.py
    custom_nodes/
    input/
    output/
    temp/
  models/
    checkpoints/
    diffusion_models/
    vae/
    clip/
    clip_vision/
    upscale_models/
    loras/
  workflows/
    Z-Image.json
    Flux2-Klein.json
    upscale.json
  logs/
```

模型目录可以根据 ComfyUI 的实际路径要求使用软链接、配置文件或启动参数映射。优先选择最少惊扰 ComfyUI 原生目录结构的方式。

## Manifest 设计

运行包根目录放置 `runtime_manifest.json`，主应用通过该文件判断运行包是否可用、是否兼容当前内置工作流。

示例：

```json
{
  "runtimeId": "infinite-canvas-comfyui-runtime",
  "runtimeVersion": "2026.06.01",
  "targetAppVersion": ">=2026.06.01",
  "platform": "windows-x64",
  "variant": "nvidia-cuda",
  "comfyuiCommit": "COMFYUI_COMMIT_HASH",
  "pythonVersion": "3.10.x",
  "torchVersion": "2.x.x+cuXXX",
  "defaultHost": "127.0.0.1",
  "defaultPort": 8188,
  "supportedWorkflows": [
    "Z-Image",
    "Flux2-Klein",
    "upscale"
  ],
  "requiredFiles": [
    "python/python.exe",
    "ComfyUI/main.py",
    "ComfyUI/custom_nodes",
    "models"
  ],
  "requiredModels": [
    {
      "name": "example-model.safetensors",
      "path": "models/checkpoints/example-model.safetensors",
      "sha256": "",
      "sizeBytes": 0,
      "workflows": ["Z-Image"]
    }
  ],
  "requiredCustomNodes": [
    {
      "name": "example-node",
      "path": "ComfyUI/custom_nodes/example-node",
      "version": "",
      "commit": ""
    }
  ]
}
```

第一版可以先不做完整哈希校验，但 manifest 字段应预留。后续需要支持修复安装、增量补丁或用户报错诊断时，哈希和版本信息会很有价值。

## 主应用需要新增的能力

### 1. 本地运行包检测

在后端增加检测逻辑：

- 读取配置中的运行包路径。
- 检查 `runtime_manifest.json` 是否存在。
- 校验 `python/python.exe`、`ComfyUI/main.py`、关键模型目录是否存在。
- 校验 manifest 中的 `supportedWorkflows` 是否覆盖当前内置工作流。
- 返回检测结果、缺失文件、运行包版本和建议操作。

建议接口：

```text
GET /api/comfyui/runtime/status
POST /api/comfyui/runtime/set-path
POST /api/comfyui/runtime/validate
```

### 2. 下载与解压管理

第一版可以采用“用户手动下载压缩包，应用选择目录”的方式，降低实现复杂度。

第二版再提供应用内下载：

- 获取运行包下载清单。
- 显示包体积、版本、适用平台。
- 下载到 `update_downloads/` 或运行时数据目录。
- 解压到用户指定目录。
- 解压完成后写入运行包路径配置。

建议接口：

```text
GET /api/comfyui/runtime/releases
POST /api/comfyui/runtime/download
GET /api/comfyui/runtime/download-status/{task_id}
POST /api/comfyui/runtime/extract
GET /api/comfyui/runtime/install-status/{task_id}
```

下载清单可以复用现有 GitHub 更新机制，也可以使用独立 manifest URL。

### 3. 启动、停止和健康检查

主应用负责启动运行包内的 ComfyUI 进程：

- 使用运行包内置 Python。
- 设置工作目录为 `ComfyUI/`。
- 指定 host、port、输出目录和模型目录。
- 将 stdout/stderr 写入运行时日志。
- 记录进程 PID。
- 页面关闭或桌面应用退出时可选择停止该进程。

建议接口：

```text
POST /api/comfyui/runtime/start
POST /api/comfyui/runtime/stop
GET /api/comfyui/runtime/process
GET /api/comfyui/runtime/logs
```

健康检查优先调用 ComfyUI 原生接口，例如：

```text
GET http://127.0.0.1:8188/system_stats
GET http://127.0.0.1:8188/object_info
```

### 4. 工作流依赖检查

在运行工作流前增加依赖检查：

- 当前工作流是否在 manifest 的 `supportedWorkflows` 中。
- 工作流需要的模型是否存在。
- 自定义节点是否存在。
- ComfyUI 是否已启动。
- ComfyUI API 是否可访问。

失败时返回明确原因，不直接让用户面对 ComfyUI 原始报错。

前端提示示例：

```text
当前本地运行包缺少 Flux2-Klein 工作流所需模型：xxx.safetensors。
请重新安装或修复 ComfyUI 本地运行包。
```

## 前端页面调整

优先在 `static/comfyui-settings.html` 增加“本地运行包”区域。

建议模块：

- 当前模式：外部 ComfyUI / 本地运行包。
- 运行包路径。
- 检测状态。
- 运行包版本。
- 支持工作流列表。
- 启动 / 停止 / 重启按钮。
- 测试连接按钮。
- 查看日志按钮。
- 选择本地目录按钮。
- 下载 / 安装 / 修复入口。

第一版可以只做：

- 选择运行包目录。
- 检测。
- 启动。
- 停止。
- 测试连接。
- 查看日志。

## 配置存储

建议在全局配置中增加：

```json
{
  "comfyuiLocalRuntime": {
    "enabled": false,
    "path": "",
    "host": "127.0.0.1",
    "port": 8188,
    "autoStart": false,
    "stopOnAppExit": true,
    "lastRuntimeVersion": ""
  }
}
```

桌面模式可默认建议安装到：

```text
%APPDATA%/InfiniteCanvas/ComfyUIRuntime
```

便携模式可默认建议安装到：

```text
<DATA_ROOT_DIR>/ComfyUIRuntime
```

源码开发模式可默认建议安装到：

```text
<项目根目录>/runtime/ComfyUIRuntime
```

`runtime/` 应加入 `.gitignore`，避免误提交大文件。

## 运行包制作流程

### 1. 冻结版本

确定以下版本：

- Windows x64
- Python 版本
- PyTorch/CUDA 版本
- ComfyUI commit
- custom nodes commit
- 内置工作流版本
- 模型文件版本

### 2. 本地组装

在干净目录中组装：

- 便携 Python。
- ComfyUI 源码。
- 必要依赖。
- 必要 custom nodes。
- 必要模型。
- 内置工作流。
- 启动脚本。
- manifest。

### 3. 自检

用运行包自检脚本完成：

- Python 可执行。
- ComfyUI 可启动。
- `/system_stats` 可访问。
- `/object_info` 可访问。
- 每个内置工作流至少跑一次最小样例。
- 输出文件可被 Infinite Canvas 读取。

### 4. 打包

使用 `.zip` 或 `.7z` 分发。

建议命名：

```text
InfiniteCanvas-ComfyUIRuntime-windows-x64-nvidia-cuda-2026.06.01.zip
```

### 5. 发布

可以作为 GitHub Release asset 发布，也可以放在独立下载源。

同时发布下载 manifest：

```json
{
  "runtimeVersion": "2026.06.01",
  "platform": "windows-x64",
  "variant": "nvidia-cuda",
  "fileName": "InfiniteCanvas-ComfyUIRuntime-windows-x64-nvidia-cuda-2026.06.01.zip",
  "downloadUrl": "",
  "sha256": "",
  "sizeBytes": 0,
  "releaseNotes": "适配 Z-Image、Flux2-Klein、upscale 工作流。"
}
```

## 分阶段实施

### 第一阶段：外部运行包接入

目标：用户手动下载并解压运行包，Infinite Canvas 负责识别、启动和连接。

任务：

- 增加运行包路径配置。
- 增加 manifest 读取和校验。
- 增加启动/停止 ComfyUI 进程能力。
- 增加日志查看。
- 在 ComfyUI 设置页显示运行包状态。
- 工作流运行前检查运行包状态。

验收标准：

- 用户选择一个已解压运行包后，应用能检测到版本和支持工作流。
- 点击启动后，ComfyUI 在本地端口启动。
- 测试连接成功。
- 内置工作流可以通过本地运行包执行。
- 停止按钮能终止由应用启动的 ComfyUI 进程。

### 第二阶段：应用内下载和安装

目标：用户可以在应用内下载并安装运行包。

任务：

- 增加运行包 release manifest。
- 增加下载任务和进度查询。
- 增加解压任务和进度查询。
- 增加安装失败清理和重试。
- 增加下载文件 sha256 校验。

验收标准：

- 页面能显示最新运行包版本和大小。
- 下载进度可见。
- 解压完成后自动写入运行包路径。
- 文件损坏时能提示重新下载。

### 第三阶段：修复和诊断

目标：降低用户遇到模型缺失、节点缺失、端口占用、启动失败时的排障成本。

任务：

- 增加缺失文件列表。
- 增加端口占用检测。
- 增加运行包日志摘要。
- 增加一键打开日志目录。
- 增加重新校验和修复提示。

验收标准：

- 常见失败原因能在设置页直接看到。
- 用户不需要查看命令行也能知道下一步操作。

### 第四阶段：可选 CPU 包或其他 GPU 变体

目标：在 NVIDIA CUDA 包稳定后，再考虑 CPU 或其他 GPU 后端。

任务：

- 扩展 release manifest 的 `variant`。
- 前端支持选择运行包变体。
- 后端按变体校验兼容性。

验收标准：

- 不同运行包可以被识别。
- 不兼容的运行包不会被误用。

## 风险与处理策略

### 包体积过大

处理策略：

- 不并入主安装包。
- 独立下载。
- 优先只发布 NVIDIA CUDA 包。
- 模型尽量只放内置工作流必需文件。

### CUDA 和显卡兼容问题

处理策略：

- 第一版明确只支持 Windows x64 + NVIDIA。
- 在下载页标明最低显卡和驱动要求。
- 保留外部 ComfyUI 接入能力。

### 杀毒软件拦截

处理策略：

- 避免复杂脚本。
- 启动脚本尽量简单。
- 主应用直接用 Python 可执行文件启动 ComfyUI。
- 发布说明中标明文件来源和校验值。

### 自定义节点维护成本

处理策略：

- 只打包内置工作流必需节点。
- 固定 commit。
- 不提供通用节点安装器。
- 不自动更新 custom nodes。

### 用户修改运行包导致不可用

处理策略：

- manifest 校验。
- 缺失文件检测。
- 提供重新安装或修复入口。
- 不尝试自动适配用户自行改动。

## 建议优先级

最高优先级：

- manifest 规范。
- 运行包路径配置。
- 后端检测、启动、停止、日志。
- 设置页状态展示。
- 工作流运行前依赖检查。

中等优先级：

- 应用内下载。
- 解压进度。
- sha256 校验。
- 修复安装。

低优先级：

- CPU 包。
- AMD/DirectML 包。
- 自动安装自定义节点。
- ComfyUI 通用管理能力。

## 初版最小可行方案

初版只做以下能力即可落地：

1. 用户手动下载运行包。
2. 用户在设置页选择运行包目录。
3. 应用读取 `runtime_manifest.json`。
4. 应用检测关键文件是否存在。
5. 应用启动运行包内的 ComfyUI。
6. 应用测试 `127.0.0.1:8188` 是否可访问。
7. 内置工作流调用该 ComfyUI 实例。
8. 应用显示日志和失败原因。

这样可以先验证整体体验，不需要一开始就实现大文件下载、断点续传和自动修复。

## 结论

将 ComfyUI 作为 Infinite Canvas 的可选本地运行包是可行的，并且比通用 ComfyUI 安装器更适合当前项目。

关键是保持边界清晰：该运行包只为已适配的内置工作流服务，版本冻结，模型和节点固定，主应用负责检测、启动、连接和诊断。这样既能显著降低普通用户的本地部署门槛，又不会把主应用变成复杂的 ComfyUI 生态维护工具。
