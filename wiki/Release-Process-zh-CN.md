# 发布流程

[English](Release-Process)

这是**面向维护者**的发布流程. 最终用户按 wiki 中的
[入门指南](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Getting-Started-zh-CN)
安装已发布的包即可, 无需阅读本页.

## 包发布在哪里

| 仓库 | 包名 | 认证方式 | 面向 |
| --- | --- | --- | --- |
| **npmjs.com** (正式) | `hexo-blog-encrypt` | OIDC trusted publishing | 所有最终用户. README 中给出的就是这个安装方式. |
| **GitHub Packages** (镜像) | `@d0n9x1n/hexo-blog-encrypt` | `GITHUB_TOKEN` | 仅用于提高可发现性, 会显示在仓库的 "Packages" 侧栏. tarball 完全相同, 只是包名带 scope. |

两条发布流程都**带 provenance** (`npm publish --provenance`),
其证明可以说明 tarball 正是在打标签的那个提交上, 由本仓库构建的.

## 发布前检查清单 (打标签之前)

在功能分支上准备好以下改动, PR 检查通过后再合并.
没有需要更新的 CHANGELOG 文件: 推送标签时生成的 GitHub Release
就是发布历史. 确保本次发布包含的 PR 用 `Closes #N` 关联了 issue,
这样它们才会出现在 "Resolved issues" 下 (见
[发布说明](#发布说明)).

1. **`demo/package.json`**: 使用已发布的 semver 范围, 如 `^x.y.z`,
   不要用 `file:..`. 如果演示站点用到了新修复, 就提高最低版本.
   发布 workflow 会拒绝 `file:` 引用, 但不要求演示站点的版本精确匹配.
2. **`package.json` 的 `version`**: 应已在版本号提交中与标签一致;
   workflow 会再次校验.

推送前运行 `npm test`, `npm pack --dry-run --json > pack.json` 和
`node build/verify-pack.js pack.json`. 生成的 `pack.json` 和构建产物
不要提交 (`package-lock.json` 需要提交; CI 用 `npm ci` 安装). 只有在
`Tests` workflow 通过后才合并发布改动; 从这个确切的提交创建标签.

> **注意: deploy-demo 可能在发布前失败.** Pages 部署会对演示站点运行
> `npm install`, 而它现在需要 npmjs 上的 `hexo-blog-encrypt@^X.Y.Z`,
> 这个版本此时还不存在. 这是预期行为. 等发布 workflow 完成发布后,
> 重新触发 deploy-demo (见 "发布之后" 第 3 步).

## 打标签并推送

```sh
git tag -a vX.Y.Z -m "hexo-blog-encrypt vX.Y.Z

<one-paragraph release summary>

Migration notes / links."
git push origin vX.Y.Z
```

这一次标签推送会**并行触发两个 workflow**:

| Workflow | 发布内容 |
| --- | --- |
| `.github/workflows/release.yml` | 通过 OIDC + provenance 将 `hexo-blog-encrypt@X.Y.Z` 发布到 npmjs.com |
| `.github/workflows/publish-gh-packages.yml` | 通过 GITHUB_TOKEN + provenance 将 `@d0n9x1n/hexo-blog-encrypt@X.Y.Z` 发布到 npm.pkg.github.com |

两者在发布前执行相同的检查: 版本与标签一致, `npm test`
(lint + 带覆盖率的服务端测试 + e2e), 以及 `build/verify-pack.js`. 未通过正式校验的
版本不会进入镜像. 镜像使用自己的标签触发器, 而不是基于 `release.yml` 的
`workflow_run`, 因为在 `workflow_run` 下 provenance 记录的是 master 的 HEAD,
而不是打标签的提交.

查看运行情况:

```sh
gh run list --workflow=release.yml --limit 1
gh run list --workflow=publish-gh-packages.yml --limit 1
```

如果版本已存在, `publish-gh-packages.yml` 任务会跳过发布.
正式的 npm 发布步骤不会跳过: 如果 npm 发布成功但创建 GitHub Release 失败,
只重新运行失败的任务, 不要重跑已成功的发布任务.
每次重新运行都使用同一个打标签的提交; master 上更新的改动不会生效.

## 发布之后

1. **在 npm 上确认:**

   ```sh
   curl -s "https://registry.npmjs.org/hexo-blog-encrypt/latest" \
     | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'])"
   ```

2. **确认 GitHub Release.** npm 发布完成后, `release.yml` 会在
   `github-release` 任务中自动创建或更新 GitHub Release, 说明由
   `scripts/release-notes.sh` 生成 (见下面的
   [发布说明](#发布说明)). 不要再手动创建重复的 release.

   ```sh
   gh release view vX.Y.Z
   ```

3. **重新触发 deploy-demo**, 让线上站点拉取刚发布的 tarball 并刷新:

   ```sh
   gh workflow run deploy-demo.yml --ref master
   ```

4. **确认 GH Packages 镜像**:
   `https://github.com/D0n9X1n/hexo-blog-encrypt/pkgs/npm/hexo-blog-encrypt`
   显示了新版本. 确认仓库右侧的 "Packages" 侧栏列出了
   `@d0n9x1n/hexo-blog-encrypt`.

## 发布说明

`github-release` 任务运行 `bash scripts/release-notes.sh "$GITHUB_REF_NAME"`
(与 SonicTerm 的做法相同). GitHub Releases 就是项目的发布历史;
没有 CHANGELOG 文件. 生成的说明依次包含:

1. `# hexo-blog-encrypt vX.Y.Z`, `npm install hexo-blog-encrypt@X.Y.Z`
   这一行, 以及指向 npmjs.com 和 GitHub Packages 镜像
   (`@d0n9x1n/hexo-blog-encrypt`) 的链接.
2. `## Resolved issues`: 由 `scripts/release-issues.py` 收集, 列出在标签范围内
   被未回滚的提交或已合并的 PR 确认关闭的 issue. 手动关闭的 issue
   (GitHub 没有记录对应的关闭提交或 PR) 单独列在
   *Manually closed issues (unverified release linkage)* 下.
3. `## Changes since <previous tag>`: `git log --no-merges` 的提交标题及短 SHA,
   外加一个对比链接.
4. `## Verification`: lint, 100% 服务端覆盖率, Playwright e2e, 以及 npm
   provenance.

**要让 issue 出现在 "Resolved issues" 下, 必须用关闭关键字关联它:**
在 PR 描述或提交信息中写 `Closes #N` (或 `Fixes #N` / `Resolves #N`),
这样 GitHub 才会把该 PR 或提交记录为 issue 的关闭者. `Refs #N` 或 `#N`
之类的普通提及不算, milestone 归属也不算. 已回滚的提交和 PR 会被排除.

生成器是 fail-closed 的. 它需要完整历史 (`fetch-depth: 0`;
浅克隆会被拒绝), 以及带有 `issues: read` 和 `pull-requests: read` 权限的 token.
GitHub API 出错时任务直接失败, 不会发布不完整的说明; 重新运行失败的
`github-release` 任务即可, 它使用同一个打标签的提交. 对于第一个标签,
或需要指定上一个标签时, 设置 `RELEASE_FIRST=1` 或 `PREVIOUS_TAG=<ref>`.

在本地预览说明 (需要 `gh auth login`):

```sh
bash scripts/release-notes.sh vX.Y.Z
```

发布工具有离线测试, 在 `Tests` workflow 的 `release-tooling` 任务中运行:

```sh
python3 scripts/release-issues_tests.py
bash scripts/test-release-notes.sh
```

`scripts/` 不在 `package.json` 的 `files` 中, 所以这些都不会进入 npm
tarball.

## 补发 GH Packages 镜像

如果某个标签已存在, 但 `publish-gh-packages.yml` 没有为它运行过
(例如该 workflow 是后来才加入的), 可以手动触发:

```sh
gh workflow run publish-gh-packages.yml --ref master -f tag=vX.Y.Z
```

workflow 会检出指定的标签, 执行相同的 scope 改写, 然后发布.
如果该版本已存在, 则跳过.

## 认证设置 (一次性)

### npmjs.com: OIDC trusted publishing

每个包在 npmjs 上配置一次:

1. https://www.npmjs.com/package/hexo-blog-encrypt/access → **Trusted Publishers**
2. 添加一个 GitHub Actions trusted publisher:
   - **Organization or user:** `D0n9X1n`
   - **Repository:** `hexo-blog-encrypt`
   - **Workflow filename:** `release.yml`
   - **Environment:** *(留空)*

之后发布 workflow 会用短期有效的 OIDC token 换取发布权限,
不需要 `NPM_TOKEN` secret, 也无需轮换. 如果 `release.yml` 中重新引入
`secrets.NPM_TOKEN` 或 `NODE_AUTH_TOKEN`, 文档测试 (`tests/docs.test.js`)
会 fail closed.

### GitHub Packages

无需设置. workflow 使用自动提供的 `GITHUB_TOKEN`, 并在文件内声明了
`permissions: packages: write`.

## npm CLI 版本要求

OIDC trusted publishing **和** provenance 证明都要求
**npm CLI ≥ 11.5.1**. Node 20 自带 npm 10.x, 因此两个发布 workflow
都显式包含 `npm install -g npm@^11` 步骤. 如果去掉这一步,
`npm publish --provenance` 会因 `ENEEDAUTH` 失败
(npm 10 不支持 OIDC 流程, 于是退回去查找一个并不存在的 token).

## 为什么在 GitHub Packages 上使用带 scope 的包名?

GitHub Packages 的 npm 仓库要求包名带有仓库所有者的 scope.
不带 scope 的 `hexo-blog-encrypt` 无法直接发布到
`npm.pkg.github.com`. `publish-gh-packages.yml` workflow 会在 CI 中、
`npm publish` 之前修改 `package.json`:

```json
{
  "name": "@d0n9x1n/hexo-blog-encrypt",
  "publishConfig": { "registry": "https://npm.pkg.github.com", "access": "public" }
}
```

runner 是临时的, 所以这次改写永远不会进入 git. 想从 GH Packages
而不是 npmjs 安装的最终用户使用带 scope 的包名 (安装命令见入门指南).

## 故障排查

| 现象 | 可能原因 | 解决办法 |
| --- | --- | --- |
| release.yml 中 `npm publish` 报 `ENEEDAUTH` | npm CLI < 11.5.1 (`npm install -g npm@^11` 步骤缺失或失败), 或 npmjs.com 上的 trusted publisher 配置有误 | 确认升级步骤已运行; 仔细核对 trusted publisher 各字段完全一致 (workflow 文件名 `release.yml`, 不设 environment). |
| `github-release` 任务在 "Generate release notes" 失败 | GitHub API 出错或触发限流, 缺少 `issues: read` / `pull-requests: read`, 或是浅克隆 | npm 已经发布, 只需重新运行失败的 `github-release` 任务; 重新运行使用同一个打标签的提交, 不会带上 master 上更新的改动. |
| 某个 issue 没有出现在 "Resolved issues" 中 | 对应的 PR 或提交没有使用关闭关键字 (`Closes #N`), 或它是手动关闭的 | 以后的 PR 用 `Closes #N` 关联 issue; 手动关闭的 issue 只会出现在未验证的部分. |
| `release.yml` 在 "Verify demo references published package" 失败 | `demo/package.json` 仍是 `file:..` | 修正该文件后再为新版本打标签; 重新运行使用的是同一个打标签的提交. |
| `publish-gh-packages.yml` 报 `403 Forbidden` | runner 的 `GITHUB_TOKEN` 失去了 `packages: write` (例如被分支保护去掉) | 在 workflow / job 级别恢复 `permissions: packages: write`. |
| 发布后 GitHub Packages 页面返回 404 | 最终一致性; CDN 会在几秒内同步. | 稍等后刷新. 如果几分钟后仍是 404, 发布步骤可能什么都没做, 检查 workflow 日志中是否走了 "Skip if … already exists" 分支. |
| 标签指向了错误的提交 (漏了一个修复) | squash 合并丢掉了后来的提交; 标签在修复之前就创建了 | 不要移动已发布的标签, 也不要覆盖 npm 上的版本. 应用修正后发布一个新的补丁版本. 重试任何失败的发布前, 先检查两个仓库的状态. |

## 经验教训

- **先推送发布前改动并确认 CI 通过, 再创建标签.** 标签会触发真正的发布;
  一旦 `npm publish` 成功, 就不能重新发布该版本. 回滚只能发布新的补丁版本.
- **在流程进行中 squash 合并 PR 会让源分支上后来的提交成为孤儿.**
  如果在 squash 合并之后才把修复推到功能分支, 这个修复只存在于已废弃的分支上,
  永远不会进入 master. 务必在合并前推送修复, 或在合并后作为新提交应用到 master.
- **两个发布任务相互独立**, 一个失败不会中止另一个. 不要因为看到一个 ✓
  就认为 "都通过了", 要分别检查每个 workflow 的运行结果.

## 另请参阅

- [架构](Architecture-zh-CN): 代码库导览.
- [开发](Development-zh-CN): 工作流规则和命令.
- [`.github/workflows/release.yml`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/.github/workflows/release.yml): npmjs 发布 workflow.
- [`.github/workflows/publish-gh-packages.yml`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/.github/workflows/publish-gh-packages.yml): GH Packages 镜像 workflow.
- [GitHub Releases](https://github.com/D0n9X1n/hexo-blog-encrypt/releases): 发布历史.
- [`scripts/release-notes.sh`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/scripts/release-notes.sh): 发布说明生成器.
