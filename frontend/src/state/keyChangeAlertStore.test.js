import { beforeEach, describe, expect, it } from 'vitest'
import useKeyChangeAlertStore from './keyChangeAlertStore.js'

describe('keyChangeAlertStore', () => {
  beforeEach(() => {
    useKeyChangeAlertStore.setState({
      visible: false,
      value: 0,
      previousValue: 0,
      animationId: 0,
      timeoutMs: 2000,
    })
  })

  it('animates from the current value during consecutive key changes', () => {
    useKeyChangeAlertStore.getState().showKeyChangeAlert(1)
    useKeyChangeAlertStore.getState().showKeyChangeAlert(2)

    expect(useKeyChangeAlertStore.getState()).toMatchObject({
      visible: true,
      previousValue: 1,
      value: 2,
      animationId: 2,
    })
  })

  it('starts from the original key when the alert is shown again', () => {
    useKeyChangeAlertStore.getState().showKeyChangeAlert(-2)
    useKeyChangeAlertStore.getState().hideKeyChangeAlert()
    useKeyChangeAlertStore.getState().showKeyChangeAlert(3)

    expect(useKeyChangeAlertStore.getState()).toMatchObject({
      previousValue: 0,
      value: 3,
      animationId: 2,
    })
  })
})
