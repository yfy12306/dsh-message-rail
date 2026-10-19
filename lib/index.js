/**
 * DSH 插件：右侧消息导航条（host 侧为纯浏览器插件，无宿主行为）。
 * 浏览器侧实现在 ./client.js，通过 dsh.client 声明 + 客户端模块加载器装载。
 */
const name = "dsh-message-rail";
const inject = [];

function apply() {}

export { apply, inject, name };