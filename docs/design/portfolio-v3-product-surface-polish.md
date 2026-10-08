# Papyr.us Product Surface Polish — Implementation Brief

**Issue:** #76  
**Branch:** `ui/issue-76-product-surface-polish`  
**Intent:** UI/UX and product-surface improvement only

## Objective

Make Papyr.us feel like one coherent small-team knowledge workspace rather than a collection of feature pages.

Primary journey:

```text
Workspace context
→ Documents
→ Read / Edit
→ Version history / Recovery
```

This journey receives the strongest visual hierarchy.

## Must preserve

- existing backend/API contracts;
- auth/team boundaries;
- GJ-01..GJ-08 behavior;
- D1 team creation/admission/revocation behavior;
- feature flags;
- mobile navigation;
- light/dark modes;
- current recovery semantics.

## Do not add

- backend features;
- new AI capabilities;
- SSO/OIDC;
- billing;
- organization hierarchy;
- invitation infrastructure;
- new role model;
- vector RAG;
- production-readiness claims;
- broad architecture refactors.

## Phase order

### Phase A — Shell / Navigation

Targets:
- `client/src/App.tsx`
- `client/src/components/layout/header.tsx`
- `client/src/components/layout/sidebar.tsx`

Goal:
- reduce top-level competition;
- make workspace context obvious;
- separate primary navigation from advanced/secondary tools;
- remove oversized Quick Actions stack as the dominant pattern.

Review gate:
- desktop shell screenshot;
- mobile drawer screenshot;
- active workspace/team visible;
- all existing routes still reachable.

### Phase B — Workspace / Documents

Target:
- `client/src/pages/home.tsx`

Goal:
- workspace first, not marketing hero;
- clear document list and primary create action;
- populated state must look useful;
- empty state must be compact and directional.

Review gate:
- populated team workspace screenshot;
- empty workspace screenshot.

### Phase C — Reader

Target:
- `client/src/pages/wiki-page.tsx`

Goal:
- readable content width;
- clear title/metadata/action hierarchy;
- Edit / History / secondary actions behave like one system;
- long-document typography improved.

Review gate:
- representative document reading screenshot.

### Phase D — Editor

Target:
- `client/src/pages/page-editor.tsx`

Goal:
- writing is primary;
- metadata is secondary;
- Save / Preview / Cancel states are obvious;
- no new editor feature.

Review gate:
- create and edit screenshots;
- existing create/update tests remain green.

### Phase E — Version History / Recovery

Target:
- `client/src/components/page-history.tsx`

Goal:
- current vs previous versions obvious;
- preview vs restore clearly separated;
- recovery remains deliberate.

Review gate:
- history panel screenshot;
- restore flow GJ-04 green.

### Phase F — Visual System / Responsive

Target:
- `client/src/index.css`
- shared UI composition where necessary

Goal:
- consistent spacing/radii/borders;
- restrained one-accent system;
- consistent loading/empty/error states;
- no decorative gradient sprawl;
- accessible focus remains visible.

Review gate:
- representative light/dark screenshots;
- mobile screenshot.

## Language rule

Touched core flows should not arbitrarily mix Korean and English.

Do not create a new localization platform in this milestone.

## Test discipline

After each phase:
- run the narrowest relevant tests first;
- fix only regressions introduced by this branch;
- preserve existing test selectors where practical;
- document any selector changes required for legitimate UX improvements.

Before final review:
- TypeScript / lint for changed code;
- relevant unit/integration suites;
- GJ-01..GJ-08;
- Portfolio V3 proof-capture workflow.

## Delivery

Do not merge automatically.

Open one implementation PR referencing #76 with:
- before/after screenshots;
- exact changed surfaces;
- tests actually executed;
- known limitations;
- no claim expansion.
