# 小橙子资源库

五人工作室的静态素材网站。连接 pCloud 文件夹后，网站自动读取目录，并直接上传文件；文件、名称、类型和大小无需手动登记。无第三方运行依赖、无账号密钥、无收费后端。

## 打开网站

登录功能需要 HTTPS 网站或 localhost，不能通过 file:// 使用。可在项目目录运行 `powershell -File scripts/start-preview.ps1`，访问 http://127.0.0.1:4173；关闭终端即可停止预览。预览脚本使用已有 Node.js，支持媒体分段请求，并且只提供网站文件。

当前项目位置：`E:\XHY\code\小橙子资源库`。本会话最初工作目录指向 D 盘；网站已复制到这里，后续以 E 盘目录为准。

## 已实现

- 素材搜索、类型筛选、名称与日期排序。
- pCloud 文件夹及其子文件夹自动读取，文件分类、大小和日期自动生成。
- 图片及视频缩略图、素材详情。真实原文件预览和下载打开 pCloud 官方文件夹；该平台限制第三方网站调用音视频播放和下载直链接口。
- 直接在网站选择多个文件，顺序上传到 pCloud，显示进度，支持停止；上传完成后自动刷新目录。
- 当前浏览器的个人收藏。
- 一次性连接设置、导出 catalog.js / JSON、导入 JSON 备份。日常上传不再需要登记或重新发布。
- 适配桌面和手机，支持键盘与减少动画偏好。

## 接入 pCloud

1. 管理员在 pCloud 建立素材文件夹，保留只读分享链接。停用旧的请求文件链接，并关闭分享链接的上传选项。
2. 在 pCloud 开发者页面申请应用，Folder access 选择 All folders，Write access 选择 yes。回调地址为 https://xiaolubbstudio.github.io/xczstudio/auth.html；审批通过后，只把公开 Client ID 填入网站配置。授权范围涵盖账号文件，网站仅操作工作室素材文件夹。
3. 在 pCloud 对素材文件夹使用 Invite to folder，邀请指定成员，并授予可上传权限。成员需接受邀请；所有账号须与素材库同属美国区。网站配置分享链接、Client ID 和地区后发布。
4. 成员点击“登录 pCloud”，在官方页面登录并授权，再在网站选择文件上传。pCloud 服务端校验成员自己的共享权限；未受邀或只读成员不能上传。无需分享每个文件，也无需登记或导出目录。
5. 下载和音视频播放：打开素材详情，点击“在 pCloud 预览 / 下载”，在官方文件夹选择同名文件。

当前已连接真实文件夹。Client ID 未配置时，网站会暂停上传，不会退回匿名入口。旧的公开上传链接需要在 pCloud 停用，代码中移除链接不能使它失效，旧代码历史也可能留有链接。原文件仍保存到 pCloud。

原来的四份演示仍附在项目中，仅在未连接文件夹时显示。真实目录不会和演示素材混在一起。

## 发布到 GitHub Pages

将 index.html、auth.html、styles.css、app.js、pcloud-client.js、pcloud-auth.js、auth-callback.js、assets/、data/ 和 .nojekyll 上传到公开仓库。在仓库 Settings → Pages 中选择 Deploy from a branch，选择 main 和 /(root)，保存。代码全部使用相对路径，支持项目子路径。

不需要安装依赖、构建或收费 runner。仓库为 https://github.com/xiaolubbstudio/xczstudio ，网站已发布到 https://xiaolubbstudio.github.io/xczstudio/ 。Pages 使用 main 分支根目录，后续推送会自动部署。原始技能包、skills 和预览截图不会同步到仓库。

用户已要求后续每次修改网站都同步到该仓库。执行约定记录在 AGENTS.md，发布和更新步骤见 docs/发布与同步.md。

## 费用边界

pCloud Basic 免费空间最多 10GB，需要完成解锁任务；共享链接每月 50GB 流量。超额会限制免费访问者，不默认按超额流量扣费。网站不购买付费服务、不嵌入主账号 token，也没有隐藏的自动升级逻辑。使用免费 github.io 地址即可，不必购买域名。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| index.html | 页面结构 |
| styles.css | 视觉与响应式样式 |
| app.js | 搜索、预览、收藏、登记、设置与目录导入导出 |
| pcloud-client.js | 公开目录读取、缩略图、成员权限检查和上传 |
| pcloud-auth.js / auth.html / auth-callback.js | 官方登录、state 校验和当前标签页会话 |
| data/catalog.js | 文件夹分享链接、地区和公开 Client ID |
| assets/ | 网站标识、封面、小预览和演示素材 |
| skills/README.md | 保留技能与来源清单 |
| docs/ | 选型方案与使用背景 |

收藏、本地设置草稿和目录备份不包含原文件。本机设置草稿会优先显示；更新网站连接后可先备份，再在管理面板恢复已发布设置。导入和恢复需要页面内确认。文件目录每次打开页面、手动刷新或完成上传时从 pCloud 更新；不会持续轮询。上传文件的命名与文件夹名用于搜索，暂不提供云端自定义标签编辑。

测试：`node --test scripts/pcloud-client.test.cjs scripts/pcloud-auth.test.cjs` 检查登录、权限、链接解析和上传；启动预览后执行 `node scripts/smoke-test.cjs`，只读检查真实目录和本地服务，不上传文件。

实际验收范围见 docs/最小版验收.md。
