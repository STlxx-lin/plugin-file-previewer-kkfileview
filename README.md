# @nocobase/plugin-file-previewer-kkfileview

集成了 kkFileView 与 BaseMetas FileView 服务，支持 Office、PDF、压缩包等多种文件格式的在线预览。

## 特性
- 支持多种预览引擎：kkFileView, BaseMetas, Microsoft Online, fileViewer（本地离线）。
- 兼容 NocoBase v2 最新版。
- 支持文件预览水印。
- 支持预览界面打印。
- 支持双版本打包：轻量版（CDN 加载）与完整版（内置离线资源），一键生成。

## 安装
```bash
yarn nocobase pm add @nocobase/plugin-file-previewer-kkfileview
yarn nocobase pm enable @nocobase/plugin-file-previewer-kkfileview
```

## 双版本打包与部署说明

为了兼顾“极致的包体积”与“内网离线部署需求”，本插件支持一键生成**双版本**发布包：
- **轻量版** (如 `plugin-file-previewer-kkfileview-0.5.6.tgz`，约 80KB)：默认不内置静态资源，运行时通过公共 CDN（unpkg）加载预览资源。
- **完整版** (如 `plugin-file-previewer-kkfileview-0.5.6-full.tgz`，约 60MB)：内置所有本地预览所需的静态资源，运行时默认加载本地静态路径，适合完全物理隔绝的内网/离线环境。

### 1. 一键双版本打包指令
在插件根目录下运行以下命令，即可在项目根目录的 `storage/tar/@nocobase/` 下同时输出轻量版与完整版的 `.tgz` 压缩包：
```bash
yarn pack-all
```

### 2. 离线/内网环境下完整版部署
- **部署方式**：直接在内网 NocoBase 实例中安装并启用 **完整版 (`*-full.tgz`)** 的插件包。
- **零配置**：启动后，插件客户端会自动检测并加载随包附带的本地静态资源，无需手动提取和配置静态文件服务器。

### 3. 离线/内网环境下轻量版部署（手动自托管模式）
如果您安装的是**轻量版**，但仍需在内网环境使用 `fileViewer` 服务：
1. **下载静态资源包**：
   - 访问 `https://registry.npmjs.org/@file-viewer/web-full/-/web-full-2.2.2.tgz` 下载并解压，获取其 `dist` 目录。
2. **部署至静态资源服务器**：
   - 将 `dist` 目录下的所有文件上传至您的内网 Nginx、静态资源服务器，或者 NocoBase 本地静态文件存储路径下（例如部署于 `http://your-internal-ip:port/file-viewer/`）。
3. **后台配置自定义地址**：
   - 登录 NocoBase 后台，进入 **FileView 文件预览配置** 页面。
   - 将 **File Viewer 资源基础路径** 配置为上述部署的静态资源服务根路径（确保以 `/` 结尾）。
