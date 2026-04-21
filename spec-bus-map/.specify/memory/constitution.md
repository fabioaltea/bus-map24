<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Modified principles: N/A (initial adoption)
Added sections:
  - Core Principles (I–IV)
  - Development Workflow
  - Quality Gates & Review Process
  - Governance
Removed sections: N/A
Templates checked:
  - .specify/templates/plan-template.md     ✅ Constitution Check gate present; principles align
  - .specify/templates/spec-template.md     ✅ FR/SC structure consistent with quality & testing principles
  - .specify/templates/tasks-template.md    ✅ Task phases support TDD and performance validation patterns
  - .specify/templates/agent-file-template.md  ✅ No outdated principle references
  - .specify/templates/checklist-template.md   ✅ No conflicts
Deferred TODOs: None — all placeholders resolved.
-->

# Spec Bus Map Constitution

## Core Principles

### I. Code Quality

Every line of code MUST meet a consistent quality bar before it is merged.
All code MUST be:
- Readable without inline comments for standard patterns; non-obvious logic MUST include an explanatory comment
- Reviewed by at least one peer before merging to the main branch
- Free of linting violations and type errors (static analysis gates are non-negotiable)
- Structured to minimise coupling: modules MUST expose narrow, stable interfaces
- Refactored to remove duplication when the same logic appears in three or more places

**Rationale**: Sustainable velocity requires a codebase that any contributor can reason about
quickly. Quality debt compounds; catching it at review time is far cheaper than fixing it
after deployment.

### II. Testing Standards

Automated tests are a first-class deliverable, not an afterthought.

- Tests MUST be written before or alongside the feature code (TDD or concurrent TDD is
  acceptable; retrofitting tests after the fact is not)
- Every user-facing behaviour MUST have at least one acceptance-level test (Given/When/Then)
- Unit tests MUST cover all non-trivial business logic; coverage below 80 % on new code
  MUST be justified in the PR description
- Integration tests MUST cover inter-service contracts and any shared schema
- Tests MUST be deterministic: flaky tests MUST be fixed or removed immediately
- The test suite MUST pass in CI before any merge is permitted

**Rationale**: Tests are the primary mechanism by which we verify behaviour and prevent
regression. A green test suite is the minimal signal that a change is safe to ship.

### III. User Experience Consistency

Every interaction surface MUST feel like part of a single coherent product.

- All user-facing text (labels, error messages, notifications) MUST follow the established
  tone and vocabulary defined in the project glossary (to be maintained alongside this
  document)
- Visual and interaction patterns MUST reuse existing design tokens and components before
  introducing new ones; deviations require explicit justification in the spec
- Error states MUST always tell the user what went wrong, what they can do next, and
  whether they have lost any data
- Accessibility: all new UI MUST meet WCAG 2.1 AA as a baseline; deviations MUST be
  documented with a remediation plan
- Behaviour MUST be identical across supported environments; environment-specific
  workarounds MUST be tracked as known debt

**Rationale**: Inconsistency erodes trust. Users build mental models from repeated patterns;
breaking those patterns forces them to re-learn, increases error rates, and raises support
burden.

### IV. Performance Requirements

Performance is a correctness criterion, not a quality-of-life feature.

- Every user-facing operation MUST complete within 200 ms at p95 under the reference load
  profile (defined per feature in the spec)
- Background and batch operations MUST declare an expected duration ceiling in the spec;
  breaching it MUST trigger an alert, not a silent timeout
- New features MUST include a performance test or benchmark when they introduce a code path
  that is called more than once per user interaction
- Memory allocations MUST be profiled for any feature processing payloads larger than 1 MB
- Regressions detected by benchmarks MUST block merge unless explicitly accepted via a
  documented trade-off in the PR

**Rationale**: Performance problems are defects. Shipping a slow feature creates technical
debt that is disproportionately expensive to fix once users have built workflows around it.

## Development Workflow

- Features MUST be developed on a dedicated branch named with the sequential convention
  (`###-feature-name`) managed by the Git extension
- All work MUST start from a written specification (`spec.md`) and an implementation plan
  (`plan.md`) produced by the `/speckit.specify` and `/speckit.plan` commands
- Tasks MUST be generated from the plan before implementation begins; ad-hoc work outside
  the task list MUST be reflected back into the task list before the session ends
- Commits MUST be atomic: one logical change per commit; commit messages MUST reference
  the task ID (e.g., `T012 implement bus-stop entity model`)
- Pull requests MUST link to the relevant spec and include a completed checklist from
  `/speckit.checklist` before requesting review

## Quality Gates & Review Process

All merges MUST clear the following gates in order:

1. **Spec gate** — feature spec approved by the requester before coding starts
2. **Constitution check** — plan verified against all four principles (plan-template
   Constitution Check section MUST be completed)
3. **CI gate** — linting, type checks, and full test suite green
4. **Performance gate** — benchmarks within defined ceilings (or deviation accepted)
5. **Peer review** — at least one approving review from a contributor not on the original
   implementation

Bypassing any gate MUST be recorded as explicit debt with a linked remediation ticket.

## Governance

This constitution supersedes all other informal practices and conventions. In the event of
conflict, the constitution takes precedence.

**Amendment procedure**:
1. Propose the amendment as a PR modifying this file; include the rationale and a
   `Sync Impact Report` comment at the top
2. Increment the version according to semantic rules:
   - MAJOR — removal or redefinition of an existing principle
   - MINOR — new principle or materially expanded section
   - PATCH — clarifications, wording, or formatting fixes
3. PR must receive at least two approvals before merge
4. Update `LAST_AMENDED_DATE` to the merge date

**Compliance review**: Principles MUST be verified during every plan review (Constitution
Check gate). Any systemic pattern of non-compliance discovered in retrospectives MUST be
addressed in the next planning cycle.

Runtime development guidance for the Claude integration is available via the agent file
(`.specify/integrations/claude/`).

**Version**: 1.0.0 | **Ratified**: 2026-04-13 | **Last Amended**: 2026-04-13
