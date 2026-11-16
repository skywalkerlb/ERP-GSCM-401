# AGENTS.md: instructions for any AI agent (Codex, Cursor, others)

1. **Before editing anything**, read `README.md` and then `PROGRESS.md` from start to finish.
2. **After every edit**, add a changelog entry to `PROGRESS.md` using its template, and rewrite its Status, In-flight, Next Steps, and Open Questions sections. Update `README.md` if how the project works or the user's preferences (§8) changed.
3. **When the user corrects you**, follow README.md §9.3: record the rule in README §8, then find and fix every instance across the whole project, not just the one they pointed at.

The full protocol is in README.md §9. Don't copy the docs' content into this file.

**Enforced:** AI edit hooks require reading the project docs and remind agents to update PROGRESS.md and review UI changes (README §9.5). Git pulls and pushes have no project hook prerequisites; Git checks are optional advisories and must never block synchronization.

**Design system:** before any change, also read `design-system/DESIGN_SYSTEM.md` (and, for UI work, each component README in `design-system/components/`). Every UI/UX change must follow the Glazed design system (tokens only, Glazed components, both themes) unless the user explicitly says otherwise for that change. Approved one-offs are marked `ds-exception:` and logged in README §8.1.
