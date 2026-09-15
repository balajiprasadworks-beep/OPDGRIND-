# OPDGrind v2 — departmental charter (template)

Draft for the HOD to review, amend and sign before go-live. Nothing in
OPDGrind v2 should go live without this circulated to all staff first — see
build spec §1. This document is governance, not code: it records what the
department has agreed to, so the system is defensible the first time it is
questioned rather than the first time it is challenged in a dispute.

**Status:** draft — not yet signed or circulated.

## 1. Purpose

OPD patient-flow measurement and bottleneck identification, for the
Department of Cardiology. Staff workload analytics are a component of this,
not the primary aim: the system exists to find where patients wait and why,
not to rank clinicians against each other.

## 2. What is measured

The full metric list, defined in build spec §8:

- **Provenance and data quality** — live-capture rate, logging lag,
  burst signatures, correction rate, clock drift flags.
- **Throughput and time** — encounters by case type (new / review, never
  summed together), median encounter duration by case type, active
  clinical time, break time, attested called-away time, unassigned
  interval time, reassignment rate.
- **Queue-aware** (once the OPD register is being reconstructed) —
  queue-aware unassigned time, longest queue-aware interval, median
  door-to-doctor time, bottleneck attribution by source.
- **Department-level** — patients registered, patients seen, median
  door-to-doctor time by hour, longest bottleneck of the day, departmental
  live-capture compliance.

No composite single score is ever produced from these. See §4.

## 3. Who sees what

- **Every clinician** sees their own complete record, in real time —
  not a summary. Mandatory, not optional.
- **The HOD and one named deputy supervisor** see all profiles, all logs,
  in real time. View-only — no edit path exists for anyone, including
  them; corrections go through the workflow in §5.
- Every supervisor view of another person's data is logged and visible in
  an audit tab.
- **Reception's participation is not required.** Their workflow is
  unchanged; the existing registration register is photographed for queue
  reconstruction (see §6 sanctions below) rather than asking them to use
  the system.

## 4. Binding exclusions

Written into this charter as prohibitions, not aspirations:

- No phone or personal-device monitoring.
- No location tracking.
- No screenshots, screen recording, or keystroke logging.
- No inference or recording of what a person was doing during an
  unassigned interval.
- No composite single "efficiency score."
- No named public ranking or league table.
- No patient-identifiable data in any outbound message.

## 5. Correction and dispute routes

- **Corrections** — a clinician may request a correction to their own
  record with a mandatory reason (a reason code alone is never enough).
  Never self-approved, never peer-approved: only a supervisor or
  coordinator can approve one, and approval always adds a new record
  rather than changing the original, which is kept forever alongside it.
- **Disputes** — any clinician may formally contest their own figures.
  The route is to the HOD directly, logged, with the outcome recorded.

## 6. Sanctions required before build

Confirmed with the HOD before any of this is built:

- [ ] Reading and photographing the cardiology OPD registration register
      for departmental audit.
- [ ] Camera or scheduled photo capture at the reception desk, with a
      visible notice at the desk.
- [ ] Supervisor role assignment: the HOD, plus one named deputy for
      absences.

## 7. Retention and export policy

| Data | Retention |
| :- | :- |
| Event log | Life of project + review period |
| Register photographs | 90 days, then deleted |
| Register photo hashes | Permanent (proves what the page said without keeping the image) |
| Transcribed register data | Life of project (hashed OP numbers only) |
| Supervisor access log | Life of project |

No patient names are ever stored — only hashed OP numbers, hashed with a
server-side secret that never reaches the browser.

## 8. Review and sunset date

This project runs for **six months** from go-live. At that point the
department formally reviews it and decides to continue, amend, or stop.
Continuation requires an active decision — it is not the default.

*(This is distinct from the daily 5 PM technical session seal, which is an
operational close, not a governance decision.)*

## 9. Ownership

The HOD owns this system; the data is not the build team's to keep. Balaji
is a clinician-role user like everyone else and holds no supervisor
privileges — this is load-bearing, not a formality: a peer-operated
monitoring system is contestable on its face, and that objection has to be
unanswerable before deployment, not after.

## Recommended: register as a quality-improvement project

Registering this formally as a departmental quality-improvement project,
with the HOD as senior author, is the single highest-leverage governance
move available. OPD flow and door-to-doctor time reduction is a publishable
audit; it gives the project institutional cover and converts it from an
internal measurement exercise into a departmental contribution.

---

**Sign-off**

| Role | Name | Signature | Date |
| :- | :- | :- | :- |
| Head of Department | | | |
| Named deputy supervisor | | | |
