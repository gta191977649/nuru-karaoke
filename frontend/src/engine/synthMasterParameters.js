const SYSTEM_PARAMETER_NAMES = {
  masterGain: 'gain',
  transposition: 'keyShift',
}

const getSystemParameterName = (parameter) => SYSTEM_PARAMETER_NAMES[parameter] || parameter

export const setSynthMasterParameter = (synth, parameter, value) => {
  if (!synth) return false

  if (typeof synth.setSystemParameter === 'function') {
    synth.setSystemParameter(getSystemParameterName(parameter), value)
    return true
  }

  if (typeof synth.setMasterParameter === 'function') {
    synth.setMasterParameter(parameter, value)
    return true
  }

  return false
}

export const getSynthMasterParameter = (synth, parameter) => {
  if (!synth) return undefined

  const systemParameter = getSystemParameterName(parameter)
  if (synth.systemParameters && systemParameter in synth.systemParameters) {
    return synth.systemParameters[systemParameter]
  }

  if (typeof synth.getMasterParameter === 'function') {
    return synth.getMasterParameter(parameter)
  }

  return undefined
}
