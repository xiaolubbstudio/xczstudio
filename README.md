# 小橙子资源库

静态素材网站，首页以素材目录为主。


## 云端试接

已准备 OpenList 后台连接和独立成员登录。五个隔离会话的接口契约测试通过，但尚无真实云端后台验收；中国移动云盘 Worker 驱动没有实现上传，因此此选项暂不接收文件。详见 [云端试接说明](docs/OpenList云端接入.md)。生产仍保持当前 pCloud 连接。

## 已实现

- 素材搜索、类型与文件夹筛选、名称／日期／大小排序、个人收藏。
- 缩略图与列表视图，卡片直接下载；详情预览保留完整图片比例。去掉欢迎横幅、统计卡片和装饰动画。
- pCloud 文件夹及其子文件夹自动读取，文件分类、大小和日期自动生成。
- 图片及视频缩略图、素材详情。网站可通过 pCloud 官方 ZIP 接口下载单个素材，解压后即为原文件。音视频完整播放仍打开 pCloud 官方文件夹。
- 直接在网站选择多个文件，顺序上传到 pCloud，显示进度，支持停止；上传完成后自动刷新目录。
- 当前浏览器的个人收藏。
- Google Drive 接入代码：公开文件夹自动读取（含分页与子目录）、原格式下载链接、官方查看器嵌入、Google Identity Services 登录、drive.file 范围与官方 Picker 文件夹授权、编辑权限检查、8 MiB 分段上传及取消。
- Google Drive 真实连接仍需文件夹链接、限制来源的 API Key、网页 OAuth Client ID 和项目编号。首次配置步骤见 [Google Drive 接入](docs/Google-Drive接入.md)。没有填写 Google 配置前，已发布的 pCloud 目录继续工作；不会自动迁移原文件。Google 登录、嵌入预览和真实上传需管理员配置后实测。
- 一次性连接设置、导出 catalog.js / JSON、导入 JSON 备份。日常上传不再需要登记或重新发布。
- 适配桌面和手机，支持键盘与减少动画偏好。


## 发布到 GitHub Pages

将 index.html、auth.html、styles.css、motion.css、motion.js、app.js、pcloud-client.js、pcloud-auth.js、auth-callback.js、google-drive-client.js、google-drive-auth.js、assets/、data/ 和 .nojekyll 上传到公开仓库。在仓库 Settings → Pages 中选择 Deploy from a branch，选择 main 和 /(root)，保存。代码全部使用相对路径，支持项目子路径。

不需要安装依赖、构建或收费 runner。仓库为 https://github.com/xiaolubbstudio/xczstudio ，网站已发布到 https://xiaolubbstudio.github.io/xczstudio/ 。Pages 使用 main 分支根目录，后续推送会自动部署。原始技能包、skills 和预览截图不会同步到仓库。

用户已要求后续每次修改网站都同步到该仓库。执行约定记录在 AGENTS.md，发布和更新步骤见 docs/发布与同步.md。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| index.html | 页面结构 |
| styles.css | 视觉与响应式样式 |
| app.js | 搜索、筛选、预览、收藏、上传、下载及连接设置 |
| pcloud-client.js | 公开目录读取、缩略图、成员权限检查和上传 |
| pcloud-auth.js / auth.html / auth-callback.js | 官方登录、state 校验和当前标签页会话 |
| google-drive-client.js / google-drive-auth.js | Google 公开目录、原格式下载、最小权限登录和分段上传 |
| data/catalog.js | 文件夹分享链接、地区和公开 Client ID |
| assets/ | 网站标识、封面、小预览和演示素材 |
| skills/README.md | 保留技能与来源清单 |
| docs/ | 选型方案与使用背景 |

收藏、本地连接草稿和目录备份不包含原文件或登录 token。与当前发布连接一致的本机草稿优先显示；发布连接更新后自动采用新配置，旧草稿保留在浏览器里。导入和恢复需要页面内确认。文件目录每次打开页面、手动刷新或完成上传时从所选云盘更新，不持续轮询。文件夹筛选按现有目录分组，收藏仅属于当前浏览器；未实现云端批量移动、改名和自定义标签。

测试：`node --test scripts/pcloud-client.test.cjs scripts/pcloud-auth.test.cjs scripts/google-drive.test.cjs` 检查登录、权限、链接解析和上传；启动预览后执行 `node scripts/smoke-test.cjs`，只读检查真实目录和本地服务，不上传文件。

实际验收范围见 docs/最小版验收.md。
