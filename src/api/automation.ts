import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { AutomationRule } from './types'

const RULES_PATH = '/v1/automation/rules'

/** Read every configured automation rule. Read-only: the hub declares them in YAML. */
export async function fetchRules(
  signal: AbortSignal | null = null,
): Promise<readonly AutomationRule[]> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(RULES_PATH, { method: 'GET' }, signal)
    return parseRuleCollection(await readJson(response))
  })
}

function parseTrigger(value: unknown): AutomationRule['when'] {
  if (!isRecord(value) || typeof value.device !== 'string' || typeof value.motion !== 'boolean') {
    throw malformed('automation data')
  }
  return { device: value.device, motion: value.motion }
}

function parseAction(value: unknown): AutomationRule['then'] {
  if (!isRecord(value) || typeof value.relay !== 'string') {
    throw malformed('automation data')
  }
  if (value.state !== 'on' && value.state !== 'off') {
    throw malformed('automation data')
  }
  const hold = value.hold_seconds
  if (hold !== null && hold !== undefined && !Number.isFinite(hold)) {
    throw malformed('automation data')
  }
  return {
    relay: value.relay,
    state: value.state,
    holdSeconds: typeof hold === 'number' ? hold : null,
  }
}

/** Exported for its tests. */
export function parseRule(body: unknown): AutomationRule {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw malformed('automation data')
  }
  if (typeof body.enabled !== 'boolean' || typeof body.only_after_dark !== 'boolean') {
    throw malformed('automation data')
  }
  return {
    id: body.id,
    enabled: body.enabled,
    onlyAfterDark: body.only_after_dark,
    when: parseTrigger(body.when),
    then: parseAction(body.then),
  }
}

export function parseRuleCollection(body: unknown): readonly AutomationRule[] {
  if (!isRecord(body) || !('rules' in body) || !Array.isArray(body.rules)) {
    throw malformed('automation data')
  }
  return body.rules.map((rule: unknown) => parseRule(rule))
}
