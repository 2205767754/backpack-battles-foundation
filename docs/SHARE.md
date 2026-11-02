# 背包乱斗基础工具：资料链接

仓库公开可读，无需获得私有仓库邀请。本页整理可供研究与交流的基础部分，非完整 AI 助手或大师级策略。

| 链接 | 可参考内容 |
| --- | --- |
| [项目首页与使用说明](https://github.com/2205767754/backpack-battles-foundation) | 项目范围、运行方式、模块说明和能力边界 |
| [稳定规范与数据语义](https://github.com/2205767754/backpack-battles-foundation/blob/main/docs/CONTRACTS.md) | 区分布局与交易记录、未知与空值、坐标命名空间、动作确认与重新决策 |
| [数据格式与合成样例](https://github.com/2205767754/backpack-battles-foundation/tree/main/schemas) | 布局 schema、购买确认事件字段；[样例](https://github.com/2205767754/backpack-battles-foundation/blob/main/fixtures/synthetic-layout.json) 是虚构数据 |
| [几何校验与星位命中](https://github.com/2205767754/backpack-battles-foundation/blob/main/src/geometry.mjs) | 原生占格转换、旋转、越界、同层重叠、包格覆盖、分通道几何命中 |
| [已确认交易对账](https://github.com/2205767754/backpack-battles-foundation/blob/main/src/journal.mjs) | 幂等去重、版本冲突、库存守恒、失败不推进、成功后重新决策；不含上游交易识别 |
| [下载和完整性校验](https://github.com/2205767754/backpack-battles-foundation/blob/main/src/integrity.mjs) | SHA256/大小校验、有限重试、文件复用和无覆盖原子落盘；[CLI](https://github.com/2205767754/backpack-battles-foundation/blob/main/scripts/download.mjs) |
| [回归测试](https://github.com/2205767754/backpack-battles-foundation/tree/main/test) 与 [CI记录](https://github.com/2205767754/backpack-battles-foundation/actions) | 35项合成样例测试，以及 Windows/Linux、Node 22/24 自动检查 |
| [验收边界](https://github.com/2205767754/backpack-battles-foundation/blob/main/docs/VALIDATION.md) 与 [数据来源](https://github.com/2205767754/backpack-battles-foundation/blob/main/docs/PROVENANCE.md) | 哪些已有验证，哪些仍缺效果模型、策略评测和实机验收 |

## 分享时请保留的说明

- 这是从本地 v6 项目经验整理、重新实现的独立基础库，不是现有 EXE 的完整公开源码。
- 不包含真实大师对局数据、私人攻略、游戏 EXE/PCK、密钥、内存桥或完整战斗模拟器。
- 几何命中不代表效果生效；对账一致不代表策略优秀；测试通过不代表实机全问题解决。
- 尚未指定开源许可证；欢迎阅读交流，需要复制、修改、集成或再分发时请先确认许可。
