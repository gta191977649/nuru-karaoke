import { Button } from 'react-bootstrap'

function Maintenance({ onBack }) {
  return (
    <div className="wiiScreen">
      <div className="wiiScreen__card">
        <div className="wiiScreen__title">メンテナンス</div>
        <div className="wiiScreen__subtitle">システム情報や更新履歴を確認できます。</div>
        <div className="wiiScreen__actions">
          <Button className="wiiBtn wiiScreen__back" type="button" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}

export default Maintenance
