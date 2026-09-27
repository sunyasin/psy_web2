# Entrance Interview Implementation Plan

## Overview
Add a "Welcome/Entrance Interview" (code: `welcome`) as the first required step for new users. All other main menu buttons remain disabled until this interview is completed.

## Database Changes

### 1. Add Welcome Interview to `interview` table
Create migration to insert the welcome interview:
```sql
INSERT INTO interview (id, code, name, prompt, visible)
SELECT
  '00000000-0000-0000-0000-000000000003',
  'welcome',
  'Входное интервью',
  $prompt$Ты — психологический стратег. Проанализируй ответы на входное интервью и выдели ключевые внутренние конфликты, повторяющиеся паттерны и зоны роста.
  
  Формат ответа — строго JSON:
  {
    "key_tensions": ["напряжение 1", "напряжение 2"],
    "recurring_patterns": ["паттерн 1", "паттерн 2"],
    "tried_methods": ["метод 1", "метод 2"],
    "failed_aspects": ["что не сработало 1"],
    "target_reaction": "внутренняя реакция для изменения",
    "recommendation": "Краткая рекомендация куда двигаться дальше"
  }
  
  Правила:
  - Отвечай строго на русском
  - Не используй markdown, только чистый JSON
  - JSON должен быть валидным$prompt$,
  true
WHERE NOT EXISTS (SELECT 1 FROM interview WHERE code = 'welcome');
```

### 2. Add Welcome Interview Questions to `interview_config`
Create migration with 5 questions in a single block:
```sql
INSERT INTO interview_config (interview_id, block_number, block_name, is_conditional, trigger_question, questions, active)
SELECT 
  i.id,
  1,
  'Входное интервью',
  false,
  null,
  '[
    {"order": 1, "source_index": 1, "text": "Что сейчас в жизни вызывает наибольшее внутреннее напряжение?"},
    {"order": 2, "source_index": 2, "text": "Какую проблему вы пытались решить уже много раз, но она возвращается?"},
    {"order": 3, "source_index": 3, "text": "Что вы уже пробовали: психотерапию, медитацию, книги, коучинг, духовные практики?"},
    {"order": 4, "source_index": 4, "text": "Что именно не сработало?"},
    {"order": 5, "source_index": 5, "text": "Если бы можно было изменить одну внутреннюю реакцию — какую?"}
  ]'::jsonb,
  true
FROM interview i WHERE i.code = 'welcome';
```

## Frontend Changes

### 3. Create Welcome Interview Page (`app/welcome-interview/page.tsx`)
- New page specifically for the welcome interview (code: `welcome`)
- Reuse logic from `app/interview/page.tsx` but customized:
  - Only 1 block with 5 questions
  - After last question (question.completed === true):
    - Show "Перейти в главное меню" button instead of "Анализировать ответы"
    - Button navigates to `/` (main page)
    - Hide the welcome interview button from main menu after completion
  - Store completion status in localStorage or check via API

### 4. Update Main Page (`app/page.tsx`)
- Add welcome interview completion check in the initial `useEffect`
- Fetch completion status via `/api/interview/has-completed?client_uuid=...&interview_code=welcome`
- Show "Входное интервью" as FIRST button (always visible)
- Disable ALL other buttons until welcome interview is completed
- Hide "Входное интервью" button after completion (show checkmark or remove)
- When welcome interview completed, enable all other buttons

### 5. Update Interview Page Logic (if needed)
- Ensure the welcome interview uses the same flow but with custom completion handling
- The `analyzeInterviewAnswers` action may need to handle welcome interview differently (no AI analysis, just completion)

### 6. API Changes (if needed)
- The existing `/api/interview/has-completed` already supports `interview_code` parameter
- The existing `/api/interview/resolve-id` already supports resolving by code
- The existing `startInterview` action already supports custom `interviewId`
- No new API routes needed

## Flow

1. **New user** → `/welcome` (enter name) → `/` (main page)
2. **Main page loads** → checks `hasCompleted` for `welcome` interview
3. **If not completed**: Show "Входное интервью" button FIRST, all other buttons disabled
4. **Click "Входное интервью"** → `/interview?code=welcome` (or `/welcome-interview`)
5. **Answer 5 questions** → on last question completion:
   - Session status = "completed"
   - Show "Перейти в главное меню" button
   - Click → redirect to `/`
6. **Main page reloads** → welcome interview completed → hide welcome button, enable all other buttons

## Key Implementation Details

### Navigation to Welcome Interview
Option A: Use existing `/interview` page with `selected_interview_code=welcome`
Option B: Create dedicated `/welcome-interview` page (cleaner for custom completion UI)

**Recommendation**: Option B - dedicated page for cleaner separation of concerns.

### Button State Management
```typescript
// In app/page.tsx
const [welcomeCompleted, setWelcomeCompleted] = useState(false);

// Check on load
const welcomeRes = await fetch(`/api/interview/has-completed?client_uuid=${clientUuid}&interview_code=welcome`);
const welcomeData = await welcomeRes.json();
setWelcomeCompleted(welcomeData.completed);

// Render
<button disabled={!welcomeCompleted} className={!welcomeCompleted ? "opacity-50 cursor-not-allowed" : ""}>
  ...
</button>

// Welcome interview button - hidden when completed
{welcomeCompleted ? null : (
  <button onClick={() => window.location.href = "/welcome-interview"}>Входное интервью</button>
)}
```

### Welcome Interview Page Completion
```typescript
// In app/welcome-interview/page.tsx
// When question.completed === true (after 5th question)
{question.completed && (
  <button onClick={() => window.location.href = "/"} className="w-full bg-black text-white...">
    Перейти в главное меню
  </button>
)}
```

## Migration Files to Create
1. `supabase/migrations/20260927000001_add_welcome_interview.sql` - Add interview record
2. `supabase/migrations/20260927000002_add_welcome_interview_config.sql` - Add 5 questions

## Files to Create/Modify
1. **New**: `app/welcome-interview/page.tsx` - Welcome interview page
2. **Modify**: `app/page.tsx` - Main page with disabled buttons logic
3. **New**: 2 migration files for database

## Testing Checklist
- [ ] New user completes welcome flow → main page shows welcome interview button first
- [ ] Other buttons disabled until welcome interview completed
- [ ] Welcome interview has exactly 5 questions in correct order
- [ ] After 5th answer, "Перейти в главное меню" button appears (not "Анализировать")
- [ ] Clicking "Перейти в главное меню" redirects to `/`
- [ ] Main page now shows all buttons enabled, welcome interview button hidden
- [ ] Returning user (already completed) sees all buttons enabled immediately
- [ ] Dark mode works correctly
- [ ] Responsive design works

## Risks & Mitigations
- **Risk**: Interview session logic expects multiple blocks
  - **Mitigation**: Welcome interview uses single block, existing logic handles this (block 1 → completed)
- **Risk**: Analysis button logic triggers on completion
  - **Mitigation**: Custom welcome interview page bypasses analysis, shows menu button instead
- **Race condition**: User completes welcome interview but main page doesn't refresh
  - **Mitigation**: Redirect to `/` triggers full page reload, re-checks completion status