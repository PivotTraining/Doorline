// An offline mutation or GPS point must never be replayed as another agent.
// Both IDs are authenticated profile context, not editable URL parameters.
export function tenantStorageKey(kind, { orgId, repId } = {}) {
  if (!orgId || !repId || !["writes", "locations"].includes(kind)) return null;
  return `doorline_${kind}_v2_${orgId}_${repId}`;
}
