# buildai

Tooling for field collection of first-person video of people doing real physical work, recorded on a capture cap. It covers registering participants, taking consent, logging captures, and getting footage off the caps.

The source of truth for all rules below is the client's **Collection Brief v1.5** (12 Aug 2026). It is confidential: keep this repo private and do not share the brief outside the organisation.

## How a collection day works

1. **Charge:** every cap is fully charged overnight. Each one records 8 to 10 hours.
2. **Approach:** the field team finds workers on site.
3. **Consent:** the participant is registered and gives consent in the collection app. No consent, no recording.
4. **Record:** the participant wears the cap through their working day. The capture is logged against them in the app.
5. **Collect and pay:** caps are recovered and counted at the end of the day, and the participant is paid the same day.
6. **Upload:** back at base, caps are offloaded through the ingest hardware. This needs a stable 300 Mbps to 1 Gbps connection, or a backlog builds up.

## Rules the tooling must enforce

| Rule | Limit |
|---|---|
| Usable hours per participant | 10 in total. Hours past 10 are neither usable nor paid, so track them per person. |
| Share of hours from any one environment category | 15% at most |
| Distinct environment categories | At least 8 |
| Consent | Must be recorded before any capture |
| Homes | Not allowed |
| Restricted sites: healthcare, religious sites, schools and places for children, banks and legal offices, government and police premises, anywhere people may be undressed | Need the client's written approval first. Footage collected without it is destroyed and not paid. |

Every clip is tagged with:

- **Environment category:** one of 26 fixed values (Brief, Appendix A). Do not add new ones. Ask the client rather than using "Other".
- **Job:** one of 235 fixed values (Brief, Appendix B). Use the closest match.

## Setup

_To be added: tech stack, install steps, and how to run it._
