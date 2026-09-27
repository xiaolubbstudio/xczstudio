# 项目约定

## 项目与发布

- 实际项目目录是 `E:\XHY\code\小橙子资源库`。不要修改 D 盘同名旧副本。
- 网站仓库：`https://github.com/xiaolubbstudio/xczstudio`。
- 用户明确要求：每次修改网站，完成适当验证后提交并同步到这个仓库，随后确认线上部署结果。当前会话已授权这些同步，不需要每次再次询问。
- 同步前先获取远端最新状态，保留其他人的修改；不强制推送、不覆盖远端历史。
- 网络、登录或仓库权限导致无法同步时，保留本地修改并明确报告未同步，不声称已经上线。
- 仓库仅用于网站代码和必要静态资源。素材原文件保存到 pCloud。
- 不提交原始技能包、技能副本、预览截图、开发运行时或测试上传音效副本。

## 实现与验证

- 原生 HTML/CSS/JavaScript 静态网站，使用相对路径以兼容 GitHub Pages 项目子路径。
- 使用 pCloud 的公开文件夹分享链接自动读取素材目录，用请求文件链接上传。不在代码中保存账号密码或账户 token。
- 修改连接或上传逻辑后运行 `node --test scripts/pcloud-client.test.cjs`；启动预览后可运行只读检查 `node scripts/smoke-test.cjs`。
- 对页面行为或布局的修改，在浏览器验证对应操作。上传成功必须以 API 结果和更新后的目录为依据。

## 同步范围

网站文件：`index.html`、`styles.css`、`app.js`、`pcloud-client.js`、`.nojekyll`、`data/catalog.js`，以及 `assets` 中网站需要的 SVG 与演示音效。开发说明和检查脚本可纳入仓库；skills 与原始技能包不纳入。
