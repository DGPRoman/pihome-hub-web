import type { AutomationRule } from '../api/types'

import styles from './RuleRow.module.css'

interface RuleRowProps {
  readonly rule: AutomationRule
}

function describe(rule: AutomationRule): string {
  const motion = rule.when.motion ? 'detects motion' : 'reports no motion'
  const hold =
    rule.then.holdSeconds === null ? '' : `, then reverts after ${String(rule.then.holdSeconds)}s`
  return `When ${rule.when.device} ${motion}, turn ${rule.then.state} ${rule.then.relay}${hold}.`
}

/** One rule, in a sentence. */
export function RuleRow({ rule }: RuleRowProps) {
  return (
    <li className={styles.row}>
      <div className={styles.header}>
        <span className={styles.id}>{rule.id}</span>
        {!rule.enabled && <span className={styles.badge}>Disabled</span>}
        {rule.onlyAfterDark && <span className={styles.badge}>After dark</span>}
      </div>
      <p className={styles.sentence}>{describe(rule)}</p>
    </li>
  )
}
