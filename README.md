# 正经素材库

网站：https://xiaolubbstudio.github.io/xczstudio/

GitHub Pages 托管静态页面；独立 OpenList Worker 管理成员登录与目录；原文件保存在中国移动云盘。

## 成员使用

点击右侧用户气泡，用管理员分配的素材库成员账号登录，无需 pCloud 账号。五个成员使用独立账号，访问同一个素材文件夹；不开放注册。管理员在 OpenList 的用户管理中修改用户名、密码和权限。

登录状态只保存于当前标签页，刷新可保留，最长八小时。记住账号只保存用户名；密码可由浏览器密码管理器保存。退出登录会撤销当前令牌。

- 浏览、搜索、按文件夹与类别筛选、排序、个人收藏。
- 图片正常预览；视频先显示缩略图，点击后加载原画质。预览存入本机缓存；缓存被清理或素材改变时需要重新加载。特殊编码仍可能无法在浏览器播放。
- 下载原文件，不转 ZIP。
- 站内多文件上传，8 MiB 分片直接发送到云盘，单文件上限 512 MiB。后台只校验身份、发放单个分片的临时地址和确认最终文件。上传完成后刷新目录，同名文件自动改名。

## 部署与维护

连接配置在 `data/catalog.js`，只含公开后台地址与相对素材目录。账号获准目录由后台决定，前端不能扩大权限。云盘凭据仅保存在后台加密配置中，密码、令牌及本地账号记录不得提交 Git。

日常上传无需重新发布；代码修改提交 main 后由 GitHub Pages 自动部署。实际项目位于 E 盘；`.cloud-backend`、技能、预览截图及运行时不在网站仓库中。

后台限五个启用的普通成员；管理员不占成员名额。资源库 Worker 和 D1 独立于插件验证服务，Cloudflare 账号级免费额度仍共享。

原 pCloud 素材没有自动搬迁。当前页面只显示挂载的移动云盘目录；需要将原件上传到该目录才会出现。

详细配置和验收记录见 [云端接入](docs/OpenList云端接入.md)。pCloud 与 Google Drive 的底层代码作为兼容实现保留，当前网站连接与登录均使用 OpenList。

## 本地验证

`node --test scripts/pcloud-client.test.cjs scripts/pcloud-auth.test.cjs scripts/google-drive.test.cjs scripts/openlist.test.cjs`

`$env:PORT=4182; node scripts/serve.cjs`

`$env:PREVIEW_URL='http://127.0.0.1:4182'; node scripts/smoke-test.cjs`

本地预览服务器不接收上传；真实上传由云端授权并直传云盘。浏览器来源由后台 ALLOW_URLS 白名单决定，默认仅允许已发布网站。
