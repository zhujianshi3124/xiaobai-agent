// agent-model-follow 兼容 shim（批次 8 仓内化）。
// 真机 desktop / deskcheck profile 以本文件的 file:///<宿主盘符>/<仓根>/lib/agent-model-follow.js
// 绝对路径挂载（见项目档案第九节 6 现状实况）；仓内正身自批次 8 起在 lib/agent-model-follow/index.js
// （目录插件形态，五处同步面齐备）。本文件仅转发导出，旧挂载路径不断链；
// 宿主 link 改指向 isolated 的批次须同步清理 profile 的 file:// 挂载行（环境红线 7.3，另行呈批）。
export { apply, inject, name, follow, bind, LOG_PATH } from "./agent-model-follow/index.js";
