import { SingingTechniqueDetector } from '../SingingTechniqueDetector.js'
import '../plugins/VibratoPlugin.js'
import '../plugins/KobushiPlugin.js'
import '../plugins/GlissandoPlugin.js'

let detector = null
let lastPublishedTime = -Infinity
let lastActiveState = ''
const getDetector = () => {
    if (!detector) detector = new SingingTechniqueDetector()
    return detector
}

function publish(events, requestId = null) {
    const activeTechniques = { ...getDetector().activeTechniques }
    const activeState = JSON.stringify(activeTechniques)
    const time = getDetector().lastTime ?? 0
    if (requestId == null && !Object.keys(events).length &&
        activeState === lastActiveState && time - lastPublishedTime < 0.05) return
    lastPublishedTime = time
    lastActiveState = activeState
    self.postMessage({
        type: 'update',
        events,
        activeTechniques,
        requestId,
    })
}

self.onmessage = ({ data }) => {
    const { type, payload, requestId } = data
    if (type === 'init') getDetector()
    else if (type === 'push') publish(getDetector().push(payload))
    else if (type === 'flush') publish(getDetector().flush(), requestId)
    else if (type === 'reset') {
        getDetector().reset()
        lastPublishedTime = -Infinity
        lastActiveState = ''
    }
    else if (type === 'stop') {
        publish(getDetector().flush())
        detector = null
    }
}
