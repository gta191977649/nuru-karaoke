# Auto Gain DSP 算法与维护说明

本文档描述 Nuru Karaoke 当前的 MIDI 自动音量调整（Auto Gain）实现，包括 MIDI 播放前的初始增益估算、播放中的实时 RMS 归一化、动态平滑、峰值保护、启停行为和调试指标。

对应实现：

- `frontend/src/engine/midiGainEstimator.js`
- `frontend/src/engine/autoGainController.js`
- `frontend/src/engine/SynthEngine.js`
- `frontend/src/engine/AutoGainDspMonitor.jsx`
- `frontend/src/state/settingsStore.js`
- `frontend/src/state/karaokeStore.js`

## 1. 设计目标

不同 MIDI 文件的 Velocity、CC7（Channel Volume）、CC11（Expression）、编曲复音数和 SoundFont 响度可能相差很大。固定主音量会造成部分歌曲明显偏小，单纯依靠播放后的实时检测又会产生以下问题：

1. 歌曲开头从 `0 dB` 缓慢升到较高增益（最高 `+20 dB`），听感类似渐强。
2. 如果提高实时增益的上升速度，段落间容易出现 pumping（音量抽吸）。
3. 只分析 MIDI 事件不能完全预测 SoundFont 实际输出，只分析实时音频又无法预知歌曲开头。

当前实现使用两阶段混合策略：

1. **播放前 MIDI 估算**：扫描整首 MIDI，计算时间加权的 MIDI 能量，得到初始 Gain。
2. **播放中实时校正**：分析 SpessaSynth 的实际 PCM 输出，以 RMS 为依据持续微调 Gain。

初始估算刻意略偏高。估算过高时系统可用较快的下降时间和 Limiter 迅速压回；估算过低时则需要缓慢提升，会产生用户最容易察觉的渐强问题。

## 2. 总体信号链

```text
SpessaSynth output
        |
        +-----------------------> AnalyserNode（只测量，不输出）
        |
        +---> Dry Gain -------------------------------+
        |                                             |
        +---> Auto Gain ---> Compressor ---> -1 dB ---> Wet Gain ---> Output
                                                      |
                         Dry/Wet 30 ms crossfade <-----+
```

开启 Auto Gain 时：

- `dryGain = 0`
- `wetGain = 1`
- 输出经过自动增益、压缩器和 `-1 dB` 固定衰减。

关闭 Auto Gain 时：

- `dryGain = 1`
- `wetGain = 0`
- 输出绕过 Auto Gain DSP。

开关切换使用 `30 ms` 线性交叉淡化，避免直接切换音频路径产生 click/pop。

## 3. 阶段一：MIDI 初始增益估算

### 3.1 分析的 MIDI 事件

加载 MIDI 后，`BasicMIDI.fromArrayBuffer()` 先将文件解析为事件列表。估算器只收集以下 Channel Voice Message：

- Note On：`0x90` 且 Velocity 大于 0
- Note Off：`0x80`
- Velocity 为 0 的 Note On：按 Note Off 处理
- Control Change：`0xB0`

当前使用的 Control Change：

- CC7：Channel Volume
- CC11：Expression
- CC120：All Sound Off
- CC121：Reset All Controllers；当前估算器将 Expression 恢复为默认值
- CC123：All Notes Off

事件先按绝对 MIDI tick 排序。相同 tick 内的优先级为：

1. CC7、CC11、CC121
2. Note Off
3. Note On
4. 其他 CC

这样同一 tick 的音量控制可以作用于随后开始的新音符，同时 Note Off 会先于同音高的新 Note On 执行。

### 3.2 单音符能量

对于 Velocity 为 \(v\) 的 Note On，先归一化为：

$$
a_v = \frac{\operatorname{clamp}(v, 1, 127)}{127}
$$

估算器以不相关信号能量相加为近似，因此保存的是功率：

$$
q_v = a_v^2
$$

每个通道会跟踪当前处于 active 状态的所有音符。同一通道的活动音符功率为：

$$
Q_c(t) = \sum_{n \in A_c(t)} q_{v_n}
$$

其中 \(A_c(t)\) 是时间 \(t\) 时通道 \(c\) 的活动音符集合。

实现使用 `Map<noteNumber, power[]>`，因此同一通道、同一音高重复叠加的 Note On 也能分别配对 Note Off。

### 3.3 CC7 与 CC11

每个通道的线性控制增益为：

$$
C_c(t) = \frac{V_c(t)}{127} \cdot \frac{E_c(t)}{127}
$$

其中：

- \(V_c\)：CC7 Channel Volume，默认值为 100
- \(E_c\)：CC11 Expression，默认值为 127

该通道对总功率的贡献为：

$$
P_c(t) = Q_c(t) \cdot C_c(t)^2
$$

所有 16 个 MIDI 通道的组合功率为：

$$
P_{MIDI}(t) = \sum_{c=0}^{15} P_c(t)
$$

这一步同时纳入：

- Velocity
- CC7
- CC11
- 同时发声音符数，即复音能量
- CC7/CC11 在歌曲中的动态变化

### 3.4 时间加权平均

对于相邻事件间隔 \(\Delta T_i\)，使用 MIDI tick 作为时间权重：

$$
\bar{P}_{MIDI} =
\frac{\sum_i P_{MIDI,i} \Delta T_i}
     {\sum_i \Delta T_i},
\quad P_{MIDI,i} > 0
$$

分母只累计存在活动音符的区间。完全静音的前奏、尾奏和段落间停顿不会把歌曲平均值人为拉低，也就不会因为长时间无声而错误地给出过高增益。

MIDI RMS 代理值为：

$$
R_{MIDI} = \sqrt{\bar{P}_{MIDI}}
$$

极端情况下，如果 MIDI 所有音符都没有可积分的持续时间，则退化为 Note On 功率的算术平均。正常 MIDI 通常不会进入此分支。

### 3.5 从 MIDI 能量映射到预测音频 dB

MIDI 事件本身没有真实音频响度。当前 SC-55 SoundFont 使用经验校准常量：

$$
L_{ref} = -36\ \mathrm{dB}
$$

将 MIDI RMS 映射为预测输入电平：

$$
L_{MIDI} = L_{ref} + 20\log_{10}(R_{MIDI})
$$

实时控制器的目标输入电平为：

$$
L_{target} = -18\ \mathrm{dB}
$$

因此播放前的初始增益为：

$$
G_0 = \operatorname{clamp}
\left(
L_{target} - L_{MIDI},
-6,
+20
\right)\ \mathrm{dB}
$$

`renderedReferenceDb = -36 dB` 是当前 SoundFont 的经验校准值。数值设得更负，会产生更高的初始 Gain；数值设得不够负，会重新出现歌曲开头缓慢变大的现象。

### 3.6 估算失败行为

以下情况估算返回 `null`：

- 没有有效 MIDI 事件
- 没有有效 Note On
- 计算得到的平均功率无效或小于等于 0
- MIDI 解析失败

此时初始增益回退为 `0 dB`，播放中的实时控制器仍会继续工作。

## 4. 阶段二：实时 PCM Auto Gain

### 4.1 PCM 分析窗口

`AnalyserNode` 设置：

- `fftSize = 2048`
- `smoothingTimeConstant = 0`

每次读取 2048 个时域 Float32 PCM 样本。在 48 kHz 采样率下约对应 `42.7 ms`，在 44.1 kHz 下约对应 `46.4 ms`。

控制逻辑约每 `100 ms` 更新一次。调度由 `requestAnimationFrame()` 驱动，但只有距离上次更新达到 `updateIntervalSec = 0.1` 时才实际计算。

### 4.2 瞬时 RMS 功率与 dB

设分析窗口有 \(N=2048\) 个 PCM 样本 \(x[n]\)，窗口功率为：

$$
P_{inst} = \frac{1}{N}\sum_{n=0}^{N-1}x[n]^2
$$

RMS 为：

$$
RMS_{inst} = \sqrt{P_{inst}}
$$

实现直接从功率换算 dBFS：

$$
L_{inst} = 10\log_{10}(P_{inst})
$$

该公式等价于 \(20\log_{10}(RMS_{inst})\)。功率为 0 时使用 `-100 dB` 作为显示和内部哨兵值。

### 4.3 输入电平平滑

为避免单个鼓点或短促瞬态导致 Gain 剧烈变化，先在功率域做一阶指数平滑：

$$
\alpha_L = 1 - e^{-\Delta t / \tau_L}
$$

$$
\bar{P}_k = \bar{P}_{k-1} + \alpha_L(P_{inst,k} - \bar{P}_{k-1})
$$

当前时间常数：

$$
\tau_L = 1.5\ \mathrm{s}
$$

第一个有效分析帧直接令 \(\bar{P}=P_{inst}\)，不从 0 缓慢建立。

平滑后的输入电平为：

$$
L_{in} = 10\log_{10}(\bar{P})
$$

Debug 页面中的 `Input` 显示的就是 \(L_{in}\)，测量位置在 Auto Gain 之前。

### 4.4 Silence Gate

当前瞬时电平满足以下条件时：

$$
L_{inst} \le -50\ \mathrm{dB}
$$

控制器认为当前是静音或接近静音，不计算新的目标 Gain，并保持当前 Gain 不变。

注意：Gate 判断使用瞬时电平 \(L_{inst}\)，不是平滑电平 \(L_{in}\)。这样可以防止静音期间因测得接近负无穷而不断把 Gain 推到上限。

### 4.5 目标增益

非静音时，目标 Gain 为：

$$
G^* = \operatorname{clamp}
\left(
-18 - L_{in},
-6,
+20
\right)\ \mathrm{dB}
$$

含义：

- 输入为 `-30 dB` 时，目标为 `+12 dB`
- 输入为 `-38 dB` 时，目标为 `+20 dB`
- 输入为 `-18 dB` 时，目标为 `0 dB`
- 输入为 `-12 dB` 时，目标为 `-6 dB`
- 输入低于目标很多时，最大只提升 `+20 dB`
- 输入高于目标很多时，最大只衰减 `-6 dB`

### 4.6 非对称 Gain 平滑

Gain 在 dB 域做一阶指数平滑：

$$
\alpha_G = 1 - e^{-\Delta t / \tau_G}
$$

$$
G_k = G_{k-1} + \alpha_G(G^*_k - G_{k-1})
$$

时间常数根据方向选择：

$$
\tau_G =
\begin{cases}
0.2\ \mathrm{s}, & G^* < G \quad \text{降低音量} \\
4.0\ \mathrm{s}, & G^* \ge G \quad \text{提高音量}
\end{cases}
$$

这是一个非对称控制器：

- **Cut 快**：遇到比预估更响的段落时快速降低 Gain，减少过载。
- **Boost 慢**：遇到短暂安静段落时不会立刻把 Gain 拉高，减少 pumping。

MIDI 预估解决了“开头 Boost 太慢”的问题，因此无需牺牲播放中的稳定性。

最终将 dB Gain 转为 Web Audio 线性 Gain：

$$
A_G = 10^{G/20}
$$

并写入 `autoGain.gain`。

## 5. Compressor 与输出保护

Auto Gain 后串联 `DynamicsCompressorNode`，参数如下：

| 参数 | 当前值 |
| --- | ---: |
| Threshold | `-3 dB` |
| Knee | `0 dB` |
| Ratio | `20:1` |
| Attack | `3 ms` |
| Release | `250 ms` |

Compressor 后再施加固定 `-1 dB` 线性增益：

$$
A_{ceiling} = 10^{-1/20}
$$

Debug 页的 `Limiter` 数值来自 `DynamicsCompressorNode.reduction`，通常为 0 或负数；负值越大，说明压缩器正在施加越强的增益衰减。

重要限制：Web Audio `DynamicsCompressorNode` 加固定 `-1 dB` 衰减并不等于严格的 brick-wall true-peak limiter。当前设计是轻量峰值保护。如需广播级 true-peak 保证，应改为带 look-ahead 和过采样的 AudioWorklet limiter。

## 6. 生命周期与状态行为

### 6.1 引擎初始化

1. 创建 SpessaSynth `WorkletSynthesizer`。
2. 创建 `AutoGainController`。
3. 连接 `synth -> AutoGainController -> AudioContext.destination`。
4. 根据持久化设置开启或关闭 Auto Gain。
5. 没有 MIDI 时初始 Gain 为 `0 dB`。

### 6.2 加载新 MIDI

加载顺序非常重要：

1. Panic，停止遗留音符。
2. 暂时将初始 Gain 重置为 `0 dB`，避免沿用上一首歌曲的估算。
3. 使用 `BasicMIDI` 解析 MIDI 副本。
4. 扫描整首 MIDI 并计算 \(G_0\)。
5. 立即将 \(G_0\) 写入 Auto Gain 节点。
6. 再把 MIDI 交给 Sequencer 并触发播放。

因此初始 Gain 在首个音符发声前已经生效。

### 6.3 Stop 与重新播放

执行 Stop 时，控制器调用 `reset()`：

- 清除实时平滑功率
- 将当前 Gain 恢复为本首 MIDI 的 \(G_0\)
- 将显示输入恢复为 `-100 dB`

从头重新播放同一首歌曲时不会再次从实时控制器的旧 Gain 开始。

### 6.4 关闭 Auto Gain

关闭时：

- 取消实时分析循环
- 通过 30 ms crossfade 切换到 Dry 路径
- Auto Gain 节点平滑回到线性 1.0
- Debug 指标显示 Gain `0 dB`、Input `—`
- 已计算的 MIDI 初始增益仍保留在控制器中

再次开启时会恢复本首 MIDI 的初始增益并重新开始实时分析。

### 6.5 设置持久化

开关存储在 Zustand persist store：

- Local Storage key：`nuru-karaoke-settings`
- 字段：`autoGainEnabled`
- 默认值：`true`

普通设置页面与 `/synth` Debug 页面共用同一个状态，不是两个独立开关。

## 7. Debug 指标与 DSP 图

`AutoGainController` 每 `500 ms` 上报一次：

| 指标 | Store 字段 | 含义 |
| --- | --- | --- |
| Input | `autoGainInputDb` | Auto Gain 前的平滑 RMS dBFS |
| Gain | `autoGainDb` | 当前自动增益，单位 dB |
| Limiter | `autoGainReductionDb` | Compressor 当前增益衰减，单位 dB |
| Enabled | `autoGainEnabled` | DSP 是否启用 |

`/synth` 页面保存最近 90 个显示采样，每 `500 ms` 一个点，因此 DSP 图覆盖约 45 秒。图表只用于可视化，不参与控制计算。

图表刻度：

- Input：`-60 … 0 dB`
- Gain：`-6 … +20 dB`
- Limiter：`-18 … 0 dB`

## 8. 参数总表

### 8.1 实时控制参数

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `targetDb` | `-18 dB` | 实时 RMS 目标电平 |
| `silenceGateDb` | `-50 dB` | 低于该瞬时电平时冻结 Gain |
| `minGainDb` | `-6 dB` | 最大自动衰减 |
| `maxGainDb` | `+20 dB` | 最大自动提升 |
| `levelTimeConstantSec` | `1.5 s` | 输入功率平滑时间常数 |
| `boostTimeConstantSec` | `4.0 s` | Gain 上升时间常数 |
| `cutTimeConstantSec` | `0.2 s` | Gain 下降时间常数 |
| `updateIntervalSec` | `0.1 s` | 控制计算间隔 |
| `metricsIntervalSec` | `0.5 s` | UI 指标上报间隔 |

### 8.2 MIDI 估算参数

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `defaultChannelVolume` | `100` | 没有 CC7 时的默认值 |
| `defaultExpression` | `127` | 没有 CC11 时的默认值 |
| `renderedReferenceDb` | `-36 dB` | MIDI RMS 到 SC-55 输出电平的校准基准 |
| `targetDb` | `-18 dB` | 初始增益估算目标 |
| `minGainDb` | `-6 dB` | 初始估算下限 |
| `maxGainDb` | `+20 dB` | 初始估算上限 |

## 9. 调参指南

### 9.1 歌曲开头普遍太小，但播放几秒后正常

优先将 `renderedReferenceDb` 调得更负，例如从 `-36` 调为 `-38`。这只影响 MIDI 初始估算，不改变实时稳态目标。

也可以缩短 `boostTimeConstantSec`，但更容易引入 pumping，不建议作为第一选择。

### 9.2 歌曲开头普遍太响，Limiter 经常强烈工作

优先将 `renderedReferenceDb` 调得不那么负，例如从 `-36` 调为 `-34`。如果实时阶段也持续过响，再降低 `targetDb`。

### 9.3 整体稳态音量仍然偏小

提高 `targetDb`，例如从 `-18` 调到 `-16`；必要时提高 `maxGainDb`。提高最大 Gain 前应确认 Compressor 与最终输出没有持续过载。

### 9.4 音量上下抽动

可以：

- 增大 `levelTimeConstantSec`
- 增大 `boostTimeConstantSec`
- 适当降低 `silenceGateDb` 的绝对阈值敏感度

不要首先减小 `cutTimeConstantSec`，因为更快的 Cut 会让瞬态造成更明显的下压。

### 9.5 突然的大声段落压不住

可以：

- 减小 `cutTimeConstantSec`
- 降低 Compressor threshold
- 降低初始估算偏置
- 实现真正的 look-ahead limiter

## 10. 当前算法的已知限制

1. **不是 LUFS**：当前是无频率加权 RMS，没有 K-weighting、门限积分或 integrated loudness。
2. **MIDI 估算不等于实际音频**：不同乐器采样、SoundFont zone attenuation、滤波器、包络和效果器会改变实际响度。
3. **未对不同 Program 建立响度模型**：钢琴、弦乐、鼓等在相同 Velocity 下并不等响。
4. **未完整模拟 Sustain Pedal**：MIDI 初始估算按 Note Off 结束音符能量，未延长 CC64 sustain 下的实际发声时间。
5. **未解析全部 SysEx 音量语义**：设备专用 Master Volume、Part Level 等 SysEx 可能造成预测误差。
6. **Limiter 不是 true-peak brick-wall limiter**：可能存在 sample peak 或 inter-sample peak 超出预期。
7. **调度依赖 `requestAnimationFrame()`**：浏览器后台标签页可能降低实时控制更新频率，虽然 SpessaSynth AudioWorklet 本身仍可继续发声。
8. **静音时平滑功率仍会衰减**：Gate 会冻结 Gain，但平滑输入功率仍向 0 下降；恢复发声后的前几个控制周期可能暂时以较低平滑值计算。

## 11. 维护时的推荐验证

修改 DSP 或估算公式后，至少执行：

```powershell
cd frontend
npm test -- --run
npm run build
```

重点测试文件：

- `frontend/src/engine/midiGainEstimator.test.js`
- `frontend/src/engine/autoGainController.test.js`

手工验证建议：

1. 打开 `/synth`。
2. 保持「自動音量調整」为 ON。
3. 加载一个已知偏小的 MIDI。
4. 确认播放开始前或开始后第一个 UI 指标周期，Gain 已接近合理值，而不是从 0 缓慢上升。
5. 观察 Input、Gain、Limiter 三条曲线至少 30 秒。
6. 确认强段落出现时 Gain 能快速下降，Limiter 不长期维持大幅衰减。
7. Stop 后重新 Play，确认 Gain 恢复为该 MIDI 的初始估算值。
8. 切换 Auto Gain OFF/ON，确认没有 click/pop，且 ON 后恢复初始估算。

## 12. 算法伪代码

### 12.1 MIDI 初始估算

```text
events = collect Note On / Note Off / CC events
sort events by tick and same-tick priority

for each interval between events:
    channelGain[c] = CC7[c] / 127 * CC11[c] / 127
    channelNotePower[c] = sum((activeVelocity / 127)^2)
    combinedPower = sum(channelNotePower[c] * channelGain[c]^2)

    if combinedPower > 0:
        weightedPower += combinedPower * deltaTicks
        activeTicks += deltaTicks

    apply current event to active notes or CC state

midiRms = sqrt(weightedPower / activeTicks)
estimatedInputDb = -36 + 20 * log10(midiRms)
initialGainDb = clamp(-18 - estimatedInputDb, -6, +20)
```

### 12.2 实时 Auto Gain

```text
every approximately 100 ms:
    power = mean(pcmSample^2 over 2048 samples)
    instantDb = 10 * log10(power)

    smoothedPower += alphaLevel * (power - smoothedPower)
    inputDb = 10 * log10(smoothedPower)

    if instantDb > -50 dB:
        targetGainDb = clamp(-18 - inputDb, -6, +20)

        if targetGainDb < currentGainDb:
            tau = 0.2 s
        else:
            tau = 4.0 s

        currentGainDb += (1 - exp(-dt / tau))
                         * (targetGainDb - currentGainDb)

        linearGain = 10^(currentGainDb / 20)

    output = compressor(input * linearGain) * 10^(-1 / 20)
```

---

文档对应当前实现版本。修改 `AUTO_GAIN_DEFAULTS`、`MIDI_GAIN_ESTIMATOR_DEFAULTS`、音频节点顺序或状态生命周期时，应同步更新本文档。
