import { MIDI_STANDARDS } from '../MidiStandardDetector.js'

function clamp7bit(value) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(127, Math.round(value)))
}

function buildCurveTables() {
    const tables = Array.from({ length: 8 }, () => new Uint8Array(128))
    for (let v = 0; v <= 127; v++) {
        const x = v / 127
        // 0: linear
        tables[0][v] = v
        // 1-2: softer (concave)
        tables[1][v] = Math.round(127 * Math.pow(x, 0.8))
        tables[2][v] = Math.round(127 * Math.pow(x, 0.6))
        // 3-4: harder (convex)
        tables[3][v] = Math.round(127 * Math.pow(x, 1.2))
        tables[4][v] = Math.round(127 * Math.pow(x, 1.6))
        // 5-6: S-curves
        const s1 = x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)
        const s2 = x < 0.5 ? 4 * x * x * x : 1 - 4 * (1 - x) * (1 - x) * (1 - x)
        tables[5][v] = Math.round(127 * s1)
        tables[6][v] = Math.round(127 * s2)
        // 7: invert
        tables[7][v] = 127 - v
    }
    return tables
}

const CURVE_TABLES = buildCurveTables()

function applyCurve(value, curve) {
    const idx = Math.max(0, Math.min(7, Number(curve) || 0))
    return CURVE_TABLES[idx][clamp7bit(value)]
}

function applyValueMap(value, map) {
    if (!map) return clamp7bit(value)
    const base = applyCurve(value, map.curve)
    const scaled = (base * (map.value1 ?? 100)) / 100 + (map.value2 ?? 0)
    return clamp7bit(scaled)
}

function parseNumber(token, base = 10) {
    if (!token) return null
    const t = token.trim()
    if (!t) return null
    if (base === 16) return Number.parseInt(t, 16)
    if (/^0x/i.test(t)) return Number.parseInt(t, 16)
    if (/[a-f]/i.test(t)) return Number.parseInt(t, 16)
    return Number.parseInt(t, 10)
}

function splitNameAndFields(line) {
    const comma = line.indexOf(',')
    if (comma === -1) return { name: line.trim(), fields: [] }
    const name = line.slice(0, comma).trim()
    const rest = line.slice(comma + 1)
    const fields = rest
        .split(',')
        .flatMap((chunk) => chunk.trim().split(/\s+/))
        .filter(Boolean)
    return { name, fields }
}

function parseSourceDest(line) {
    const { name, fields } = splitNameAndFields(line)
    const makerId = parseNumber(fields[0], 10)
    const deviceId = parseNumber(fields[1], 10)
    return {
        name: name.replace(/^\(/, '').trim(),
        makerId: Number.isFinite(makerId) ? makerId : null,
        deviceId: Number.isFinite(deviceId) ? deviceId : null,
    }
}

function parseValueLineDecimal(line) {
    const { name, fields } = splitNameAndFields(line)
    const values = fields
        .map((token) => parseNumber(token, 10))
        .filter((v) => v !== null && Number.isFinite(v))
    return { name, values }
}

function parseSysexLine(line) {
    const cleaned = line.replace(/^\(/, '').trim()
    const { name, fields } = splitNameAndFields(cleaned)
    const tokens = fields
        .map((token) => parseNumber(token, 16))
        .filter((v) => v !== null && Number.isFinite(v))
    return { name: name.trim(), tokens }
}

function buildIndex(entries) {
    const exact = new Map()
    const byLsbPc = new Map()
    const byMsbPc = new Map()

    for (const entry of entries) {
        const key = `${entry.srcMSB},${entry.srcLSB},${entry.srcProgram}`
        if (!exact.has(key)) exact.set(key, entry)
        const keyLsb = `${entry.srcLSB},${entry.srcProgram}`
        if (!byLsbPc.has(keyLsb)) byLsbPc.set(keyLsb, entry)
        const keyMsb = `${entry.srcMSB},${entry.srcProgram}`
        if (!byMsbPc.has(keyMsb)) byMsbPc.set(keyMsb, entry)
    }

    return { exact, byLsbPc, byMsbPc }
}

export function parseSmfKnifeConfig(text, options = {}) {
    const config = {
        name: options.name || null,
        title: null,
        source: null,
        destination: null,
        tempoChange: null,
        velocity: null,
        ccChanges: {},
        nrpnChanges: [],
        rpnChanges: [],
        adjust: [],
        drums: [],
        exclusive: [],
        excValue: {},
    }

    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
    let section = null
    let currentDrumKit = null
    let pendingExclusive = null

    for (const rawLine of lines) {
        const withoutComment = rawLine.split(';')[0]
        if (!withoutComment.trim()) continue

        const line = withoutComment.trim()
        if (!line) continue

        if (line.startsWith('[')) {
            section = line.replace(/\[|\]/g, '').trim().toUpperCase()
            currentDrumKit = null
            pendingExclusive = null
            continue
        }

        if (!section) continue

        if (section === 'SOURCE') {
            config.source = parseSourceDest(line)
            continue
        }
        if (section === 'DESTINATION') {
            config.destination = parseSourceDest(line)
            continue
        }
        if (section === 'TITLE') {
            const { fields } = splitNameAndFields(line)
            config.title = fields.join(' ').trim() || null
            continue
        }
        if (section === 'TEMPO CHANGE') {
            const { values } = parseValueLineDecimal(line)
            if (values.length >= 2) {
                config.tempoChange = { value1: values[0], value2: values[1] }
            }
            continue
        }
        if (section === 'VELOCITY') {
            const { values } = parseValueLineDecimal(line)
            if (values.length >= 2) {
                config.velocity = { value1: values[0], value2: values[1], curve: values[2] ?? 0 }
            }
            continue
        }
        if (section === 'CC CHANGE') {
            const { name, values } = parseValueLineDecimal(line)
            if (values.length >= 3) {
                let ccNumber = null
                const nameMatch = name.match(/CC#?\s*(\d+)/i)
                if (nameMatch) ccNumber = parseNumber(nameMatch[1], 10)
                if (!Number.isFinite(ccNumber)) ccNumber = values[0]
                const value1 = values[1]
                const value2 = values[2]
                const curve = values[3] ?? 0
                if (Number.isFinite(ccNumber)) {
                    config.ccChanges[ccNumber] = { value1, value2, curve }
                }
            }
            continue
        }
        if (section === 'NRPN CHANGE') {
            const { values } = parseValueLineDecimal(line)
            if (values.length >= 5) {
                config.nrpnChanges.push({
                    msb: values[0],
                    lsb: values[1],
                    value1: values[2],
                    value2: values[3],
                    curve: values[4] ?? 0,
                })
            }
            continue
        }
        if (section === 'RPN CHANGE') {
            const { values } = parseValueLineDecimal(line)
            if (values.length >= 5) {
                config.rpnChanges.push({
                    msb: values[0],
                    lsb: values[1],
                    value1: values[2],
                    value2: values[3],
                    curve: values[4] ?? 0,
                })
            }
            continue
        }
        if (section === 'EXC VALUE') {
            const { fields } = splitNameAndFields(line)
            if (fields.length >= 4) {
                const varId = parseNumber(fields[0], 16)
                const value1 = parseNumber(fields[1], 10)
                const value2 = parseNumber(fields[2], 10)
                const curve = parseNumber(fields[3], 10)
                if (Number.isFinite(varId)) {
                    config.excValue[varId] = {
                        value1: Number.isFinite(value1) ? value1 : 100,
                        value2: Number.isFinite(value2) ? value2 : 0,
                        curve: Number.isFinite(curve) ? curve : 0,
                    }
                }
            }
            continue
        }
        if (section === 'EXCLUSIVE') {
            if (!line.startsWith('(')) continue
            const parsed = parseSysexLine(line)
            if (!pendingExclusive) {
                pendingExclusive = parsed
            } else {
                config.exclusive.push({
                    name: pendingExclusive.name || parsed.name,
                    source: pendingExclusive.tokens,
                    destination: parsed.tokens,
                })
                pendingExclusive = null
            }
            continue
        }
        if (section === 'ADJUST') {
            const { name, values } = parseValueLineDecimal(line)
            if (values.length >= 7) {
                const entry = {
                    name,
                    srcMSB: values[0],
                    srcLSB: values[1],
                    srcProgram: values[2],
                    volume: values[3],
                    destMSB: values[4],
                    destLSB: values[5],
                    destProgram: values[6],
                    pitch: values[7] ?? 0,
                    pan: values[8] ?? 0,
                    cc91: values[9] ?? 0,
                    cc93: values[10] ?? 0,
                    cc72: values[11] ?? 0,
                    cc73: values[12] ?? 0,
                    cc74: values[13] ?? 0,
                }
                config.adjust.push(entry)
            }
            continue
        }
        if (section === 'DRUMS') {
            if (line.startsWith('(')) {
                const { name, values } = parseValueLineDecimal(line)
                if (values.length >= 7) {
                    const kit = {
                        name,
                        srcMSB: values[0],
                        srcLSB: values[1],
                        srcProgram: values[2],
                        volume: values[3],
                        destMSB: values[4],
                        destLSB: values[5],
                        destProgram: values[6],
                        pitch: values[7] ?? 0,
                        pan: values[8] ?? 0,
                        cc91: values[9] ?? 0,
                        cc93: values[10] ?? 0,
                        cc72: values[11] ?? 0,
                        cc73: values[12] ?? 0,
                        cc74: values[13] ?? 0,
                        noteMap: new Map(),
                    }
                    config.drums.push(kit)
                    currentDrumKit = kit
                }
                continue
            }

            if (!currentDrumKit) continue
            const { name, values } = parseValueLineDecimal(line)
            if (values.length >= 3) {
                const mapping = {
                    name,
                    srcNote: values[0],
                    velocity: values[1],
                    destNote: values[2],
                    destMSB: values[3] ?? null,
                    destLSB: values[4] ?? null,
                    destProgram: values[5] ?? null,
                }
                currentDrumKit.noteMap.set(mapping.srcNote, mapping)
            }
            continue
        }
    }

    config._adjustIndex = buildIndex(config.adjust)
    config._drumIndex = buildIndex(config.drums)

    const sourceName = config.source?.name?.toLowerCase?.() || ''
    if (config.source?.makerId === 43 || /xg|yamaha|mu\b/.test(sourceName)) {
        config.sourceHint = MIDI_STANDARDS.XG
    } else if (config.source?.makerId === 41 || /roland|gs|sc-?55|sound canvas/.test(sourceName)) {
        config.sourceHint = MIDI_STANDARDS.GS
    } else {
        config.sourceHint = null
    }

    return config
}

function findAdjustEntry(config, msb, lsb, program) {
    const exact = config._adjustIndex.exact.get(`${msb},${lsb},${program}`)
    if (exact) return exact

    if (config.sourceHint === 'XG') {
        const byLsb = config._adjustIndex.byLsbPc.get(`${lsb},${program}`)
        if (byLsb) return byLsb
        return config._adjustIndex.byMsbPc.get(`${msb},${program}`)
    }

    const byMsb = config._adjustIndex.byMsbPc.get(`${msb},${program}`)
    if (byMsb) return byMsb
    return config._adjustIndex.byLsbPc.get(`${lsb},${program}`)
}

function findDrumKit(config, msb, lsb, program) {
    const exact = config._drumIndex.exact.get(`${msb},${lsb},${program}`)
    if (exact) return exact

    if (config.sourceHint === 'XG') {
        const byLsb = config._drumIndex.byLsbPc.get(`${lsb},${program}`)
        if (byLsb) return byLsb
        return config._drumIndex.byMsbPc.get(`${msb},${program}`)
    }

    const byMsb = config._drumIndex.byMsbPc.get(`${msb},${program}`)
    if (byMsb) return byMsb
    return config._drumIndex.byLsbPc.get(`${lsb},${program}`)
}

function findParamMapping(list, msb, lsb) {
    for (const item of list) {
        const msbMatch = item.msb === -1 || item.msb === msb
        const lsbMatch = item.lsb === -1 || item.lsb === lsb
        if (msbMatch && lsbMatch) return item
    }
    return null
}

function createCcEvent(channel, controller, value) {
    return {
        type: 'cc',
        channel,
        controller,
        value: clamp7bit(value),
        status: 0,
        data: null,
        raw: null,
        note: 0,
        velocity: 0,
    }
}

function createProgramEvent(channel, value) {
    return {
        type: 'program',
        channel,
        value: clamp7bit(value),
        status: 0,
        data: null,
        raw: null,
        note: 0,
        velocity: 0,
        controller: 0,
    }
}

function createSysexEvent(data) {
    return {
        type: 'sysex',
        channel: 0,
        data,
        raw: data,
        status: 0,
        note: 0,
        velocity: 0,
        controller: 0,
        value: 0,
    }
}

function computeRolandChecksum(bytes, checksumIndex) {
    if (!bytes || checksumIndex <= 0) return 0
    let start = 0
    if (bytes[0] === 0xF0 && bytes[1] === 0x41 && bytes[3] === 0x42 && bytes[4] === 0x12) {
        start = 5
    } else if (bytes[0] === 0xF0) {
        start = 1
    }
    let sum = 0
    for (let i = start; i < checksumIndex; i++) sum += bytes[i]
    return (128 - (sum % 128)) & 0x7F
}

function matchSysex(tokens, data, excValueMap) {
    if (!tokens || !data) return null
    if (tokens.length !== data.length) return null

    const vars = new Map()

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const byte = data[i]

        if (token === 0x10F) continue

        if (token <= 0xFF) {
            if (token !== byte) return null
            continue
        }

        if (token >= 0x100 && token <= 0x10E) {
            if (vars.has(token)) {
                if (vars.get(token) !== byte) return null
            } else {
                vars.set(token, byte)
            }
        }
    }

    const mappedVars = new Map()
    for (const [varId, value] of vars.entries()) {
        const map = excValueMap?.[varId]
        mappedVars.set(varId, applyValueMap(value, map))
    }

    return { vars: mappedVars }
}

function buildSysex(tokens, vars) {
    const bytes = new Uint8Array(tokens.length)
    const checksumSlots = []

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (token === 0x10F) {
            bytes[i] = 0
            checksumSlots.push(i)
            continue
        }

        if (token <= 0xFF) {
            bytes[i] = token & 0xFF
            continue
        }

        if (token >= 0x100 && token <= 0x10E) {
            bytes[i] = clamp7bit(vars?.get?.(token) ?? 0)
            continue
        }

        bytes[i] = 0
    }

    for (const index of checksumSlots) {
        bytes[index] = computeRolandChecksum(bytes, index)
    }

    return bytes
}

// GS Part Mode parameter address: 40 1x 15
// x mapping: 0=Part10, 1=Part1, 2=Part2... 9=Part9, A=Part11... F=Part16
function mapGsPartToChannel(addr1, addr2) {
    if (addr1 !== 0x40 && addr1 !== 0x50) return -1
    if ((addr2 & 0xF0) !== 0x10) return -1
    let ch = -1
    if (addr2 === 0x10) ch = 9
    else if (addr2 >= 0x11 && addr2 <= 0x19) ch = addr2 - 0x11
    else if (addr2 >= 0x1A && addr2 <= 0x1F) ch = (addr2 - 0x1A) + 10
    if (ch < 0) return -1
    if (addr1 === 0x50) ch += 16
    return ch
}

function formatSysexHex(bytes) {
    if (!bytes || !bytes.length) return ''
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

function isMidiModeReset(data) {
    if (!data?.length) return false
    const offset = data[0] === 0xF0 ? 1 : 0
    const byte = (index) => Number(data[offset + index])

    if (byte(0) === 0x7E && byte(1) === 0x7F && byte(2) === 0x09) {
        return byte(3) === 0x01 || byte(3) === 0x03
    }
    if (byte(0) === 0x43 && (byte(1) & 0xF0) === 0x10 && byte(2) === 0x4C) {
        return byte(3) === 0x00 && byte(4) === 0x00 && byte(5) === 0x7E && byte(6) === 0x00
    }
    return byte(0) === 0x41 && byte(2) === 0x42 && byte(3) === 0x12 &&
        byte(4) === 0x40 && byte(5) === 0x00 && byte(6) === 0x7F && byte(7) === 0x00
}

export function createSmfKnifeConverter(config, options = {}) {
    if (!config) throw new Error('SMF Knife config required')

    const drumBankRemap = options.enableDrumBankRemap === true
    const ignoreEq = options.ignoreEq === true || (options.ignoreEqForXg === true && config.sourceHint === 'XG')
    const ignoreFx = options.ignoreFx === true || (options.ignoreFxForXg === true && config.sourceHint === 'XG')
    const initialDrumChannels = options.initialDrumChannels?.length === 16
        ? Uint8Array.from(options.initialDrumChannels, (v) => (v ? 1 : 0))
        : null

    const state = {
        enabled: true,
        globalMode: 'smfknife',
        bankMSB: new Int16Array(16).fill(0),
        bankLSB: new Int16Array(16).fill(0),
        program: new Int16Array(16).fill(0),
        drumChannels: new Uint8Array(16).fill(0),
        drumPartMode: new Int8Array(16).fill(-1), // -1 unknown, 0 melodic, 1 drum
        transpose: new Int16Array(16).fill(0),
        ccValues: Array.from({ length: 16 }, () => new Int16Array(128).fill(0)),
        activeDrumKits: Array.from({ length: 16 }, () => null),
        noteMapCache: Array.from({ length: 16 }, () => new Int16Array(128).fill(-1)),
        nrpnMSB: new Int16Array(16).fill(-1),
        nrpnLSB: new Int16Array(16).fill(-1),
        rpnMSB: new Int16Array(16).fill(-1),
        rpnLSB: new Int16Array(16).fill(-1),
        paramMode: new Int8Array(16).fill(0), // 0 none, 1 NRPN, 2 RPN
    }

    state.drumChannels[9] = 1
    if (initialDrumChannels) {
        state.drumChannels.set(initialDrumChannels)
        state.drumChannels[9] = 1
    }

    const process = (event) => {
        if (!state.enabled) return [event]
        if (!event) return []

        if (event.type === 'sysex' && event.data) {
            // System On resets runtime part assignments. Non-default drum
            // channels must be re-declared later by bank select or Part Mode.
            if (isMidiModeReset(event.data)) {
                state.bankMSB.fill(0)
                state.bankLSB.fill(0)
                state.program.fill(0)
                state.drumChannels.fill(0)
                state.drumChannels[9] = 1
                state.drumPartMode.fill(-1)
                state.activeDrumKits.fill(null)
                state.noteMapCache.forEach((arr) => arr.fill(-1))
                if (process.onStateChange) process.onStateChange(process.getState())
            }

            // Yamaha XG Drum Setup (Multi Part / Part Mode)
            if (event.data.length >= 9 &&
                event.data[0] === 0xF0 &&
                event.data[1] === 0x43 &&
                event.data[2] === 0x10 &&
                event.data[3] === 0x4C &&
                event.data[4] === 0x08 &&
                event.data[6] === 0x07) {
                const part = event.data[5]
                const mode = event.data[7]
                if (part >= 0x00 && part <= 0x0F) {
                    const ch = part
                    const isDrum = mode !== 0x00
                    state.drumPartMode[ch] = isDrum ? 1 : 0
                    state.drumChannels[ch] = isDrum ? 1 : 0
                    if (!isDrum) {
                        state.activeDrumKits[ch] = null
                        state.noteMapCache[ch].fill(-1)
                    }
                    if (isDrum && ch !== 9) {
                        console.log('[XG Drum]', {
                            channel: ch + 1,
                            mode,
                            sysex: formatSysexHex(event.data),
                        })
                    }
                    if (process.onStateChange) process.onStateChange(process.getState())
                }
            }

            // GS Part Mode (Drum/Drum2) detection for secondary drum channels
            if (event.data.length >= 10 &&
                event.data[0] === 0xF0 &&
                event.data[1] === 0x41 &&
                event.data[3] === 0x42 &&
                event.data[4] === 0x12) {

                const addr1 = event.data[5]
                const addr2 = event.data[6]
                const addr3 = event.data[7]
                const value = event.data[8]

                if ((addr1 === 0x40 || addr1 === 0x50) && addr3 === 0x15) {
                    const ch = mapGsPartToChannel(addr1, addr2)
                    if (ch >= 0 && ch <= 15) {
                        const isDrum = value !== 0
                        state.drumPartMode[ch] = isDrum ? 1 : 0
                        state.drumChannels[ch] = isDrum ? 1 : 0
                        if (!isDrum) {
                            state.activeDrumKits[ch] = null
                            state.noteMapCache[ch].fill(-1)
                        }
                        if (isDrum && ch !== 9) {
                            console.log('[GS Drum2]', {
                                channel: ch + 1,
                                sysex: formatSysexHex(event.data),
                            })
                        }
                        if (process.onStateChange) process.onStateChange(process.getState())
                    }
                }
            }

            for (const mapping of config.exclusive) {
                if (ignoreFx && /reverb|chorus/i.test(mapping.name || '')) {
                    continue
                }
                const match = matchSysex(mapping.source, event.data, config.excValue)
                if (match) {
                    const data = buildSysex(mapping.destination, match.vars)
                    return [createSysexEvent(data)]
                }
            }
            return [event]
        }

        if (event.type === 'cc') {
            const ch = event.channel
            const cc = event.controller

            if (cc === 99) {
                state.nrpnMSB[ch] = event.value
                state.paramMode[ch] = 1
            } else if (cc === 98) {
                state.nrpnLSB[ch] = event.value
                state.paramMode[ch] = 1
            } else if (cc === 101) {
                state.rpnMSB[ch] = event.value
                state.paramMode[ch] = 2
            } else if (cc === 100) {
                state.rpnLSB[ch] = event.value
                state.paramMode[ch] = 2
            }

            if (cc === 6) {
                if (state.paramMode[ch] === 1) {
                    const mapping = findParamMapping(config.nrpnChanges, state.nrpnMSB[ch], state.nrpnLSB[ch])
                    if (mapping) {
                        if (ignoreEq) return []
                        event.value = applyValueMap(event.value, mapping)
                    }
                } else if (state.paramMode[ch] === 2) {
                    const mapping = findParamMapping(config.rpnChanges, state.rpnMSB[ch], state.rpnLSB[ch])
                    if (mapping) {
                        if (ignoreEq) return []
                        event.value = applyValueMap(event.value, mapping)
                    }
                }
            }

            if (ignoreEq && (cc === 71 || cc === 72 || cc === 73 || cc === 74)) {
                return []
            }
            if (ignoreFx && (cc === 91 || cc === 93)) {
                return [event]
            }

            const ccMap = config.ccChanges[cc]
            if (ccMap) {
                if (ignoreFx && (cc === 91 || cc === 93)) {
                    return [event]
                }
                event.value = applyValueMap(event.value, ccMap)
            }

            if (cc === 0) {
                state.bankMSB[ch] = event.value
                const bankSelectsDrums = state.bankMSB[ch] === 120 || state.bankMSB[ch] === 126 || state.bankMSB[ch] === 127
                const isDrum = bankSelectsDrums || state.drumPartMode[ch] === 1 || ch === 9
                if (state.drumChannels[ch] !== (isDrum ? 1 : 0)) {
                    state.drumChannels[ch] = isDrum ? 1 : 0
                    if (!isDrum) {
                        state.activeDrumKits[ch] = null
                        state.noteMapCache[ch].fill(-1)
                    }
                    if (process.onStateChange) process.onStateChange(process.getState())
                }
            }
            if (cc === 32) state.bankLSB[ch] = event.value
            if (cc >= 0 && cc <= 127) state.ccValues[ch][cc] = event.value

            return [event]
        }

        if (event.type === 'program') {
            const ch = event.channel
            const srcProgram = event.value
            state.program[ch] = srcProgram

            const bankSelectsDrums = state.bankMSB[ch] === 120 || state.bankMSB[ch] === 126 || state.bankMSB[ch] === 127
            const isDrum = bankSelectsDrums || state.drumPartMode[ch] === 1 || ch === 9
            if (state.drumChannels[ch] !== (isDrum ? 1 : 0)) {
                state.drumChannels[ch] = isDrum ? 1 : 0
                if (process.onStateChange) process.onStateChange(process.getState())
            }

            if (!state.drumChannels[ch]) {
                state.activeDrumKits[ch] = null
                state.noteMapCache[ch].fill(-1)
            }

            if (state.drumChannels[ch]) {
                const kit = findDrumKit(config, state.bankMSB[ch], state.bankLSB[ch], srcProgram)
                state.noteMapCache[ch].fill(-1)
                if (kit) {
                    state.activeDrumKits[ch] = kit
                    const events = []
                    if (drumBankRemap) {
                        if (Number.isFinite(kit.destMSB)) events.push(createCcEvent(ch, 0, kit.destMSB))
                        if (Number.isFinite(kit.destLSB)) events.push(createCcEvent(ch, 32, kit.destLSB))
                    }
                    const programValue = Number.isFinite(kit.destProgram) ? kit.destProgram : srcProgram
                    event.value = clamp7bit(programValue)
                    events.push(event)

                    const adjustmentEvents = applyAdjustments(state, ch, kit, { ignoreEq, ignoreFx })
                    if (adjustmentEvents.length) events.push(...adjustmentEvents)

                    return events
                }
                state.activeDrumKits[ch] = null
                return [event]
            }

            const mapping = findAdjustEntry(config, state.bankMSB[ch], state.bankLSB[ch], srcProgram)
            if (!mapping) {
                state.transpose[ch] = 0
                return [event]
            }

            const events = []
            if (Number.isFinite(mapping.destMSB)) events.push(createCcEvent(ch, 0, mapping.destMSB))
            if (Number.isFinite(mapping.destLSB)) events.push(createCcEvent(ch, 32, mapping.destLSB))
            const programValue = Number.isFinite(mapping.destProgram) ? mapping.destProgram : srcProgram
            event.value = clamp7bit(programValue)
            events.push(event)

            const adjustmentEvents = applyAdjustments(state, ch, mapping, { ignoreEq, ignoreFx })
            if (adjustmentEvents.length) events.push(...adjustmentEvents)

            return events
        }

        if (event.type === 'note_on' || event.type === 'note_off') {
            const ch = event.channel
            const isNoteOff = event.type === 'note_off' || (event.type === 'note_on' && event.velocity === 0)
            const isDrum = state.drumChannels[ch] === 1

            let note = event.note
            let velocity = event.velocity

            if (isDrum) {
                const kit = state.activeDrumKits[ch]
                if (kit?.noteMap) {
                    const mapping = kit.noteMap.get(note)
                    if (mapping) {
                        const mappedNote = Number.isFinite(mapping.destNote) ? mapping.destNote : note
                        if (!isNoteOff) {
                            const mappedVelocity = clamp7bit(velocity + (mapping.velocity ?? 0))
                            velocity = mappedVelocity
                            state.noteMapCache[ch][note] = mappedNote
                        } else {
                            const originalNote = note
                            const cached = state.noteMapCache[ch][originalNote]
                            if (cached >= 0) {
                                note = cached
                                state.noteMapCache[ch][originalNote] = -1
                            } else {
                                note = mappedNote
                            }
                        }

                        if (!isNoteOff && (Number.isFinite(mapping.destMSB) || Number.isFinite(mapping.destLSB) || Number.isFinite(mapping.destProgram))) {
                            const events = []
                            if (drumBankRemap) {
                                if (Number.isFinite(mapping.destMSB)) events.push(createCcEvent(ch, 0, mapping.destMSB))
                                if (Number.isFinite(mapping.destLSB)) events.push(createCcEvent(ch, 32, mapping.destLSB))
                            }
                            if (Number.isFinite(mapping.destProgram)) events.push(createProgramEvent(ch, mapping.destProgram))
                            event.note = clamp7bit(mappedNote)
                            event.velocity = clamp7bit(velocity)
                            events.push(event)
                            return events
                        }
                        note = mappedNote
                    }
                }
            } else {
                const transpose = state.transpose[ch] || 0
                if (transpose) note = clamp7bit(note + transpose)
            }

            if (!isNoteOff && config.velocity) {
                velocity = applyValueMap(velocity, config.velocity)
            }

            event.note = clamp7bit(note)
            event.velocity = clamp7bit(velocity)
            return [event]
        }

        return [event]
    }

    process.reset = () => {
        state.bankMSB.fill(0)
        state.bankLSB.fill(0)
        state.program.fill(0)
        state.drumChannels.fill(0)
        state.drumPartMode.fill(-1)
        state.drumChannels[9] = 1
        if (initialDrumChannels) {
            state.drumChannels.set(initialDrumChannels)
            state.drumChannels[9] = 1
        }
        state.transpose.fill(0)
        state.ccValues.forEach((arr) => arr.fill(0))
        state.activeDrumKits.fill(null)
        state.noteMapCache.forEach((arr) => arr.fill(-1))
        state.nrpnMSB.fill(-1)
        state.nrpnLSB.fill(-1)
        state.rpnMSB.fill(-1)
        state.rpnLSB.fill(-1)
        state.paramMode.fill(0)
    }

    process.setEnabled = (v) => { state.enabled = Boolean(v) }
    process.getState = () => ({
        globalMode: state.globalMode,
        configName: config.name || config.title || 'SMF Knife',
        mappingSource: config.source?.name || '',
        mappingDestination: config.destination?.name || '',
        drumChannels: state.drumChannels,
    })

    return process
}

function applyAdjustments(state, channel, mapping, options = {}) {
    const events = []
    if (!mapping) return events
    const ignoreEq = options.ignoreEq === true
    const ignoreFx = options.ignoreFx === true

    const applyDelta = (cc, delta) => {
        if (delta == null) return
        const isAbsolute = delta >= 1000 || delta <= -1000
        const base = state.ccValues[channel][cc] ?? 0
        const target = isAbsolute ? delta - (delta >= 1000 ? 1000 : -1000) : base + delta
        const value = clamp7bit(target)
        state.ccValues[channel][cc] = value
        events.push(createCcEvent(channel, cc, value))
    }

    if (Number.isFinite(mapping.volume)) applyDelta(7, mapping.volume)
    if (Number.isFinite(mapping.pan)) applyDelta(10, mapping.pan)
    if (!ignoreFx) {
        if (Number.isFinite(mapping.cc91)) applyDelta(91, mapping.cc91)
        if (Number.isFinite(mapping.cc93)) applyDelta(93, mapping.cc93)
    }
    if (!ignoreEq) {
        if (Number.isFinite(mapping.cc72)) applyDelta(72, mapping.cc72)
        if (Number.isFinite(mapping.cc73)) applyDelta(73, mapping.cc73)
        if (Number.isFinite(mapping.cc74)) applyDelta(74, mapping.cc74)
    }

    if (Number.isFinite(mapping.pitch)) {
        const isAbsolute = mapping.pitch >= 1000 || mapping.pitch <= -1000
        state.transpose[channel] = isAbsolute
            ? mapping.pitch - (mapping.pitch >= 1000 ? 1000 : -1000)
            : mapping.pitch
    }

    return events
}
