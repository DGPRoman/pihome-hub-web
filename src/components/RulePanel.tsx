import { useRules } from '../hooks/useRules'

import { DataPanel } from './DataPanel'
import { RuleList } from './RuleList'

/** The automation section. Read-only: the hub declares its rules in a config file. */
export function RulePanel() {
  const rules = useRules()

  return (
    <DataPanel
      heading="Automation"
      query={rules}
      loadingMessage="Reading automation rules…"
      emptyMessage="No automation rules are configured on the hub."
      isEmpty={(list) => list.length === 0}
    >
      {(list) => <RuleList rules={list} />}
    </DataPanel>
  )
}
