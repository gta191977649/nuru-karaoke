
/**
 * SC-88Pro / SC-88 (classic) -> strict GM1 converter (rule-based)
 *
 * Implements logic to collapse GS/SC attributes into Standard GM1.
 */

const GM1 = {
    // GM1 program numbers are 0-based here (0..127)
    families: {
        // Pianos
        ACOUSTIC_GRAND: 0,
        BRIGHT_ACOUSTIC: 1,
        ELECTRIC_GRAND: 2,
        HONKY_TONK: 3,
        E_PIANO_1: 4,
        E_PIANO_2: 5,
        HARPSICHORD: 6,
        CLAVI: 7,

        // Chromatic percussion
        CELESTA: 8,
        GLOCKENSPIEL: 9,
        MUSIC_BOX: 10,
        VIBRAPHONE: 11,
        MARIMBA: 12,
        XYLOPHONE: 13,
        TUBULAR_BELLS: 14,
        DULCIMER: 15,

        // Organ
        DRAWBAR_ORGAN: 16,
        PERCUSSIVE_ORGAN: 17,
        ROCK_ORGAN: 18,
        CHURCH_ORGAN: 19,
        REED_ORGAN: 20,
        ACCORDION: 21,
        HARMONICA: 22,
        TANGO_ACCORDION: 23,

        // Guitar
        NYLON_GUITAR: 24,
        STEEL_GUITAR: 25,
        JAZZ_GUITAR: 26,
        CLEAN_GUITAR: 27,
        MUTED_GUITAR: 28,
        OVERDRIVEN_GUITAR: 29,
        DISTORTION_GUITAR: 30,
        GUITAR_HARMONICS: 31,

        // Bass
        ACOUSTIC_BASS: 32,
        FINGER_BASS: 33,
        PICK_BASS: 34,
        FRETLESS_BASS: 35,
        SLAP_BASS_1: 36,
        SLAP_BASS_2: 37,
        SYNTH_BASS_1: 38,
        SYNTH_BASS_2: 39,

        // Strings
        VIOLIN: 40,
        VIOLA: 41,
        CELLO: 42,
        CONTRABASS: 43,
        TREMOLO_STRINGS: 44,
        PIZZ_STRINGS: 45,
        ORCHESTRAL_HARP: 46,
        TIMPANI: 47,

        // Ensemble
        STRING_ENSEMBLE_1: 48,
        STRING_ENSEMBLE_2: 49,
        SYNTH_STRINGS_1: 50,
        SYNTH_STRINGS_2: 51,
        CHOIR_AAHS: 52,
        VOICE_OOHS: 53,
        SYNTH_VOICE: 54,
        ORCHESTRA_HIT: 55,

        // Brass
        TRUMPET: 56,
        TROMBONE: 57,
        TUBA: 58,
        MUTED_TRUMPET: 59,
        FRENCH_HORN: 60,
        BRASS_SECTION: 61,
        SYNTH_BRASS_1: 62,
        SYNTH_BRASS_2: 63,

        // Reed
        SOPRANO_SAX: 64,
        ALTO_SAX: 65,
        TENOR_SAX: 66,
        BARITONE_SAX: 67,
        OBOE: 68,
        ENGLISH_HORN: 69,
        BASSOON: 70,
        CLARINET: 71,

        // Pipe
        PICCOLO: 72,
        FLUTE: 73,
        RECORDER: 74,
        PAN_FLUTE: 75,
        BLOWN_BOTTLE: 76,
        SHAKUHACHI: 77,
        WHISTLE: 78,
        OCARINA: 79,

        // Synth lead
        LEAD_1_SQUARE: 80,
        LEAD_2_SAW: 81,
        LEAD_3_CALLIOPE: 82,
        LEAD_4_CHIFF: 83,
        LEAD_5_CHARANG: 84,
        LEAD_6_VOICE: 85,
        LEAD_7_FIFTHS: 86,
        LEAD_8_BASS_LEAD: 87,

        // Synth pad
        PAD_1_NEW_AGE: 88,
        PAD_2_WARM: 89,
        PAD_3_POLY: 90,
        PAD_4_CHOIR: 91,
        PAD_5_BOWED: 92,
        PAD_6_METALLIC: 93,
        PAD_7_HALO: 94,
        PAD_8_SWEEP: 95,

        // Synth FX
        FX_1_RAIN: 96,
        FX_2_SOUNDTRACK: 97,
        FX_3_CRYSTAL: 98,
        FX_4_ATMOSPHERE: 99,
        FX_5_BRIGHTNESS: 100,
        FX_6_GOBLINS: 101,
        FX_7_ECHOES: 102,
        FX_8_SCI_FI: 103,

        // Ethnic
        SITAR: 104,
        BANJO: 105,
        SHAMISEN: 106,
        KOTO: 107,
        KALIMBA: 108,
        BAGPIPE: 109,
        FIDDLE: 110,
        SHANAI: 111,

        // Percussive
        TINKLE_BELL: 112,
        AGOGO: 113,
        STEEL_DRUMS: 114,
        WOODBLOCK: 115,
        TAIKO_DRUM: 116,
        MELODIC_TOM: 117,
        SYNTH_DRUM: 118,
        REVERSE_CYMBAL: 119,

        // SFX
        GUITAR_FRET_NOISE: 120,
        BREATH_NOISE: 121,
        SEASHORE: 122,
        BIRD_TWEET: 123,
        TELEPHONE_RING: 124,
        HELICOPTER: 125,
        APPLAUSE: 126,
        GUNSHOT: 127
    }
}

const OVERRIDES_BY_NAME = [
    // SC "SFX" and weird sets: force into GM SFX family
    { test: /^(sfx|se|fx)\b/, to: GM1.families.FX_8_SCI_FI },
    { test: /\bgun|shot|explosion\b/, to: GM1.families.GUNSHOT },
    { test: /\bapplause|clap|crowd\b/, to: GM1.families.APPLAUSE },
    { test: /\btelephone|phone|ring\b/, to: GM1.families.TELEPHONE_RING },
    { test: /\bhelicopter\b/, to: GM1.families.HELICOPTER },
    { test: /\bseashore|ocean|wave\b/, to: GM1.families.SEASHORE },
    { test: /\bbird\b/, to: GM1.families.BIRD_TWEET },

    // SC special leads
    { test: /\bcharang\b/, to: GM1.families.LEAD_5_CHARANG },
    { test: /\bcalliope\b/, to: GM1.families.LEAD_3_CALLIOPE },
    { test: /\bfifths\b/, to: GM1.families.LEAD_7_FIFTHS },
    { test: /\bchiff\b/, to: GM1.families.LEAD_4_CHIFF },

    // Choir/pads that often appear under many SC names
    { test: /\bchoir|aah|ooh\b/, to: GM1.families.CHOIR_AAHS },
    { test: /\bvoice pad\b/, to: GM1.families.PAD_4_CHOIR },

    // Ethnic keywords
    { test: /\bshakuhachi\b/, to: GM1.families.SHAKUHACHI },
    { test: /\bsitar\b/, to: GM1.families.SITAR },
    { test: /\bkoto\b/, to: GM1.families.KOTO },
    { test: /\bshamisen\b/, to: GM1.families.SHAMISEN },
    { test: /\bbagpipe\b/, to: GM1.families.BAGPIPE }
]

function overrideByBankProgram({ bankMSB, bankLSB, isDrumChan }) {
    if (isDrumChan) return null
    if (bankMSB === 0 && (bankLSB >= 120)) {
        return GM1.families.FX_8_SCI_FI
    }
    return null
}

function normName(s) {
    if (!s) return ''
    return String(s)
        .toLowerCase()
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f]/g, ' ')
        .replace(/[_\-/]+/g, ' ')
        .replace(/[^\w\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function keywordToGm1(nameNorm) {
    if (!nameNorm) return null
    for (const r of OVERRIDES_BY_NAME) {
        if (r.test.test(nameNorm)) return r.to
    }

    const rules = [
        // pianos and keys
        [/(\bpiano\b|\bgrand\b)/, GM1.families.ACOUSTIC_GRAND],
        [/(\bhonky\b|\btoy piano\b)/, GM1.families.HONKY_TONK],
        [/(\be\.?piano\b|\belectric piano\b|\brhodes\b)/, GM1.families.E_PIANO_1],
        [/(\bclav\b|\bclavi\b)/, GM1.families.CLAVI],
        [/(\bharpsi\b|\bharpsichord\b)/, GM1.families.HARPSICHORD],
        // organs and accordions
        [/(\borgan\b)/, GM1.families.DRAWBAR_ORGAN],
        [/(\bchurch organ\b|\bcathedral\b)/, GM1.families.CHURCH_ORGAN],
        [/(\baccordion\b)/, GM1.families.ACCORDION],
        [/(\bharmonica\b)/, GM1.families.HARMONICA],
        // guitars and bass
        [/(\bnylon\b.*\bguitar\b)/, GM1.families.NYLON_GUITAR],
        [/(\bsteel\b.*\bguitar\b|\bacoustic guitar\b)/, GM1.families.STEEL_GUITAR],
        [/(\bjazz\b.*\bguitar\b)/, GM1.families.JAZZ_GUITAR],
        [/(\bclean\b.*\bguitar\b)/, GM1.families.CLEAN_GUITAR],
        [/(\bmuted\b.*\bguitar\b)/, GM1.families.MUTED_GUITAR],
        [/(\boverd(rive|riven)\b.*\bguitar\b)/, GM1.families.OVERDRIVEN_GUITAR],
        [/(\bdistort(ed|ion)\b.*\bguitar\b)/, GM1.families.DISTORTION_GUITAR],
        [/(\bbass\b.*\bfretless\b)/, GM1.families.FRETLESS_BASS],
        [/(\bslap\b.*\bbass\b)/, GM1.families.SLAP_BASS_1],
        [/(\bsynth\b.*\bbass\b)/, GM1.families.SYNTH_BASS_1],
        [/(\bacoustic\b.*\bbass\b|\bupright\b)/, GM1.families.ACOUSTIC_BASS],
        [/(\bfinger\b.*\bbass\b)/, GM1.families.FINGER_BASS],
        // strings and ensemble
        [/(\bviolin\b)/, GM1.families.VIOLIN],
        [/(\bviola\b)/, GM1.families.VIOLA],
        [/(\bcello\b)/, GM1.families.CELLO],
        [/(\bcontra\b|\bcontrabass\b|\bupright strings\b)/, GM1.families.CONTRABASS],
        [/(\bstring ensemble\b|\bstrings\b)/, GM1.families.STRING_ENSEMBLE_1],
        [/(\bpizz\b)/, GM1.families.PIZZ_STRINGS],
        [/(\btremolo\b)/, GM1.families.TREMOLO_STRINGS],
        [/(\bharp\b)/, GM1.families.ORCHESTRAL_HARP],
        // brass
        [/(\btrumpet\b)/, GM1.families.TRUMPET],
        [/(\bmuted trumpet\b)/, GM1.families.MUTED_TRUMPET],
        [/(\btrombone\b)/, GM1.families.TROMBONE],
        [/(\btuba\b)/, GM1.families.TUBA],
        [/(\bfrench horn\b|\bhorn\b)/, GM1.families.FRENCH_HORN],
        [/(\bbrass\b.*\bsection\b|\bbrass section\b)/, GM1.families.BRASS_SECTION],
        [/(\bsynth brass\b)/, GM1.families.SYNTH_BRASS_1],
        // reeds and winds
        [/(\bsoprano sax\b)/, GM1.families.SOPRANO_SAX],
        [/(\balto sax\b)/, GM1.families.ALTO_SAX],
        [/(\btenor sax\b)/, GM1.families.TENOR_SAX],
        [/(\bbaritone sax\b)/, GM1.families.BARITONE_SAX],
        [/(\boboe\b)/, GM1.families.OBOE],
        [/(\benglish horn\b)/, GM1.families.ENGLISH_HORN],
        [/(\bbassoon\b)/, GM1.families.BASSOON],
        [/(\bclarinet\b)/, GM1.families.CLARINET],
        // flutes
        [/(\bpiccolo\b)/, GM1.families.PICCOLO],
        [/(\bflute\b)/, GM1.families.FLUTE],
        [/(\brecorder\b)/, GM1.families.RECORDER],
        [/(\bpan flute\b)/, GM1.families.PAN_FLUTE],
        [/(\bocarina\b)/, GM1.families.OCARINA],
        [/(\bwhistle\b)/, GM1.families.WHISTLE],
        // synth leads/pads
        [/(\bsquare\b.*\blead\b|\blead\b.*\bsquare\b)/, GM1.families.LEAD_1_SQUARE],
        [/(\bsaw\b.*\blead\b|\blead\b.*\bsaw\b)/, GM1.families.LEAD_2_SAW],
        [/(\bbass\b.*\blead\b|\blead\b.*\bbass\b)/, GM1.families.LEAD_8_BASS_LEAD],
        [/(\bpad\b.*\bwarm\b|\bwarm pad\b)/, GM1.families.PAD_2_WARM],
        [/(\bnew age\b)/, GM1.families.PAD_1_NEW_AGE],
        [/(\bsweep\b)/, GM1.families.PAD_8_SWEEP],
        [/(\bhalo\b)/, GM1.families.PAD_7_HALO],
        [/(\bpoly\b.*\bpad\b)/, GM1.families.PAD_3_POLY],
        // synth fx
        [/(\brain\b|\bdroplet\b)/, GM1.families.FX_1_RAIN],
        [/(\bsoundtrack\b)/, GM1.families.FX_2_SOUNDTRACK],
        [/(\bcrystal\b)/, GM1.families.FX_3_CRYSTAL],
        [/(\batmos\b|\batmosphere\b)/, GM1.families.FX_4_ATMOSPHERE],
        [/(\bbrightness\b)/, GM1.families.FX_5_BRIGHTNESS],
        [/(\bgoblin\b)/, GM1.families.FX_6_GOBLINS],
        [/(\becho\b|\bechoes\b)/, GM1.families.FX_7_ECHOES],
        [/(\bsci\b|\bsci fi\b|\bspace\b)/, GM1.families.FX_8_SCI_FI],
        // percussion-ish melodic
        [/(\btaiko\b)/, GM1.families.TAIKO_DRUM],
        [/(\bagogo\b)/, GM1.families.AGOGO],
        [/(\bsteel drum\b)/, GM1.families.STEEL_DRUMS],
        [/(\bwoodblock\b)/, GM1.families.WOODBLOCK]
    ]

    for (const [re, gmProg] of rules) {
        if (re.test(nameNorm)) return gmProg
    }
    return null
}

export function mapScToGm1Program({
    bankMSB = 0,
    bankLSB = 0,
    program = 0,
    patchName = null,
    isDrumChan = false
}) {
    if (isDrumChan) return { gmProgram: program & 0x7f, why: 'Drum channel, leave program' }
    const p = program & 0x7f
    const nameN = normName(patchName)
    if (nameN) {
        const gmByName = keywordToGm1(nameN)
        if (gmByName != null) return { gmProgram: gmByName, why: `Name rule: "${nameN}"` }
    }
    const gmByBP = overrideByBankProgram({ bankMSB, bankLSB, program: p, isDrumChan })
    if (gmByBP != null) return { gmProgram: gmByBP, why: `Bank/program override` }
    return { gmProgram: p, why: 'Default: keep program, drop bank variation' }
}

export function shouldKeepCC(cc) {
    const keep = new Set([
        0, 1, 5, 6, 7, 10, 11, 32, 38, 39, 64, 65, 91, 93,
        120, 121, 122, 123, 124, 125, 126, 127
    ])
    return keep.has(cc)
}

export function remapDrumNoteToGm1(note) {
    const n = note & 0x7f
    if (n >= 35 && n <= 81) return n
    if (n < 35) return 35
    if (n > 81 && n <= 87) return 81
    return null
}

export function shouldDropSysExInStrictGm1(sysexPayload) {
    if (!sysexPayload || sysexPayload.length === 0) return true
    const isGMReset = sysexPayload.length >= 4 &&
        sysexPayload[0] === 0x7E &&
        sysexPayload[1] === 0x7F &&
        sysexPayload[2] === 0x09 &&
        (sysexPayload[3] === 0x01)
    const isGM2Reset = sysexPayload.length >= 4 &&
        sysexPayload[0] === 0x7E &&
        sysexPayload[1] === 0x7F &&
        sysexPayload[2] === 0x09 &&
        (sysexPayload[3] === 0x03)
    return !(isGMReset || isGM2Reset)
}

// GS Part Mode parameter address: 40 1x 15
// x mapping: 0=Part10, 1=Part1, 2=Part2... 9=Part9, A=Part11... F=Part16
function getChannelFromGsPartNibble(nibble) {
    if (nibble === 0) return 9 // Part 10
    if (nibble >= 1 && nibble <= 9) return nibble - 1 // Part 1..9 -> Ch 0..8
    if (nibble >= 0xA && nibble <= 0xF) return nibble // Part 11..16 -> Ch 10..15
    return -1
}

/**
 * Factory for connection to MidiMapper architecture
 */
export function createSoundCanvasConverter() {
    const state = {
        enabled: true,
        globalMode: 'sc88-gm-strict',
        bankMSB: new Int16Array(16).fill(0),
        bankLSB: new Int16Array(16).fill(0),
        program: new Int16Array(16).fill(0),
        drumChannels: new Uint8Array(16).fill(0) // 1 = drum
    }
    // Hardcode Ch 10 (idx 9) as drum default
    state.drumChannels[9] = 1

    const process = (event) => {
        if (!state.enabled) return [event]

        // SysEx: Parse Roland DT1 for Part Mode (Drums)
        if (event.type === 'sysex' && event.data) {
            // Roland DT1: F0 41 dev 42 12 addr1 addr2 addr3 data sum F7
            // Min length 11.
            if (event.data.length >= 10 &&
                event.data[0] === 0xF0 &&
                event.data[1] === 0x41 &&
                event.data[3] === 0x42 &&
                event.data[4] === 0x12) {

                const addr1 = event.data[5]
                const addr2 = event.data[6]
                const addr3 = event.data[7]
                const data = event.data[8]

                // Check for Part Mode: 40 1x 15
                if (addr1 === 0x40 && (addr2 & 0xF0) === 0x10 && addr3 === 0x15) {
                    const nibble = addr2 & 0x0F
                    const ch = getChannelFromGsPartNibble(nibble)
                    if (ch >= 0) {
                        // Value: 0=Normal, 1=Drum, 2=Drum2
                        const isDrum = (data === 1 || data === 2)
                        state.drumChannels[ch] = isDrum ? 1 : 0
                        if (process.onStateChange) process.onStateChange(process.getState())
                    }
                }
            }

            if (shouldDropSysExInStrictGm1(event.data)) return []
            return [event] // Keep (if not dropped)
        }

        // CC Filtering
        if (event.type === 'cc') {
            const cc = event.controller
            const ch = event.channel
            // Track Bank Select
            if (cc === 0) state.bankMSB[ch] = event.value
            if (cc === 32) state.bankLSB[ch] = event.value

            if (!shouldKeepCC(cc)) return []

            // Force Bank Select to 0/0 for Drums
            if (state.drumChannels[ch] && (cc === 0 || cc === 32)) {
                event.value = 0
            }
            return [event]
        }

        // Program Change Mapping
        if (event.type === 'program') {
            const ch = event.channel
            state.program[ch] = event.value
            const isDrum = Boolean(state.drumChannels[ch])

            const mapping = mapScToGm1Program({
                bankMSB: state.bankMSB[ch],
                bankLSB: state.bankLSB[ch],
                program: event.value,
                isDrumChan: isDrum,
                patchName: null
            })

            event.value = mapping.gmProgram
            return [event]
        }

        // Note Remapping (Drums)
        if (event.type === 'note_on' || event.type === 'note_off') {
            const ch = event.channel
            // Dynamic Drum Channel Check
            if (state.drumChannels[ch]) {
                const remapped = remapDrumNoteToGm1(event.note)
                if (remapped === null) return [] // drop
                event.note = remapped
                return [event]
            }
        }

        return [event]
    }

    process.reset = () => {
        state.bankMSB.fill(0)
        state.bankLSB.fill(0)
        state.program.fill(0)
        state.drumChannels.fill(0)
        state.drumChannels[9] = 1 // Reset default
    }
    process.setEnabled = (v) => state.enabled = Boolean(v)
    process.getState = () => ({
        globalMode: state.globalMode,
        configName: 'SoundCanvas to GM (Advanced)',
        drumChannels: state.drumChannels // Expose for SynthEngine
    })

    return process
}
