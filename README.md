# synced-skills

专门同步其他仓库的 Agent Skills，供 CC Switch 统一安装和更新。
这里保存上游副本，同步工具不修改 skill 的原文。

## 已同步的 skill

| Skill | 官方来源 | 跟踪版本 |
| --- | --- | --- |
| `gt` | [Gitea CLI / skills/gt](https://gitea.com/gitea/cli/src/branch/main/skills/gt) | `main` |

`gt` 程序需要另外安装；macOS 可运行 `brew install gitea-cli`。
同步 `main` 会取得最新 skill，需要与旧版 CLI 严格匹配时，可把来源的 `ref` 固定到合适的 tag 或 commit。

## 在 CC Switch 中使用

1. 打开「Skills → 仓库管理 → 添加仓库」。
2. 仓库填 `ylwpaopao/synced-skills`，分支填 `main`。
3. 在「发现」中安装 `gt`，选择需要启用的 Agent。
4. 以后在「已安装」中使用「检查更新 → 更新」。

跨设备继续使用 CC Switch 自带的云同步。
CC Switch 更新技能时会覆盖本地副本，需要修改内容时请向上游提交修改。

## 同步方式

- 每周一北京时间 **10:23** 检查上游，GitHub 的实际执行时间可能延迟。
- 可在 [Actions](https://github.com/ylwpaopao/synced-skills/actions/workflows/sync-skills.yml) 点击 **Run workflow** 立即检查；工作流始终同步 `main`。
- 修改来源或同步工具后，也会触发检查。
- `sources.lock.json` 记录上游提交与检查周（该周周一的 UTC 日期）；同周重复检查不会仅因时间变化而提交。
- 即使上游没有变化，每周也会记录检查结果，避免公开仓库连续 60 天无活动导致定时任务停用。
- 所有来源成功下载并验证后，才替换现有副本；同步会移除上游已删除的 skill 文件。

## 新增来源

在 `sources.json` 数组中追加一项：

```json
{
  "id": "another-skill",
  "repository": "https://example.org/owner/repository.git",
  "ref": "main",
  "path": "skills/another-skill",
  "license": "LICENSE"
}
```

- `id`：唯一的本地目录名，只使用小写字母、数字、连字符或下划线。
- `repository`：可公开读取的 HTTP(S) Git 仓库；不需要局限于 GitHub。
- `ref`：分支、tag 或 commit。
- `path`：含有 `SKILL.md` 的目录；在仓库根目录时填 `.`。
- `license`：适用于该 skill 的上游许可证文件，相对于上游仓库根目录。

整份 skill 复制到 `skills/<id>/`，许可证复制到其中的 `LICENSE`。
不跟随符号链接，不运行上游代码。来源条目删除后，原有目录及来源记录会保留；彻底移除时同时删除对应的 `skills/<id>/`，下次同步会清除其来源记录。

本地运行（需要 Git 和 Bun 1.4.4）：

```sh
bun test
bun run sync
```

## 许可证与来源

每个 skill 沿用其上游许可证，见各自目录中的 `LICENSE`。
同步时的上游 commit 记录在 `sources.lock.json`，可据此核对原始内容。
本仓库的同步工具采用 [MIT License](LICENSE)。
