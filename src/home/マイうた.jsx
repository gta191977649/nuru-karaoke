import { Button } from 'react-bootstrap'

function MyUta({ onBack }) {
  return (
    <div className="wiiScreen">
      <div className="wiiScreen__card">
        <div className="wiiScreen__title">マイうた</div>
        <div className="wiiScreen__subtitle">お気に入りの曲や履歴をまとめて表示します。</div>
        <div className="wiiScreen__actions">
          <Button className="wiiBtn wiiScreen__back" type="button" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}

export default MyUta
