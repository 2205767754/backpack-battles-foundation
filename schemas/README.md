# 数据格式 v1

`layout.schema.json` 是 JSON Schema 2020-12 结构约束，供编辑器/外部验证器使用。本项目零依赖，不自动执行通用 JSON Schema 引擎；`validateLayoutRecord` 执行版本、缺失语义、顺序、命名空间和几何检查，两者是互补验证，不宣称完全等价。

## 布局

见 `fixtures/synthetic-layout.json`。source.payload_sha256 是来源 payload 的哈希，不是规范化 JSON 的哈希；样例全零为明确的合成占位，不能作为真实下载完整性证据。

只有调用 `validateLayoutRecord(record, { expectedRounds: 18 })` 才强制 18 回合。来源不完整时应如实保留并报告，不伪造后续回合。

缺坐标：`coord_source=INVENTORY_ONLY_NO_COORDS, placements=null`。

已知空盘面：`coord_source=SOURCE_EXACT, placements=[]`。

## 购买事件（独立于布局）

`PurchaseJournal.confirmPurchase` 输入字段：

| 字段 | 含义 |
| --- | --- |
| game_id | 单次游戏运行身份，与状态一致 |
| event_id | 上游为已确认操作分配的唯一 ID |
| expected_revision | 此操作之前的本地状态版本 |
| confirmed | 必须 true，仅是调用方声明，不是可信来源认证 |
| offer_id | 当前货架格的唯一版本化身份，刷新后不能复用 |
| item_id | 来源命名空间物品 ID |
| instance_id | 这次购买产生的实例身份 |
| paid | 已核实的实际价格，必须匹配已同步的货架价格 |

`APPLIED` 后须重新推荐；`DUPLICATE` 不再推进；校验抛错则状态不变。构造新的 journal 会丢失幂等账本，因此当前示例只支持单进程内回放；持久化恢复、乱序缓冲和多来源融合尚未实现。

## 下载 manifest 适配

CLI 读取 `files["example-<id>.json"]={sha256,size}`；原始 payload 使用 `<sha256>.json` 相对 HTTPS base URL 获取。非空 locator 或其他布局不自动猜测，必须显式增加适配器。需要支持硬链接的文件系统才能无覆盖原子落盘；失败会报错而不降级覆盖。
