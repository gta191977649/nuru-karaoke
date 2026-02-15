import { Button, Modal } from 'react-bootstrap'

function WiiDialog({
  show,
  title,
  message,
  children,
  showActions = true,
  confirmLabel = '確認',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  onClose,
}) {
  return (
    <Modal show={show} centered backdrop="static" keyboard={false} onHide={onClose}>
      <Modal.Header>
        <Modal.Title className="w-100 text-center">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        {children ? children : <div className="fw-semibold">{message}</div>}
      </Modal.Body>
      {showActions ? (
        <Modal.Footer className="w-100 justify-content-between">
          <Button variant="secondary" className="px-4" type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="warning" className="px-4" type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Modal.Footer>
      ) : null}
    </Modal>
  )
}

export default WiiDialog
