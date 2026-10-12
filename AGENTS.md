# Platum project instructions

## Canonical context

- [PROJECT_STATE.md](PROJECT_STATE.md) is the sole maintained project-wide implementation snapshot and Stage 4 document. Read relevant sections for the task; after authorized material implementation changes, update only the affected state sections and identify partial updates accurately.
- Supplementary implementation-state mappings are **not configured**. The fixed concept-only context documents are [Stage 1](../Projects/Platum/Platum%20%E2%80%94%20Stage%201_%20Project%20Philosophy%20and%20Foundation.md), [Stage 2](../Projects/Platum/Platum%20%E2%80%94%20Stage%202_%20Desired%20Platform%20and%20Product%20Concept.md), and [Stage 3](../Projects/Platum/Platum%20%E2%80%94%20Stage%203_%20First%20Practical%20MVP.md). They provide background only; they do not establish implementation or create a backlog. Consult them only when relevant.
- [README.md](README.md) holds setup, safe local checks, and release guidance. Read only the documentation relevant to the current task; source code and current user instructions govern implementation decisions.

## Product and repository boundaries

- The canonical product name is **Platum**. Legacy names such as Cabinet and Client Cabinet may remain in code, URLs, storage keys, infrastructure, and history. Do not rename technical identifiers or change infrastructure for branding alone.
- This repository contains the independent, agency-neutral client workspace platform. Keep agency websites, landing pages, and marketing assets in their own projects. Connect them through external links or documented integrations.
- Preserve workspace isolation through authenticated identity and authorization. Use only Platum-assigned infrastructure and credentials; never reuse another project's database, users, or service credentials.
- Do not commit private client source folders or temporary working folders. Do not expose secrets or private client data in public assets or documentation.
- The configured production target is https://client-cabinet.vercel.app; source files do not prove current deployment or provider state.
- Stage 1–3 describe context, not automatic implementation scope. The current task defines the requested work within these boundaries.

## Checks and delivery

- Existing local checks are node scripts/check-integrity.js and npm --prefix bot test; database checks and setup requirements are documented in README.md. Run only relevant, safe checks.
- Documentation or review work does not authorize application changes, production mutations, commits, pushes, or deployments.
