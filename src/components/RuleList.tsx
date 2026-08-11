import type { AutomationRule } from '../api/types'

import styles from '../styles/list.module.css'

import { RuleRow } from './RuleRow'

interface RuleListProps {
  readonly rules: readonly AutomationRule[]
}

export function RuleList({ rules }: RuleListProps) {
  return (
    <ul className={styles.list}>
      {rules.map((rule) => (
        <RuleRow key={rule.id} rule={rule} />
      ))}
    </ul>
  )
}
