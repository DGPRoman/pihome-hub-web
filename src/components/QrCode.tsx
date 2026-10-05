import { useMemo } from 'react'

import { encodeQr } from '../lib/qr'

import styles from './QrCode.module.css'

interface QrCodeProps {
  /** What the code encodes. */
  readonly text: string
  /** What a screen reader says instead. The code is never the only way to the text. */
  readonly label: string
}

/** A QR code, drawn in the browser from `text`. */
export function QrCode({ text, label }: QrCodeProps) {
  // Encoding is the one expensive thing here, and the text does not change while a
  // countdown beside the code re-renders it every second.
  const { size, path } = useMemo(() => encodeQr(text), [text])

  return (
    <svg
      className={styles.code}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      // Square edges between modules. Antialiasing them leaves grey seams that
      // some cameras read as light modules.
      shapeRendering="crispEdges"
    >
      {/* Dark on light whatever the colour scheme. A code with the colours
          swapped is valid, and a good share of the cameras that will be pointed
          at this one do not read it. */}
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
