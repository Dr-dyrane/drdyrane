import { expect, test, type Page } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

const PATTERN_QUESTION = 'What pattern do you notice most: day, night, intermittent, or constant?';
const PATTERN_INTENT_REGEX = /\b(pattern|intermittent|constant|day|night|come and go)\b/i;

const readLatestDoctorQuestion = async (page: Page) =>
  page.evaluate(() => {
    const host = window as Window & {
      __drDyraneClinical?: {
        getState: () => {
          conversation: Array<{
            role?: string;
            metadata?: { question?: string };
            content?: string;
          }>;
        };
      };
    };
    const fromState = host.__drDyraneClinical?.getState?.().conversation;
    if (Array.isArray(fromState) && fromState.length > 0) {
      for (let index = fromState.length - 1; index >= 0; index -= 1) {
        const entry = fromState[index];
        if (entry?.role !== 'doctor') continue;
        return String(entry?.metadata?.question || entry?.content || '').trim();
      }
    }

    const raw = localStorage.getItem('dr_dyrane.v2.session');
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      const conversation = Array.isArray(parsed?.state?.conversation)
        ? parsed.state.conversation
        : [];
      for (let index = conversation.length - 1; index >= 0; index -= 1) {
        const entry = conversation[index];
        if (entry?.role !== 'doctor') continue;
        return String(entry?.metadata?.question || entry?.content || '').trim();
      }
      return '';
    } catch {
      return '';
    }
  });

test.describe('Consult Contradiction Progression', () => {
  test('allows targeted intent re-ask when patient gives contradiction update', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.route('**/api/consult', async (route) => {
      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      const input = String(requestBody?.patientInput || '');
      const status = /ready for summary/i.test(input) ? 'complete' : 'active';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Noted.',
          question: PATTERN_QUESTION,
          soap_updates: {
            S: {
              chief_complaint: 'fever',
              last_input: input,
            },
          },
          ddx: ['Malaria (ICD-10: B54)', 'Viral febrile illness (ICD-10: R50.9)'],
          agent_state: {
            phase: status === 'complete' ? 'resolution' : 'assessment',
            confidence: 76,
            focus_area: 'Pattern clarification',
            pending_actions: ['Resolve fever pattern timeline'],
            last_decision: 'Contradiction progression check',
            positive_findings: ['fever'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: false,
              status: 'idle',
              last_question: PATTERN_QUESTION,
              last_response: input,
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 76,
          thinking: 'mock contradiction progression',
          needs_options: true,
          lens_trigger: null,
          status,
        }),
      });
    });

    await page.route('**/api/options', async (route) => {
      const requestBody = route.request().postDataJSON() as { lastQuestion?: string };
      const question = String(requestBody?.lastQuestion || '').toLowerCase();

      if (/pattern|intermittent|constant|day|night/.test(question)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            mode: 'single',
            ui_variant: 'grid',
            options: [
              { id: 'day', text: 'Daytime' },
              { id: 'night', text: 'Nighttime' },
              { id: 'intermittent', text: 'Intermittent' },
              { id: 'constant', text: 'Constant' },
            ],
            allow_custom_input: true,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
            { id: 'unsure', text: 'Not sure' },
          ],
          allow_custom_input: true,
        }),
      });
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    const intake = page.getByPlaceholder('Describe your main concern...');
    await expect(intake).toBeVisible();
    await intake.fill('fever');
    await intake.press('Enter');

    await expect(page.getByText('Nighttime')).toBeVisible();
    const responseBox = page.getByPlaceholder('Type your response...');
    await responseBox.fill('Nighttime');
    await responseBox.press('Enter');

    await expect
      .poll(async () => (await readLatestDoctorQuestion(page)).length, { timeout: 5000 })
      .toBeGreaterThan(0);
    const afterNonContradiction = await readLatestDoctorQuestion(page);
    expect(afterNonContradiction).not.toBe(PATTERN_QUESTION);

    await responseBox.fill('Actually now it is constant all day.');
    await responseBox.press('Enter');

    await expect
      .poll(
        async () => {
          const latest = await readLatestDoctorQuestion(page);
          return latest !== afterNonContradiction ? latest : '';
        },
        { timeout: 5000 }
      )
      .not.toBe('');
    const afterContradiction = await readLatestDoctorQuestion(page);
    expect(PATTERN_INTENT_REGEX.test(afterContradiction)).toBeTruthy();
    expect(afterContradiction).toBe(PATTERN_QUESTION);
  });
});
