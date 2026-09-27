# 小橙子资源库

静态素材网站。


## 已实现

- 素材搜索、类型筛选、名称与日期排序。
- pCloud 文件夹及其子文件夹自动读取，文件分类、大小和日期自动生成。
- 图片及视频缩略图、素材详情。网站可通过 pCloud 官方 ZIP 接口下载单个素材，解压后即为原文件。音视频完整播放仍打开 pCloud 官方文件夹。
- 直接在网站选择多个文件，顺序上传到 pCloud，显示进度，支持停止；上传完成后自动刷新目录。
- 当前浏览器的个人收藏。
- 一次性连接设置、导出 catalog.js / JSON、导入 JSON 备份。日常上传不再需要登记或重新发布。
- 适配桌面和手机，支持键盘与减少动画偏好。


## 发布到 GitHub Pages

将 index.html、auth.html、styles.css、app.js、pcloud-client.js、pcloud-auth.js、auth-callback.js、assets/、data/ 和 .nojekyll 上传到公开仓库。在仓库 Settings → Pages 中选择 Deploy from a branch，选择 main 和 /(root)，保存。代码全部使用相对路径，支持项目子路径。

不需要安装依赖、构建或收费 runner。仓库为 https://github.com/xiaolubbstudio/xczstudio ，网站已发布到 https://xiaolubbstudio.github.io/xczstudio/ 。Pages 使用 main 分支根目录，后续推送会自动部署。原始技能包、skills 和预览截图不会同步到仓库。

用户已要求后续每次修改网站都同步到该仓库。执行约定记录在 AGENTS.md，发布和更新步骤见 docs/发布与同步.md。

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
