---
title: "踩坑分享：对接宝蓝得 BCS Redis，后台任务全部卡死不消费"
date: 2026-09-29T12:00:00+08:00
draft: false
tags: ["Redis", "踩坑", "SAQ", "BCS"]
categories: ["后端"]
description: "宝蓝得 BCS 的 Redis 兼容实现缺失 redis_version 字段，导致 SAQ 在 dequeue 时 KeyError。"
---

## 现象

线上 SAQ 队列积压，23 个 job 全部停在 `queued` 状态，worker 看着活着，但就是不干活，日志里也没有明显报错。

## 根因

BCS（宝蓝得）的 Redis 是兼容实现，**`INFO` 命令返回的内容里没有 `redis_version` 这个字段**。

而 SAQ 的 `RedisQueue.version()` 是这么写的：

```python
info = await self.redis.info()
self._version = tuple(int(i) for i in str(info["redis_version"]).split("."))
```

直接下标取值 → **KeyError**。

关键在于，这个 `version()` 是在 **dequeue 的时候才调用**的（用来判断走 `BLMOVE` 还是 `BRPOPLPUSH`），不是连接阶段。所以服务能正常启动、能正常入队，一到取任务就炸 —— 排查起来特别阴间，很容易误判成"worker 挂了"或者"队列有问题"。

## 修复

继承 `RedisQueue` 覆写 `version()`，不要写死，优先取真值、取不到再兜底：

```python
class BcsRedisQueue(RedisQueue):
    async def version(self):
        if self._version is None:
            info = await self.redis.info()
            self._version = tuple(
                int(p) for p in str(info.get("redis_version", "6.0.0")).split(".")[:3]
            )
        return self._version
```

> ⚠️ 兜底版本号要看 BCS 是否支持 `BLMOVE`（用 `COMMAND INFO BLMOVE` 查一下）：
> - 支持 → 兜底 `(6, 2, 0)`，走新分支
> - 不支持 → 兜底 `(6, 0, 0)`，走 `BRPOPLPUSH` 老分支

## 避坑提醒

1. **影响面不止 SAQ**：任何通过 `INFO` 做能力探测 / 版本判断的组件都可能中招（Celery 部分 backend、各类 SDK 自检逻辑）。后面谁再对接 BCS 的 Redis，建议先手动跑一次 `INFO` 看看字段齐不齐。
2. **排查这类问题别只盯 worker 死活**：job 卡 `queued` + worker 存活 = 大概率是消费链路里某一步抛异常被吞了，去翻 worker 的完整堆栈。
3. **积压任务别直接全量重放**：webhook 类任务积压久了，重放可能把对端打爆或触发幂等拒绝，先按时间戳筛一遍再决定。
4. **SAQ 的键结构和常见队列不一样**：

   | 键 | 类型 | 正确命令 |
   |---|---|---|
   | `saq:job:{queue}:{id}` | String（JSON） | `GET` |
   | `saq:{queue}:queued` | List | `LLEN` / `LRANGE` |
   | `saq:{queue}:active` | List | `LLEN` |
   | `saq:{queue}:incomplete` | ZSet | `ZCARD` |

   用 `HGETALL` / `ZCARD` 去查 job 会全部报 `WRONGTYPE`，别被误导。

## 附：排查用得上的命令

```bash
# 确认 INFO 里到底有没有 redis_version
INFO server

# 确认 BCS 支持哪个阻塞弹出命令（决定兜底版本号）
COMMAND INFO BLMOVE
COMMAND INFO BRPOPLPUSH

# 看队列积压量（注意是 List，不是 ZSet）
LLEN saq:webhook:queued
LRANGE saq:webhook:queued 0 -1
LLEN saq:webhook:active

# 看单个 job 内容（String/JSON）
GET saq:job:webhook:0b3d0c17-xxxx-xxxx

# 安全遍历所有 job（别用 KEYS，会阻塞单线程）
SCAN 0 MATCH saq:job:* COUNT 1000
```

## 一句话总结

国产兼容 Redis 未必 100% 遵循 Redis 协议细节，接入前先跑一遍 `INFO` / `COMMAND INFO` 做能力探测，别等到线上积压了才发现。

---

> 后续建议：如果公司里对接 BCS 的不止一个项目，可以把这段同步到公共 wiki，或者提给平台侧让 BCS 补上 `redis_version` 字段 —— 那才是根治，不然每个接入方都得踩一遍。
