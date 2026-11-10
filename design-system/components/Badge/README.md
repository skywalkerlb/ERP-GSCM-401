# Badge
A small pill showing a status or category, with a leading dot.

**Provide:** `children` (one or two words, sentence case), `tone`, optional `dot={false}`.

| tone | use for | example |
| --- | --- | --- |
| `success` | done, healthy | Received, Paid, Active |
| `info` | in progress | In transit, Pending approval |
| `warning` | needs attention soon | Low stock, Partial |
| `danger` | failed, late, blocked | Overdue, Failed |
| `accent` | highlight, not a state | Priority, New |
| `neutral` | inactive, default | Draft, Archived |

- Always include the word — color alone never carries the status.
- Keep the mapping of status → tone identical across every module of the ERP.
