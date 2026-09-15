
/**
 * Generic MIDI Mapper System
 *
 * Auto-detects MIDI standard and applies appropriate mapping configuration.
 */

import { detectMidiStandard, detectDrumChannels, MIDI_STANDARDS } from './MidiStandardDetector.js'
import { createSmfKnifeConverter, parseSmfKnifeConfig } from './converters/SmfKnifeConverter.js'
import { createXGOver55EventMapper } from './plugins/xg-over-55/XGOver55Engine.js'
import sc88Sc55CfgText from './smf/88ish/SC88SC55.CFG?raw'
const STANDARD_MAPPINGS = {
    GS_88: { type: 'smfknife', name: 'SC88SC55.CFG', text: sc88Sc55CfgText },
    // GM/GM2: no mapping by default
}

const SMF_CONFIG_CACHE = new Map()

function getSmfKnifeConfigForStandard(standard, gsModule) {
    const entry = standard === MIDI_STANDARDS.GS
        ? (gsModule === '88PRO' ? STANDARD_MAPPINGS.GS_88PRO : (gsModule === '88' ? STANDARD_MAPPINGS.GS_88 : null))
        : STANDARD_MAPPINGS[standard]
    if (!entry || entry.type !== 'smfknife') return null
    const cacheKey = entry.name
    if (SMF_CONFIG_CACHE.has(cacheKey)) return SMF_CONFIG_CACHE.get(cacheKey)
    try {
        const parsed = parseSmfKnifeConfig(entry.text, { name: entry.name })
        SMF_CONFIG_CACHE.set(cacheKey, parsed)
        return parsed
    } catch (err) {
        console.warn('[MidiMapper] Failed to parse default SMF Knife config', err)
        return null
    }
}

/**
 * Creates a mapper function.
 * @param {ArrayBuffer|null} buffer - MIDI file buffer for auto-detection.
 * @param {Object} options - Manual overrides. XG supports xgVoiceProfile
 * ('conservative'|'passthrough'), xgEffectProfile and drumBalanceProfile.
 */
export function createMidiMapper(buffer, options = {}) {
    let mappingEntry = null
    let detectedStandard = MIDI_STANDARDS.SMF
    let detectionReasons = []
    let detectedVariant = null
    let convertSC88 = false
    let detectedModule = null
    let smfKnifeConfig = options.smfKnifeConfig || null
    let resolvedStandard = detectedStandard
    let initialDrumChannels = options.initialDrumChannels || null

    if (buffer) {
        const detection = detectMidiStandard(buffer)
        detectedStandard = detection.standard
        detectionReasons = detection.reasons
        detectedVariant = detection.gsVariant
        convertSC88 = detection.convertSC88
        detectedModule = detection.gsModule || null
        console.log(`[MidiMapper] Detected: ${detectedStandard} (${detectedVariant || 'Std'})`, detectionReasons, { convertSC88 })
        if (!initialDrumChannels) {
            initialDrumChannels = detectDrumChannels(buffer)
        }
    }

    resolvedStandard = detectedStandard

    if (!smfKnifeConfig && options.smfKnifeConfigText) {
        try {
            smfKnifeConfig = parseSmfKnifeConfig(options.smfKnifeConfigText, {
                name: options.smfKnifeConfigName,
            })
        } catch (err) {
            console.warn('[MidiMapper] Failed to parse SMF Knife config', err)
        }
    }

    if (!smfKnifeConfig) {
        smfKnifeConfig = getSmfKnifeConfigForStandard(resolvedStandard, detectedModule)
    }

    if (smfKnifeConfig) {
        const sourceHint = smfKnifeConfig.sourceHint
        const matchesStandard = sourceHint && (
            sourceHint === resolvedStandard ||
            (resolvedStandard === MIDI_STANDARDS.GS && sourceHint === MIDI_STANDARDS.GS)
        )
        const shouldUseSmfKnife = options.forceSmfKnife || matchesStandard
        if (shouldUseSmfKnife) {
            if (resolvedStandard === MIDI_STANDARDS.GS && !(detectedModule === '88' || detectedModule === '88PRO')) {
                mappingEntry = null
            } else {
                mappingEntry = { type: 'smfknife', config: smfKnifeConfig }
            }
        }
    }

    if (!mappingEntry && resolvedStandard === MIDI_STANDARDS.XG) {
        mappingEntry = {
            type: 'factory',
            factory: () => createXGOver55EventMapper(buffer, { ...options, initialDrumChannels }),
        }
    }

    if (!mappingEntry) {
        // Identity Mapper
        const noOp = (event) => [event]
        noOp.setEnabled = () => { }
        noOp.setPreferGsPlayback = () => { }
        noOp.getState = () => ({
            globalMode: detectedStandard,
            detectedStandard,
            detectedBy: 'auto-detect',
            configName: 'None (Identity)',
            drumChannels: initialDrumChannels || new Uint8Array(16),
            detectedModule
        })
        noOp.reset = () => { }
        return noOp
    }

    // Instantiate Mapper
    let mapper = null
    if (mappingEntry.type === 'factory') {
        mapper = mappingEntry.factory(options)
    } else if (mappingEntry.type === 'smfknife') {
        mapper = createSmfKnifeConverter(mappingEntry.config, {
            ...options,
            ignoreEq: true,
            ignoreFx: true,
            initialDrumChannels,
        })
    } else {
        console.error('Unknown mapping type', mappingEntry)
        return createMidiMapper(null) // Generic fallback
    }

    // Wrap to ensure getState has Standard info
    const originalGetState = mapper.getState
    mapper.getState = () => ({
        ...originalGetState(),
        detectedStandard,
        detectedVariant,
        detectedModule
    })

    return mapper
}
