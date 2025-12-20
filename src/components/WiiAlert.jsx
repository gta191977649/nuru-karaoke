import { Alert, Fade } from 'react-bootstrap'
import { useEffect, useMemo, useState } from 'react'
import useAlertStore from '../state/alertStore.js'

function WiiAlert() {
  const alert = useAlertStore((state) => state.alert)
  const visible = useAlertStore((state) => state.visible)
  const hideAlert = useAlertStore((state) => state.hideAlert)
  const clearAlert = useAlertStore((state) => state.clearAlert)
  const [remainingMs, setRemainingMs] = useState(0)

  const timeoutMs = useMemo(() => Number(alert?.timeoutMs) || 0, [alert?.timeoutMs])

  useEffect(() => {
    if (!alert || !visible || timeoutMs <= 0) return
    const start = performance.now()
    const timer = setInterval(() => {
      const elapsed = performance.now() - start
      const next = Math.max(0, timeoutMs - elapsed)
      setRemainingMs(next)
      if (next <= 0) hideAlert()
    }, 200)
    return () => clearInterval(timer)
  }, [alert, visible, timeoutMs, hideAlert])

  useEffect(() => {
    if (!alert || !visible) return
    setRemainingMs(timeoutMs)
  }, [alert, visible, timeoutMs])

  const showTime = timeoutMs > 0
  const timeLabel = showTime ? `${Math.ceil(remainingMs / 1000)}s` : ''

  return (
    <Fade in={visible} onExited={clearAlert} mountOnEnter unmountOnExit>
      <div className="position-fixed top-0 start-50 translate-middle-x mt-3" style={{ zIndex: 1200 }}>
        <Alert
          variant={alert?.variant || 'primary'}
          className="d-flex align-items-center gap-3 mb-0 px-4 py-3 text-nowrap"
        >
          <div className="fw-semibold">{alert?.message || ''}</div>
          {showTime ? <div className="small opacity-75">{timeLabel}</div> : null}
        </Alert>
      </div>
    </Fade>
  )
}

export default WiiAlert
