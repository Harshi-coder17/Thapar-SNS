import type { HeadView } from "@/modules/societies";
import { formatDate } from "@/shared/format";

import type { HeadRow } from "./heads-panel";

const row = (head: HeadView): HeadRow => ({
  id: head.id,
  name: head.name,
  since: formatDate(head.grantedAt),
  until: head.revokedAt ? formatDate(head.revokedAt) : null,
  grantReason: head.grantReason,
  revokeReason: head.revokeReason,
});

/** Head grants with dates formatted on the server (India Standard Time), for the Heads panel. */
export const headRows = (heads: { active: HeadView[]; history: HeadView[] }) => ({ active: heads.active.map(row), history: heads.history.map(row) });
