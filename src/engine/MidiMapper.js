
/**
 * Generic MIDI Mapper System
 *
 * Auto-detects MIDI standard and applies appropriate mapping configuration.
 */

import { detectMidiStandard } from './MidiStandardDetector.js'
import { createXGConverter } from './converters/XGConverter.js'
import { createSoundCanvasConverter } from './converters/SoundCanvasConverter.js'



/**
 * Registry of mapping configurations
 */
const MAPPINGS = {
    'XG': { type: 'factory', factory: createXGConverter },
    'GS': { type: 'factory', factory: createSoundCanvasConverter },
    'SC-88-ish': { type: 'factory', factory: createSoundCanvasConverter },
    // 'GM': null // No mapping needed for GM
}

/**
 * Creates a mapper function.
 * @param {ArrayBuffer|null} buffer - MIDI file buffer for auto-detection.
 * @param {Object} options - Manual overrides (e.g. forceStandard).
 */
export function createMidiMapper(buffer, options = {}) {
    let mappingEntry = null
    let detectedStandard = 'GM'
    let detectionReasons = []
    let detectedVariant = null
    let convertSC88 = false

    if (buffer) {
        const detection = detectMidiStandard(buffer)
        detectedStandard = detection.standard
        detectionReasons = detection.reasons
        detectedVariant = detection.gsVariant
        convertSC88 = detection.convertSC88
        console.log(`[MidiMapper] Detected: ${detectedStandard} (${detectedVariant || 'Std'})`, detectionReasons, { convertSC88 })
    }

    if (detectedStandard === 'GS') {
        // Strict SC-88 gating: Only convert if explicit SC-88 flag is true
        if (convertSC88 && MAPPINGS['GS']) {
            mappingEntry = MAPPINGS['GS']
        }
        // Else: mappingEntry remains null -> Identity Mapper (Plain GS)
    } else if (MAPPINGS[detectedStandard]) {
        mappingEntry = MAPPINGS[detectedStandard]
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
            configName: 'None (Identity)'
        })
        noOp.reset = () => { }
        return noOp
    }

    // Instantiate Mapper
    let mapper = null
    if (mappingEntry.type === 'factory') {
        mapper = mappingEntry.factory(options)
    } else {
        console.error('Unknown mapping type', mappingEntry)
        return createMidiMapper(null) // Generic fallback
    }

    // Wrap to ensure getState has Standard info
    const originalGetState = mapper.getState
    mapper.getState = () => ({
        ...originalGetState(),
        detectedStandard,
        detectedVariant
    })

    return mapper
}
