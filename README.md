# PassVault 密码管家

飞牛 fnOS 上的本地加密密码与备忘录管理器。数据保存在设备本地，使用 AES-256-GCM 加密，不联网、不上传。

## 功能

- **密码管理**：自定义平台，一个平台下可保存多个账号，每个账号可补充邮箱、密保、API Key 等自定义字段
- **加密备忘录**：与密码共用同一加密库，支持标题、正文、置顶，卡片预览、编辑自动保存，可搜索
- **本地加密**：整个密码库以 AES-256-GCM 加密后落盘，需主密码解锁
- **备份导出**：设置中可将数据导出为明文 JSON 备份

## 安装

从 [Releases](https://github.com/198748052/fn-pass/releases) 下载 `PassVault.fpk`，在飞牛 fnOS 应用中心手动上传安装。

安装后无需额外配置，服务监听 `9100` 端口，桌面图标入口为「密码管家」。

## 数据与安全

- 数据文件位于应用数据目录 `TRIM_PKGVAR/vault.json`，二进制与前端位于 `TRIM_APPDEST`
- 升级/覆盖安装会替换程序文件，`vault.json` 位于数据目录，不受影响
- 卸载应用会一并删除数据目录，请先导出备份
- 通过 SSH 或文件管理删除应用数据目录同样会丢失数据

## 目录结构

```
PassVault/           # fnOS 应用包根目录
  manifest           # 应用清单（版本、端口、入口等）
  app/server/        # 多架构后端二进制（amd64/arm64/armv7/386）
  app/www/           # 前端资源（由源码同步）
  app/ui/            # 桌面图标
  cmd/               # 安装、卸载、升级、配置生命周期脚本
  config/            # 权限与资源配置
passvault-src/       # 后端与前端源码
  main.go            # 服务入口
  server.go          # HTTP 路由与接口
  vault.go           # 密码库与备忘录数据结构
  store.go           # 加密存储与 App 状态
  web/               # 前端源码（index.html / app.js / styles.css）
build.sh             # 构建脚本
```

## 构建

依赖：

- Go 1.25 或更高版本
- [fnpack](https://static2.fnnas.com/fnpack/)

```bash
# 编译多架构二进制、同步前端并打包
./build.sh
```

产物为 `PassVault/PassVault.fpk`。

## 版本

当前版本 `1.2.2`。版本号维护在 `PassVault/manifest` 的 `version` 字段；发布新版本时同时更新 `passvault-src/web/index.html` 中静态资源的版本查询参数以刷新缓存。
