# dsh-message-rail

会话右侧的**消息导航条**（ChatGPT 式），为 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 桌面端提供快速跳转。

- 右侧一列竖条，每条对应一条你发送的消息
- 悬停：当前条变长变亮，上下相邻条波纹起伏，左上方浮出消息开头文字
- 点击：平滑滚动跳转到对应消息并闪烁定位
- 条数装不下时：鼠标贴近导航条上/下边缘自动滚动，也可直接用滚轮

## 安装

1. 把本仓库放到固定位置，例如 `~/.dsh/profiles/desktop/message-rail`
2. 在 `~/.dsh/profiles/desktop/package.json` 中：
   - `dependencies` 增加 `"dsh-message-rail": "link:<绝对路径，用正斜杠>"`
   - `dsh.profile.bundles` 增加 `"dsh-message-rail"`
3. 在 `~/.dsh/profiles/desktop` 下执行 `pnpm install`
4. 重启 dsh 桌面端

详细图文步骤见 [安装说明.txt](安装说明.txt)。

## 可调参数

打开 `lib/client.js` 顶部的「参数」区：

| 参数 | 含义 |
|---|---|
| `W_DEFAULT / W_ADJ2 / W_ADJ1 / W_ACTIVE` | 四态宽度（默认/临2/临1/被选） |
| `BAR_H` / `GAP` | 条高 / 条间距 |
| `MAX_RAIL_H` | 导航条最大高度占视口比例 |
| `EDGE_ZONE` / `EDGE_SPEED` | 边缘自动滚动触发区 / 速度 |
| `AUTO_LOAD_ALL` | 是否自动补全历史消息 |

## 结构

- `lib/index.js` — host 半（纯浏览器插件，无宿主行为）
- `lib/client.js` — client 半（导航条实现）
- `cordis.patch.yml` — bundle patch，注入 client 插件

## License

MIT
