# Plan: Update UI for New JSON Response Structure (Short & Decomposition Interviews)

## Clarifications from User

1. **Selection model**: Same as before - user selects **one strategy per idea**. The new `stages[]` array corresponds to what was previously separate ideas. Each stage = one "idea" in the old structure.

2. **Backward compatibility**: **Not needed** - use only the new structure.

3. **API/DB**: Use the **same API** to update DB, extract needed fields from new JSON.

4. **Tags**: **Don't show tags** in UI.

## Structure Mapping

| Old (Current) | New | Mapping |
|---------------|-----|---------|
| `DecomposeIdea` (single) | `Stage` (in `stages[]`) | 1:1 - each stage becomes one selectable idea |
| `DecomposeIdea.strategies[]` | `Stage.strategies[]` | 1:1 - strategies within each stage |
| `DecomposeStrategy` | `Strategy` | Extended with new fields |
| `DecomposeStep` | `Step` | Add `duration` field |

## New Types to Define (lib/types.ts)

```typescript
// New response structure
interface NewStage {
  number: number;
  name: string;
  description: string;
  strategies: NewStrategy[];
}

interface NewStrategy {
  name: string;
  approach: string;
  resources: NewResource[];
  support: NewSupport[];
  steps: NewStep[];
  time_to_launch: NewTimeToLaunch;
  timeline: string;
  budget: string;
  investment: string;
  avoid: NewAvoid[];
  assumptions: string[];
}

interface NewResource { category: string; items: string[]; rationale: string; }
interface NewSupport { who: string; needed: boolean; description: string; }
interface NewStep { number: number; title: string; duration: string; estimated_days: number; description: string; }
interface NewTimeToLaunch { days_to_first_step: number; days_to_result: number; note: string; }
interface NewAvoid { rule: string; reason: string; }

interface NewResponse {
  title: string;
  description: string;
  tags: string[];
  stages: NewStage[];
}
```

## Implementation Tasks

### 1. Update Type Definitions (lib/types.ts)
- [ ] Add new types: `NewStage`, `NewStrategy`, `NewStep`, `NewResource`, `NewSupport`, `NewTimeToLaunch`, `NewAvoid`, `NewResponse`
- [ ] Remove/keep `ShortAnalysisResult`, `ShortAnalysisStrategy`, `ShortAnalysisStep` for other uses
- [ ] Export new types

### 2. Update UI Types in page.tsx
- [ ] Replace `DecomposeStep`, `DecomposeStrategy`, `DecomposeIdea`, `DecomposePayload` with new types
- [ ] `DecomposeIdea` → maps to `NewStage` (with added `id` for React keys)
- [ ] `DecomposeStrategy` → maps to `NewStrategy` (with added `id`, `strategy_index`)
- [ ] `DecomposeStep` → maps to `NewStep` (add `duration` field)
- [ ] `DecomposePayload.ideas` → `NewStage[]` (stages from response)
- [ ] Keep `PlannedIdeaInfo`, `PlanSelection`, `PlannedGoal` as-is

### 3. Update Data Fetching & Parsing
- [ ] Update initial load (useEffect) to parse new response structure
- [ ] Update `handleDecompose` to parse new response structure
- [ ] Transform `NewResponse.stages[]` → `DecomposeIdea[]` for UI state
- [ ] Each stage gets an `id` (use `stage-${number}`) and `idea_index` (array index)
- [ ] Each strategy gets `id` (use `${stageId}-${strategyIndex}`) and `strategy_index`

### 4. Update Strategy Selection UI
- [ ] Render each stage as a card (current idea card behavior)
- [ ] Within each stage card, show strategies as selectable buttons (current behavior)
- [ ] Display new strategy summary fields: `approach` (truncated), `timeline`, `budget`, `investment`
- [ ] Keep selection logic: `selected[idea_index] = strategy_index` (one per stage/idea)

### 5. Update Step Display
- [ ] Show `duration` field alongside `estimated_days` in step list
- [ ] Keep existing step rendering format

### 6. Add New Strategy Detail Sections (Collapsible)
- [ ] **Approach** - full text
- [ ] **Resources** - category, items, rationale
- [ ] **Support** - who, needed, description
- [ ] **Time to Launch** - days_to_first_step, days_to_result, note
- [ ] **Timeline** - full text
- [ ] **Budget** - full text
- [ ] **Investment** - full text
- [ ] **Avoid** - rule, reason list
- [ ] **Assumptions** - string list

### 7. Update Plan Submission
- [ ] `PlanSelection` stays: `{ idea_index: number; strategy_index: number }`
- [ ] Submission payload unchanged (API extracts what it needs from new JSON)
- [ ] No changes to `submitPlan` logic needed

## UI Changes Summary

### Removed
- Tags display (user requested not to show)

### Added/Modified
- Stage card shows `stage.name` as title, `stage.description` as description
- Strategy button shows: title, approach (preview), timeline, budget, investment, step count
- Strategy detail (on select/expand) shows all new fields in collapsible sections
- Step items show `duration` + `estimated_days`

## Validation
- [ ] Decompose loads and displays stages as idea cards
- [ ] Strategy selection works (one per stage)
- [ ] All new strategy fields render correctly
- [ ] Plan submission works with existing API
- [ ] No TypeScript errors