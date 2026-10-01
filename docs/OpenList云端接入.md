# 五位成员的云端连接试验

已准备网站的独立成员登录、目录读取、原文件地址解析与音视频预览。独立试验后台已部署至 [素材库后台](https://xczstudio-openlist-trial.eliya-activation-cloud.workers.dev)，修改源码保存在 [独立后台仓库](https://github.com/xiaolubbstudio/OpenList-Worker)。当前网站仍连接 pCloud，没有迁移素材；后台尚未挂载移动云盘，不能宣称目录、预览、下载或上传已通过真实素材验收。

## 与插件服务隔离

2026-10-01 读取 Cloudflare 实际配置：插件有三个 Worker，`eliya-activation` 负责授权校验，`eliya-admin` 是管理后台，两者使用插件自己的 D1；`eliya-downloads` 仅绑定下载静态资源。素材库使用第四个 Worker `xczstudio-openlist-trial`，独立 D1 `7580e77d-5f66-4719-b9ba-953b526fe331`，独立随机 `JWT_SECRET` 和 `ADMIN_PASS`，没有绑定任何插件 Worker、数据库或下载资源。本次部署未修改三个插件 Worker。

素材库配置明确绑定独立数据库 ID。独立后台仓库的 `npm run deploy` 先运行 `scripts/studio-check-isolation.mjs`：核对 Worker 名称、账号、数据库名称和 ID，并拒绝附带其他服务、KV、R2 或 Durable Object 绑定。插件的部署流程保持不变。

Worker、数据库和权限独立，但同一个 Cloudflare 账号下的免费额度仍共享；不能把资源隔离理解成额度隔离。后台网址里的 `eliya-activation-cloud.workers.dev` 是账号公共子域，前面的 `xczstudio-openlist-trial` 才是该 Worker 的名称。

五个普通试验账号为 `member01` 至 `member05`，限制到 `/素材`，暂不授予写权限；管理员账号为 `admin`。初始密码只在本机 Windows 用户可解密的 `.cloud-backend/private/credentials.dpapi` 中保存，不放进网站、Git 或聊天。管理员在本机双击 `.cloud-backend/studio-login.cmd`，将初始管理员密码复制到剪贴板，再进入 [后台登录页](https://xczstudio-openlist-trial.eliya-activation-cloud.workers.dev/@login)，用户名填 `admin`。启动窗口会保持打开，方便查看成功提示或错误。旧的 `.cloud-backend/复制后台登录密码.ps1` 入口仍兼容，可通过 `-Account member01` 等参数选择成员。改密后本机初始备份不会自动更新。不要上传这个私有目录。

### 登录排错

本机 PowerShell 脚本已改为 UTF-8 BOM，避免 Windows 自带 PowerShell 把中文误读成语法错误；`-CheckOnly` 可以检查账号解密，不读取或修改剪贴板。运行失败不会打印密码或令牌。

若初次访问首页出现 `failed get storage: storage not found; please add a storage first`，先进入上面的登录页。本次实际检查后台健康返回 200、管理员登录成功，而挂载数量为 0；该报错来自还没有添加任何云盘，并不代表管理员密码错误。添加并验证素材目录后才能检查真实素材的预览和下载。

线上 API 已实测五个成员同时登录并各自取得正确身份；退出其中一个后，其令牌失效，其他四个继续有效。已修复上游仅用进程内缓存／KV 撤销令牌的限制，改为素材库 D1 持久化并在验证时读取，从而支持跨实例退出。匿名用户和普通成员均不能访问管理接口。后台健康检查正确识别 D1 并返回 200。后台认证、退出及健康检查的 20 项测试通过。这些结果不替代五个实际成员在各自网络进行素材预览、下载和上传验收。

## 目前的阻断

2026-10-01 检查 [OpenList-Worker 移动云盘驱动源码](https://github.com/OpenListTeam/OpenList-Worker/blob/main/src/backend/drivers/139/driver.ts)：`put()` 只有日志，没有实际写入，也没有分片上传会话。不能依据返回成功就宣布文件已经上传。因此网站试接选项暂时关闭上传，包括小文件。

移动云盘分享链接不是上传授权；已测分享接口不允许来自 GitHub Pages 的跨域目录请求。需要用户控制的后台连接，不能把账号 Cookie 放到网页或仓库。普通 Go 版 OpenList 与 Worker 的驱动实现不同，不能用普通版文档替代 Worker 的实测。

继续部署只为了验证登录、列目录、预览与下载，不表示已经解决移动云盘上传。大文件上传实现并验收之前，不切换生产连接。Cloudflare 路由的国内访问速度同样必须实测，不保证它能解决此前的跨境速度问题。

## Cloudflare 免费后台的准备

用户已有 Cloudflare 账号。先使用 Workers Free，不升级付费，不启用 R2 或其他按量计费存储来保存原素材。Workers 只负责权限与目录接口；10 GB 原素材仍需要云盘自身提供容量。免费额度及请求限制以 [Cloudflare 官方限制](https://developers.cloudflare.com/workers/platform/limits/) 为准。

1. 打开 [官方 Cloudflare 部署入口](https://deploy.workers.cloudflare.com/?url=https://github.com/OpenListTeam/OpenList-Worker)，登录自己的 Cloudflare 和 GitHub。若提示无法获取仓库，先 Fork 官方仓库再连接。不要覆盖素材网站仓库。
2. 当前试验已创建素材库专用免费 D1，绑定名 `DB`，设置 `DB_DRIVER=d1`、`DB_FORMAT=sql`。使用独立后台仓库的固定配置，不复用插件数据库，也不使用重启即丢失的内存数据库存放成员账号。
3. 配置 Secret 类型的随机 `JWT_SECRET`；设置 `DB_CIPHER=aes-256-gcm`，以启用云盘凭据加密，核实后台没有“缺少密钥，明文保存”的告警。密钥只在自己后台填写，不发送到聊天或网站配置。
4. 设置 `ALLOW_URLS=https://xiaolubbstudio.github.io`。这是当前路由源码实际读取的跨域白名单变量；不要仅依赖 README 中不同名称的示例。网站有 `/xczstudio/` 路径，但 Origin 不带路径。
5. 核实 Worker URL 可公开访问、HTTPS 正常且有数据库绑定。官方当前 wrangler 示例关闭了 `workers_dev`，没有自定义域名时需要在部署配置中启用它；不能把无法访问的 URL 填给网站。
6. 当前管理员与五个普通成员账号已初始化，各自一个随机密码。公开初始化入口已关闭，不开放自行注册。管理员账号仅用于管理。成员的基本目录都限制到 `/素材`；写入实现并通过验收后，再分别授予上传、重命名、删除权限。访客不授予写入权限，不给成员管理员角色。
7. 云盘登录仅在用户控制的后台中进行。当前只有分享链接，还没有真实挂载及原文件预览、下载验收；不要将个人云盘的完整登录权限提交到网页或 GitHub。优先用专门的素材账号与目录。
8. 网站连接设置选择“OpenList 云端试接”，后台网址填 HTTPS 根网址，素材目录填 `/`（相对于成员在后台获准访问的目录）。保存设置仅影响本机；验证后再导出发布，由开发端同步仓库。只需要提供公开后台网址和素材目录，不需要账号密码。

## 实际验收

- 五个真实成员在五个独立浏览器上下文同时登录，各自读取目录；退出其中一个，其他四个继续使用。
- 错误密码、访客、停用成员不能获得写权限；直接调用后台写接口也必须被拒绝。按钮状态不是安全边界。
- 手机、工作室实际网络都能读取目录和直接下载源文件，文件大小及哈希与云盘原件一致，不是分享 HTML 或 ZIP。
- 长图显示完整；可解码的 MP4、音频可播放。MOV/特殊编码不能保证浏览器播放，但应保留源文件下载。
- 后续打通上传时，先测试小文件，再测试 300–400 MB、取消与中断重试。完成必须以强制刷新后的目录和原文件大小／哈希为准，不接受仅 HTTP 200 的结果。分片大小应适配托管平台请求体限制。

以上验收未完成前，不能声称五人云端素材库已经可用或承诺长期免费。
