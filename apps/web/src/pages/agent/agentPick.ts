import type { EligibleAgent } from '@marutham/api-client';

/** The best default: the nearest on-duty agent within the radius, else a covering one. */
export function defaultAgentId(
  agents: EligibleAgent[],
  matchedIds: Set<string>,
  excludeId?: string,
): string {
  const ready = agents.filter((a) => a.ready_today && a.id !== excludeId);
  return (ready.find((a) => a.within_radius) || ready.find((a) => matchedIds.has(a.id)))?.id || '';
}
