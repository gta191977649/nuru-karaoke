import { Fade } from 'react-bootstrap'
import { useEffect, useMemo } from 'react'
import useKeyChangeAlertStore from '../state/keyChangeAlertStore.js'
import './KeyChangeAlert.css'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function KeyChangeAlert() {
  const visible = useKeyChangeAlertStore((state) => state.visible)
  const value = useKeyChangeAlertStore((state) => state.value)
  const timeoutMs = useKeyChangeAlertStore((state) => state.timeoutMs)
  const hide = useKeyChangeAlertStore((state) => state.hideKeyChangeAlert)
  const clear = useKeyChangeAlertStore((state) => state.clearKeyChangeAlert)

  const dots = useMemo(() => Array.from({ length: 13 }, (_, i) => i - 6), [])
  const selectedIndex = clamp(Math.round(value) + 6, 0, dots.length - 1)

  useEffect(() => {
    if (!visible || timeoutMs <= 0) return
    const timer = setTimeout(() => hide(), timeoutMs)
    return () => clearTimeout(timer)
  }, [visible, timeoutMs, value, hide])

  return (
    <Fade in={visible} onExited={clear} mountOnEnter unmountOnExit>
      <div
        className="position-fixed top-0 start-50 translate-middle-x mt-3"
        style={{ zIndex: 1200, top: '-30px' }}
      >
        <div className="keyAlert">
          <div className="keyAlert__label">キー</div>
          <div className="keyAlert__track">
            <div className="keyAlert__circle">♭</div>
            <div className="keyAlert__dots">
              {dots.map((dotValue, idx) => {
                const isSelected = value !== 0 && idx === selectedIndex
                const isOrigin = dotValue === 0
                const isIndicator = idx === selectedIndex
                return (
                  <div
                    key={dotValue}
                    className={`keyAlert__dot ${isSelected ? 'keyAlert__dot--selected' : ''}`}
                  >
                    {isIndicator ? (
                      <div className="keyAlert__indicator">
                        <svg
                          className="keyAlert__triangle"
                          viewBox="0 0 24 20"
                          role="presentation"
                          aria-hidden="true"
                        >
                          <polygon points="12,20 0,0 24,0" fill="#d32f2f" stroke="#ffffff" strokeWidth="2" />
                        </svg>
                      </div>
                    ) : null}
                    {isOrigin ? (
                      <div className="keyAlert__origin">
                        <div className="keyAlert__originCircle">原</div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="keyAlert__circle">♯</div>
          </div>
        </div>
      </div>
    </Fade>
  )
}

export default KeyChangeAlert
