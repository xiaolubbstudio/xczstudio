# 项目约定

## 项目与发布

- 实际项目目录是 `E:\XHY\code\小橙子资源库`。不要修改 D 盘同名旧副本。
- 网站仓库：`https://github.com/xiaolubbstudio/xczstudio`。
- 用户明确要求：每次修改网站，完成适当验证后提交并同步到这个仓库，随后确认线上部署结果。当前会话已授权这些同步，不需要每次再次询问。
- 同步前先获取远端最新状态，保留其他人的修改；不强制推送、不覆盖远端历史。
- 网络、登录或仓库权限导致无法同步时，保留本地修改并明确报告未同步，不声称已经上线。
- 仓库仅用于网站代码和必要静态资源。用户已接受云端后台与五个独立网站成员账号，允许五人同时登录。素材原文件继续托管在云盘，Google Drive 与 pCloud 保留为兼容连接。新后台真实验收完成前不切换已发布连接、不宣称已迁移。
- 不提交原始技能包、技能副本、预览截图、开发运行时或测试上传音效副本。

## 实现与验证

- 原生 HTML/CSS/JavaScript 静态网站，使用相对路径以兼容 GitHub Pages 项目子路径。
- 使用公开文件夹分享链接读取素材目录；Google Drive／pCloud 上传使用成员自己的 OAuth 会话，由所选平台的文件夹权限校验。OpenList 使用五个独立账号，成员身份、目录权限及写入必须由用户控制的后台校验；访客不能上传，不设公开注册入口。不使用匿名上传入口。Google Drive 使用 drive.file 最小范围及官方 Picker 选择素材文件夹，不请求全部 Drive 文件权限。
- 只允许在当前标签页的 sessionStorage 保存成员登录会话。令牌不得写入 localStorage、配置导出、Git 文件、URL 参数或日志。网站成员令牌仅发送至所配置的用户控制后台；云盘凭据仅在该后台的加密配置中保存，不下发给前端，不发到聊天。Client ID 可以公开，Client Secret 不得用于静态网页。
- pCloud 的 All folders 应用授权范围较广，网站只调用配置的素材文件夹操作；不得添加浏览成员其他私人文件夹的功能。
- 必须在 pCloud 停用旧的请求文件链接并关闭分享链接上传选项，才能宣布匿名上传权限已彻底关闭。仅移除页面按钮或代码不是撤销权限。
- 修改连接或上传逻辑后运行 `node --test scripts/pcloud-client.test.cjs scripts/pcloud-auth.test.cjs scripts/google-drive.test.cjs scripts/openlist.test.cjs`；启动预览后可运行只读检查 `node scripts/smoke-test.cjs`。Google API Key 必须限制网站来源以及 Drive／Picker API；只发布 API Key、OAuth Client ID、项目编号和公开文件夹链接，不发布 Client Secret。
- 对页面行为或布局的修改，在浏览器验证对应操作。上传成功必须以 API 结果和更新后的目录为依据。

## 同步范围

网站文件：`index.html`、`auth.html`、`styles.css`、`app.js`、`pcloud-auth.js`、`auth-callback.js`、`pcloud-client.js`、`google-drive-client.js`、`google-drive-auth.js`、`motion.js`、`motion.css`、`.nojekyll`、`data/catalog.js`，以及 `assets` 中网站需要的图片与演示音效。开发说明和检查脚本可纳入仓库；skills 与原始技能包不纳入。

## 已确认的入口安全接入

用户已确认限定五个邮箱的 Cloudflare Access、同网址 `/studio/` 静态托管、每成员每分钟 300 次 API、连续失败五次锁十五分钟、素材库专用应急关闭入口。只针对 `xczstudio-openlist-trial`；禁止账号级 `all_workers` 保护或修改三个插件服务。具体进度见 `docs/入口安全保护.md`。截至 2026-10-02 尚缺五个邮箱，Access 与 GitHub 首页跳转尚未启用，不得宣称已实现 Worker 执行前的防刷。

同源静态网站已在后台 `/studio/` 打包。修改网站后还要在独立后台仓库执行 `npm run deploy`，其隔离检查和白名单打包脚本将更新同网址的静态文件；仍需推送网站与后台各自仓库。入口保护启用前，必须先适配并验收本地成员管理 CMD 的 Access 邮箱验证，不为该工具添加公开绕过路径。邮箱名单、Cloudflare OAuth 令牌、入口访问会话一律不写公开仓库。
