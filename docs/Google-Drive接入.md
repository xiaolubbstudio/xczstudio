# Google Drive 首次接入

网站地址：https://xiaolubbstudio.github.io/xczstudio/ 。网站仍是 GitHub Pages 静态页面，原文件直接存 Google Drive。公开浏览不要求账号，上传账号必须拥有素材文件夹编辑权限。以下是一次性配置，不是每次上传都要做。

## 1. 创建并共享素材文件夹

1. 在 https://drive.google.com/ 新建“雷霆素材库”文件夹。
2. 共享 → 常规访问 → 知道链接的任何人 → **查看者**。不要设为编辑者。
3. 把五位成员的 Google 邮箱分别添加为**编辑者**。
4. 复制文件夹分享链接。放入一张图片、一段 MP4 和一个较大的素材进行首次验收。

编辑者除上传外也能修改、移动、删除文件。免费个人账号共享文件夹里的文件仍归各上传者所有，各自占用各自的可用空间；不是统一的企业共享云盘。每个账号的 15 GB 与 Gmail、Google Photos 共用。

## 2. 创建 Google Cloud 项目

1. 打开 https://console.cloud.google.com/ ，新建项目“雷霆素材库”。本接入无需开通付费存储、绑定付款方式或试用付费 Cloud 服务。
2. 在“API 和服务 → 库”启用 **Google Drive API** 和 **Google Picker API**。
3. 在项目首页找到纯数字的 **Project number／项目编号**，复制它；不是项目名称或 Project ID。

## 3. 创建 API Key

1. “API 和服务 → 凭据 → 创建凭据 → API 密钥”。
2. 编辑密钥，应用限制选择“网站／HTTP 引用网址”，添加 `https://xiaolubbstudio.github.io/*`。
3. API 限制选择“限制密钥”，只勾选 **Google Drive API** 与 **Google Picker API**。
4. 保存，复制 `AIza…` 开头的 API Key。此密钥用于公开目录与官方选择器，会随网站公开；必须完成来源和 API 限制。

本地验收如需连接实际 Google 项目，另加 `http://localhost:4176/*` 来源。不要使用仅限制 `/xczstudio/` 路径的规则：跨域请求可能只发送来源域名，导致误拒绝。

## 4. 创建网页 OAuth Client ID

1. 在 **Google Auth Platform** 设置应用信息：名称“雷霆素材库”，填写支持和联系人邮箱。
2. Audience／受众选择 External／外部；先使用 Testing／测试模式，将五位成员的 Google 邮箱加入测试用户。
3. Data Access／数据访问加入 `https://www.googleapis.com/auth/drive.file`。无需 `drive`、`drive.readonly`、`drive.metadata` 等全部文件权限。
4. Clients／客户端 → 创建客户端 → **Web application／网页应用**。
5. Authorized JavaScript origins／已获授权的 JavaScript 来源添加 `https://xiaolubbstudio.github.io`，不能带 `/xczstudio/` 路径。
6. 保存并复制以 `.apps.googleusercontent.com` 结尾的 **Client ID**。本站使用官方弹窗 token 模式，不需要 `auth.html` 回调地址。

本地验收可另加 `http://localhost:4176` JavaScript 来源。Client Secret、密码、登录 token 一律不要填写或分享。

## 5. 填入网站并发布

在“连接设置”选择 Google Drive，填入四个公开配置：文件夹链接、API Key、OAuth Client ID、项目编号。

保存后先检查目录。网页保存仅是当前浏览器草稿；管理员需发布 `data/catalog.js` 才能使整个团队切换。可以把以上四个公开配置交给维护者填写、验证、提交并发布。

Google 配置尚未填写时，已发布的 pCloud 连接继续工作。网站不会把现有 pCloud 素材自动搬走；Google 验收通过后再复制素材并核对文件数量和大小。

## 6. 成员使用和验收

1. 登录 Google；首次点击“授权素材文件夹”，在 **Google 官方选择器**中选中“雷霆素材库”。登录和文件夹授权由 Google 处理。
2. 网站核实 `capabilities.canAddChildren`。只有 Drive 确认可以在目标文件夹添加文件，才可上传；前端隐藏按钮不是权限边界。
3. 选择文件上传；大文件使用 8 MiB 分段，每次上传完成以 Google 返回的文件 ID、目标文件夹和完整大小确认。目录刷新还需实际看到新文件。
4. 打开图片／视频卡片，验证嵌入预览。Drive 只预览支持的格式，视频可能需要处理时间；浏览器 cookie 和网络环境可能影响嵌入。可点击“在 Drive 预览”作为备用。
5. 点击“下载原文件”，核对文件名、格式和内容；不是 ZIP，也不会转码。但 Google 可能显示大文件安全确认或暂时下载限额页面，不能承诺所有文件都在一次点击后直接保存。
6. 用只拥有查看权限的另一账号确认无法上传；不要为了测试把公开访问改成编辑者。

上传前请确保五人实际能稳定访问 Google 服务。登录 token 只保存在当前标签页 sessionStorage，过期后重新登录；不会进入配置导出、仓库、URL 或日志。

## 官方文档

- 公开目录与 API Key：https://developers.google.com/workspace/drive/api/guides/search-files
- 原格式下载：https://developers.google.com/workspace/drive/api/guides/manage-downloads
- 上传与分段协议：https://developers.google.com/workspace/drive/api/guides/manage-uploads
- 最小授权范围：https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- 官方登录弹窗：https://developers.google.com/identity/oauth2/web/guides/use-token-model
- 免费空间及超额行为：https://support.google.com/drive/answer/9312312
