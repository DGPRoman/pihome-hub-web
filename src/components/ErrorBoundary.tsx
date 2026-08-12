import { Component, type ReactNode } from 'react'

import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly message: string | null
}

/**
 * Contains a rendering crash to the section it happened in.
 *
 * A component that throws while rendering unmounts the whole tree above it, so
 * without this a bug in one row takes the page down and the relays with it. Only a
 * class can catch that — there is still no hook equivalent — and the state is
 * deliberately not reset when new data arrives: re-rendering the thing that just
 * threw would loop. Recovery is the reader's decision, hence the button.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: describe(error) }
  }

  private readonly retry = () => {
    this.setState({ message: null })
  }

  override render(): ReactNode {
    if (this.state.message === null) {
      return this.props.children
    }

    return (
      <div role="alert">
        <p className={styles.failure}>This section stopped working: {this.state.message}</p>
        <button type="button" className={styles.retry} onClick={this.retry}>
          Try again
        </button>
      </div>
    )
  }
}

/**
 * Describe whatever was thrown.
 *
 * `throw` accepts any value, and a bundled dependency may not throw an `Error` at
 * all, so the message is read structurally rather than after an `instanceof` that
 * would also fail across realms.
 */
function describe(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { readonly message: unknown }).message)
  }
  return String(error)
}
