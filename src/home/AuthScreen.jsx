import { useEffect, useRef, useState } from 'react'
import { Button, Card, Col, Form, Row, Tab, Tabs } from 'react-bootstrap'
import WiiDialog from '../components/WiiDialog.jsx'
import useUserStore from '../state/userStore.js'

function AuthScreen({ onBack }) {
  const status = useUserStore((state) => state.status)
  const user = useUserStore((state) => state.user)
  const error = useUserStore((state) => state.error)
  const login = useUserStore((state) => state.login)
  const register = useUserStore((state) => state.register)
  const setGuest = useUserStore((state) => state.setGuest)
  const logout = useUserStore((state) => state.logout)
  const clearError = useUserStore((state) => state.clearError)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTitle, setDialogTitle] = useState('')
  const [dialogMessage, setDialogMessage] = useState('')

  const isLoading = status === 'loading'
  const wasAuthRef = useRef(status === 'authenticated')

  useEffect(() => {
    if (!onBack) return
    const wasAuth = wasAuthRef.current
    const isAuth = status === 'authenticated'
    if (!wasAuth && isAuth) {
      onBack()
    }
    wasAuthRef.current = isAuth
  }, [onBack, status])

  const extractErrorMessage = (err) => {
    const raw = String(err?.message || '')
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.detail) return parsed.detail
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([field, messages]) => {
            const list = Array.isArray(messages) ? messages.join(' / ') : String(messages)
            return `${field}: ${list}`
          })
          .join('\n')
      }
    } catch {
      // ignore
    }
    return raw || 'エラーが発生しました。'
  }

  return (
    <div className="wiiFind h-100 d-flex flex-column">
      <div className="wiiFind__header">
        <div className="wiiFind__hint">ログイン / 新規登録</div>
      </div>
      <Row className="g-3 flex-grow-1">
        <Col xs={12} lg={6}>
          <Card className="p-3 h-100">
            {status === 'authenticated' ? (
              <div className="d-flex flex-column gap-3">
                <div>
                  <div className="text-muted small">ログイン中</div>
                  <div className="fw-semibold fs-5">
                    {user?.profile?.display_name || user?.username}
                  </div>
                  <div className="text-muted small">{user?.email}</div>
                </div>
                <div className="d-flex gap-2">
                  <Button variant="danger" onClick={() => logout()}>ログアウト</Button>
                </div>
              </div>
            ) : (
              <>
                <Tabs
                  defaultActiveKey="login"
                  className="mb-3"
                  onSelect={() => clearError()}
                >
                  <Tab eventKey="login" title="ログイン">
                    <Form
                      onSubmit={(e) => {
                        e.preventDefault()
                        login(loginEmail, loginPassword).catch((err) => {
                          const message = extractErrorMessage(err)
                          setDialogTitle('ログイン失敗')
                          setDialogMessage(message)
                          setDialogOpen(true)
                        })
                      }}
                    >
                      <Form.Group className="mb-3">
                        <Form.Label>メール / ユーザー名</Form.Label>
                        <Form.Control
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>パスワード</Form.Label>
                        <Form.Control
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                      </Form.Group>
                      {error ? <div className="text-danger small mb-2">{error}</div> : null}
                      <Button type="submit" disabled={isLoading}>ログイン</Button>
                    </Form>
                  </Tab>
                  <Tab eventKey="register" title="新規登録">
                    <Form
                      onSubmit={(e) => {
                        e.preventDefault()
                        register(regUsername, regEmail, regPassword).catch((err) => {
                          const message = extractErrorMessage(err)
                          setDialogTitle('登録失敗')
                          setDialogMessage(message)
                          setDialogOpen(true)
                        })
                      }}
                    >
                      <Form.Group className="mb-3">
                        <Form.Label>ユーザー名</Form.Label>
                        <Form.Control
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>メール</Form.Label>
                        <Form.Control
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>パスワード</Form.Label>
                        <Form.Control
                          type="password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                        />
                      </Form.Group>
                      {error ? <div className="text-danger small mb-2">{error}</div> : null}
                      <Button type="submit" disabled={isLoading}>登録</Button>
                    </Form>
                  </Tab>
                </Tabs>
                <div className="text-muted small">Google ログインは後で追加できます。</div>
              </>
            )}
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="p-3 h-100 d-flex flex-column justify-content-between">
            <div>
              <h5>ゲストで試す</h5>
              <p className="text-muted small">
                ゲストは全国ランキング・マイうたに参加できません。
              </p>
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="outline-primary"
                onClick={() => {
                  setGuest()
                  if (onBack) onBack()
                }}
              >
                ゲストで開始
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
      <WiiDialog
        show={dialogOpen}
        title={dialogTitle}
        showActions={false}
        onClose={() => {
          setDialogOpen(false)
        }}
      >
        <div className="text-start" style={{ whiteSpace: 'pre-wrap' }}>
          {dialogMessage.split('\n').map((line, idx) => (
            <div key={idx} className="fw-semibold mb-1">
              {line}
            </div>
          ))}
        </div>
        <div className="mt-3 d-flex justify-content-center">
          <Button variant="secondary" type="button" onClick={() => {
            setDialogOpen(false)
          }}>
            閉じる
          </Button>
        </div>
      </WiiDialog>
    </div>
  )
}

export default AuthScreen
