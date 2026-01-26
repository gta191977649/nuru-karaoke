/**
 * MIDI Standard + "SC-88-ish" (SC-88/88Pro/88ST/8850-ish) detection
 * - Base: GM / GM2 / XG / GS
 * - Extra: if GS, try to decide if it targets newer Sound Canvas features (SC-88-ish) vs "plain GS" (SC-55-ish)
 *
 * Key ideas:
 * 1) GS detection via GS Reset or any Roland DT1 (F0 41 .. 42 12 ..)
 * 2) SC-88-ish strong signals:
 *    - DT1 writes to address bank 0x50 .... (2nd module / extra 16 parts)  -> SC-88ST/Pro class behavior
 *    - DT1 writes to 40 03 ** (EFX/Insertion effects area)                -> SC-88-ish
 * 3) Optional/weak: CC32 map select values 2/3/4 when CC0==0 (SC-88 map etc)
 */

// Signatures inside SMF SysEx payload (SMF F0 event data bytes typically exclude leading F0)
// XG device ID is 0x1n (0x10..0x1F), so accept any device id.
const XG_ON_PAYLOAD = [0x43, null, 0x4C, 0x00, 0x00, 0x7E, 0x00]
const GM2_RESET_PAYLOAD = [0x7E, 0x7F, 0x09, 0x03]
const GM_RESET_PAYLOAD = [0x7E, 0x7F, 0x09, 0x01]

// GS Reset prefix (payload in SMF SysEx: 41 <dev> 42 12 40 00 7F 00 <chk>)
const GS_RESET_PREFIX = [0x41, null, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00]

// Roland DT1: 41 <dev> 42 12 <addr1> <addr2> <addr3> <data...> <checksum?>
// We will parse DT1 packets and analyze <addr1..3>
function isRolandDT1(sysexData) {
    return sysexData?.length >= 8 &&
        sysexData[0] === 0x41 &&
        (sysexData[2] === 0x42) &&
        (sysexData[3] === 0x12)
}

function matchPattern(data, pattern) {
    if (!data || data.length < pattern.length) return false
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== null && data[i] !== pattern[i]) return false
    }
    return true
}

function pushOnce(arr, s) {
    if (!arr.includes(s)) arr.push(s)
}

function normalizeSysexPayload(data) {
    if (!data || data.length === 0) return data
    let payload = data
    if (payload[0] === 0xF0) payload = payload.slice(1)
    if (payload[payload.length - 1] === 0xF7) payload = payload.slice(0, -1)
    return payload
}

function scanMidiForSysex(buffer) {
    const view = new DataView(buffer)
    let offset = 0

    // Header "MThd"
    if (view.getUint32(offset) !== 0x4d546864) return null
    offset += 4
    const headerLen = view.getUint32(offset); offset += 4
    const format = view.getUint16(offset); offset += 2
    const numTracks = view.getUint16(offset); offset += 2
    const division = view.getUint16(offset); offset += 2
    offset += Math.max(0, headerLen - 6) // skip any extra header bytes safely

    const result = {
        format,
        division,
        xg: false,
        gs: false,
        gm2: false,
        gm: false,
        gs_sc88ish: false,

        // heuristics
        noteActivity: 0,
        drumActivity: 0,

        // bank/map heuristic support
        lastCC0ByChan: new Uint8Array(16), // CC0 MSB
        sawMapSelectLike: false,

        // GS/SC analysis
        sawRolandDT1: false,
        sawAddr50: false,         // 0x50 ** ** writes (2nd module / extra parts)
        sawEFXBlock: false,       // 40 03 ** writes (EFX-ish)
        sawLarge29: false,        // Large bulk dump to 0x29
        total29: 0,               // Total bytes written to 0x29
        reasons: []
    }

    const readVarInt = () => {
        let value = 0
        let byte
        do {
            if (offset >= buffer.byteLength) return 0
            byte = view.getUint8(offset++)
            value = (value << 7) | (byte & 0x7f)
        } while (byte & 0x80)
        return value >>> 0
    }

    for (let t = 0; t < numTracks; t++) {
        if (offset + 8 > buffer.byteLength) break
        if (view.getUint32(offset) !== 0x4d54726b) break // "MTrk"
        offset += 4
        const trackLen = view.getUint32(offset); offset += 4
        const end = Math.min(buffer.byteLength, offset + trackLen)

        let runningStatus = 0

        while (offset < end) {
            readVarInt() // delta
            if (offset >= end) break

            let status = view.getUint8(offset)

            // Running status
            if (status & 0x80) {
                offset++
                runningStatus = status
            } else {
                status = runningStatus
            }

            const type = status & 0xf0
            const channel = status & 0x0f

            if (status === 0xff) {
                // Meta: FF <type> <len> <data...>
                if (offset >= end) break
                offset++ // meta type
                const len = readVarInt()
                offset = Math.min(end, offset + len)
                continue
            }

            if (status === 0xf0 || status === 0xf7) {
                // SysEx: F0 or F7 continuation
                const len = readVarInt()
                const sysexData = new Uint8Array(buffer, offset, Math.min(len, end - offset))
                const payload = normalizeSysexPayload(sysexData)

                // Core standard checks
                if (matchPattern(payload, XG_ON_PAYLOAD)) {
                    result.xg = true
                    pushOnce(result.reasons, 'XG: System On SysEx')
                } else if (matchPattern(payload, GM2_RESET_PAYLOAD)) {
                    result.gm2 = true
                    pushOnce(result.reasons, 'GM2: Reset SysEx')
                } else if (matchPattern(payload, GM_RESET_PAYLOAD)) {
                    result.gm = true
                    pushOnce(result.reasons, 'GM: Reset SysEx')
                } else if (matchPattern(payload, GS_RESET_PREFIX)) {
                    result.gs = true
                    pushOnce(result.reasons, 'GS: Reset SysEx')
                }

                // GS/SC family deeper parse: Roland DT1 messages
                if (isRolandDT1(payload)) {
                    result.sawRolandDT1 = true
                    result.gs = true // DT1 strongly implies GS-family intent
                    // bytes: [41 dev 42 12 addr1 addr2 addr3 ...]
                    const addr1 = payload[4] ?? 0x00
                    const addr2 = payload[5] ?? 0x00


                    // Strong SC-88-ish signal #1: 0x50 bank addresses (2nd module / extra parts)
                    // If your file writes to both 0x40.. and 0x50.. blocks, it’s almost certainly SC-88ST/Pro-ish targeting.
                    if (addr1 === 0x50) {
                        result.sawAddr50 = true
                    }

                    // Strong SC-88-ish signal #2: EFX block (commonly referenced as 40 03 ** for FX/EFX on SC-88-ish)
                    if (addr1 === 0x40 && addr2 === 0x03) {
                        result.sawEFXBlock = true
                    }

                    // Strong SC-88-ish signal #3: Large Bulk Tables (Addr 0x29)
                    // "Any Roland DT1 with addr1 == 0x29 and dataLength >= 64 bytes"
                    // "OR total bytes written in DT1 packets with addr1 == 0x29 across the file >= 256"
                    if (addr1 === 0x29) {
                        const dataLength = payload.length - 8 // approx data part
                        result.total29 += dataLength
                        if (dataLength >= 64) {
                            result.sawLarge29 = true
                        }
                    }

                    // (Optional) You can add more address tests here as you learn them:
                    // - EQ on/off, output assign, part EFX assign are often in 40 4x 2x style maps on some GS variants.
                    // if (addr1 === 0x40 && (addr2 & 0xF0) === 0x40) { ... }
                }

                offset += len
                continue
            }

            // Channel messages
            switch (type) {
                case 0x80: // note off
                    offset += 2
                    break
                case 0x90: { // note on
                    // status already consumed, now data bytes
                    if (offset + 2 > end) { offset = end; break }
                    view.getUint8(offset); offset++
                    const vel = view.getUint8(offset); offset++
                    if (vel > 0) {
                        result.noteActivity++
                        if (channel === 9) result.drumActivity++
                    }
                    break
                }
                case 0xA0: // poly aftertouch
                    offset += 2
                    break
                case 0xB0: { // CC
                    if (offset + 2 > end) { offset = end; break }
                    const cc = view.getUint8(offset); offset++
                    const val = view.getUint8(offset); offset++

                    // Track CC0 (Bank MSB) and CC32 (Bank LSB / sometimes used for map selection on some SC setups)
                    if (cc === 0x00) {
                        result.lastCC0ByChan[channel] = val
                    } else if (cc === 0x20) {
                        // Weak heuristic:
                        // if CC0==0 and CC32 is 2/3/4, that often *means* SC-88 / SC-88Pro / SC-8850 map selection in some workflows.
                        const msb = result.lastCC0ByChan[channel]
                        if (msb === 0x00 && (val === 2 || val === 3 || val === 4)) {
                            result.sawMapSelectLike = true
                        }
                    }
                    break
                }
                case 0xC0: // program change
                case 0xD0: // channel aftertouch
                    offset += 1
                    break
                case 0xE0: // pitch bend
                    offset += 2
                    break
                default: {
                    // Unknown / should not happen often; attempt to continue safely
                    // If status byte was invalid, we might desync, but keep best-effort.
                    break
                }
            }
        }

        offset = end
    }

    // Final SC-88-ish decision (only meaningful if GS-ish)
    if (result.gs) {
        // Strong signals ONLY
        if (result.sawAddr50) {
            result.gs_sc88ish = true
            pushOnce(result.reasons, 'GS: DT1 writes to 0x50 bank (2nd module / extra parts) => SC-88ST/Pro-ish')
        }
        if (result.sawEFXBlock) {
            result.gs_sc88ish = true
            pushOnce(result.reasons, 'GS: DT1 writes to 40 03 ** (EFX/FX block) => SC-88-ish')
        }
        if (result.sawLarge29 || result.total29 >= 256) {
            result.gs_sc88ish = true
            pushOnce(result.reasons, 'GS: Large Bulk Table writes (Addr 0x29) => SC-88-ish')
        }

        // Weak signals (CC32 map) do NOT trigger SC88_ISH, only for debug/telemetry
    }

    return result
}

export function detectMidiStandard(buffer) {
    if (!buffer) return { standard: 'GM', gsVariant: null, reasons: ['No buffer'] }

    try {
        const scan = scanMidiForSysex(buffer)
        if (!scan) return { standard: 'GM', gsVariant: null, reasons: ['Parse failed'] }

        let standard = 'GM'
        let gsVariant = null

        if (scan.xg) {
            standard = 'XG'
        } else if (scan.gs) {
            standard = 'GS'
            gsVariant = scan.gs_sc88ish ? 'SC-88-ish' : 'Plain GS'
        } else if (scan.gm2) {
            standard = 'GM2'
        } else if (scan.gm) {
            standard = 'GM'
        } else {
            // fallback heuristic
            if (scan.noteActivity > 0 && (scan.drumActivity / scan.noteActivity) > 0.2) {
                standard = 'GM'
                scan.reasons.push('Heuristic: strong Channel 10 activity')
            } else {
                standard = 'GM'
                scan.reasons.push('Default fallback')
            }
        }

        return {
            standard,
            gsVariant, // null unless GS
            convertSC88: standard === 'GS' && gsVariant === 'SC-88-ish',
            reasons: scan.reasons,
            debug: {
                format: scan.format,
                division: scan.division,
                sawRolandDT1: scan.sawRolandDT1,
                sawAddr50: scan.sawAddr50,
                sawEFXBlock: scan.sawEFXBlock,
                sawLarge29: scan.sawLarge29,
                total29: scan.total29,
                sawMapSelectLike: scan.sawMapSelectLike
            }
        }
    } catch (e) {
        console.warn('MIDI Detection failed', e)
        return { standard: 'GM', gsVariant: null, reasons: ['Error: ' + e.message] }
    }
}
