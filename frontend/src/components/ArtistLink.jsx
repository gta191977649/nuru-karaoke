import useUiStore from '../state/uiStore.js'

function ArtistLink({ artist, className = '', children, onClick, ...props }) {
  const openArtist = useUiStore((state) => state.openArtist)
  const label = String(artist || '').trim()

  if (!label) return children || null

  return (
    <button
      type="button"
      className={`artistLink ${className}`.trim()}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
        if (!event.defaultPrevented) openArtist(label)
      }}
      aria-label={`${label} の曲一覧を開く`}
      {...props}
    >
      {children || label}
    </button>
  )
}

export default ArtistLink
