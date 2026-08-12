import type { UseQueryResult } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'

import styles from './DataPanel.module.css'
import { ErrorBoundary } from './ErrorBoundary'

interface DataPanelProps<T> {
  readonly heading: string
  readonly query: UseQueryResult<T>
  readonly loadingMessage: string
  readonly emptyMessage: string
  readonly isEmpty: (data: T) => boolean
  /** Optional control beside the heading, for whatever acts on the section as a whole. */
  readonly action?: ReactNode
  /** Renders the data. Only called once there is data to render. */
  readonly children: (data: T) => ReactNode
}

/**
 * A titled section that reports what became of a query.
 *
 * Generic over the data, so relays and sensors share one account of what loading,
 * failing, being empty and being stale look like. Getting those four right once is
 * the point: they are where an interface usually lies about what it knows.
 */
export function DataPanel<T>({
  heading,
  query,
  loadingMessage,
  emptyMessage,
  isEmpty,
  action,
  children,
}: DataPanelProps<T>) {
  // Generated rather than hardcoded, so two panels on one page cannot collide on
  // the id that ties this section to its own heading.
  const headingId = useId()

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      {/* The action sits outside the boundary below: a control over the whole
          section should survive the contents it acts on. */}
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          {heading}
        </h2>
        {action}
      </div>
      {/* Inside the section, so a crash keeps its heading and the sections beside
          it keep working. Which is the whole point: a bug in the sensor rows must
          not take away the switch for the porch light. */}
      <ErrorBoundary>
        <Body
          query={query}
          loadingMessage={loadingMessage}
          emptyMessage={emptyMessage}
          isEmpty={isEmpty}
        >
          {children}
        </Body>
      </ErrorBoundary>
    </section>
  )
}

function Body<T>({
  query,
  loadingMessage,
  emptyMessage,
  isEmpty,
  children,
}: Omit<DataPanelProps<T>, 'heading'>) {
  // Data first, deliberately. A background poll that fails sets `status` to
  // 'error' while the cached data is still sitting there, so branching on status
  // alone would blank a working list because one refresh went missing. The last
  // known state, labelled as such, is more useful than nothing.
  if (query.data !== undefined) {
    return (
      <>
        {query.isError && (
          <p className={styles.warning} role="alert">
            {query.error.message} Showing the last state the hub reported.
          </p>
        )}
        {isEmpty(query.data) ? <p className={styles.note}>{emptyMessage}</p> : children(query.data)}
      </>
    )
  }

  // Nothing has ever arrived, so there is nothing to fall back to.
  if (query.isError) {
    return (
      <p className={styles.error} role="alert">
        {query.error.message}
      </p>
    )
  }

  // role="status" announces politely, without interrupting; the failures above
  // use role="alert", which interrupts — a spinner has not earned that.
  return (
    <p className={styles.note} role="status">
      {loadingMessage}
    </p>
  )
}
