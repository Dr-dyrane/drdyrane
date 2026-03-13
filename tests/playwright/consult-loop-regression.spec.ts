import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

const buildOptionsForQuestion = (question: string) => {
  const normalized = question.toLowerCase();

  if (/changed since|how has|better|worse|improved/.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'worse', text: 'Slightly worse' },
        { id: 'same', text: 'No change' },
        { id: 'better', text: 'Slightly better' },
      ],
      allow_custom_input: true,
    };
  }

  if (/pattern|intermittent|constant|day|night/.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'night', text: 'Nighttime' },
        { id: 'intermittent', text: 'Intermittent' },
        { id: 'constant', text: 'Constant' },
      ],
      allow_custom_input: true,
    };
  }

  if (/danger signs|breathlessness|confusion|persistent vomiting|bleeding|chest pain/.test(normalized)) {
    return {
      mode: 'single',
      ui_variant: 'grid',
      options: [
        { id: 'none', text: 'None of these' },
        { id: 'breathless', text: 'Breathlessness' },
        { id: 'confusion', text: 'Confusion' },
      ],
      allow_custom_input: true,
    };
  }

  return {
    mode: 'single',
    ui_variant: 'grid',
    options: [
      { id: 'fever', text: 'Fever' },
      { id: 'aches', text: 'Body aches' },
      { id: 'chills', text: 'Chills' },
    ],
    allow_custom_input: true,
  };
};

test.describe('Consult Loop Regression', () => {
  test('progresses even when consult API repeats the same generic question', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.route('**/api/consult', async (route) => {
      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      const patientInput = String(requestBody?.patientInput || '');
      const normalizedInput = patientInput.toLowerCase();

      let status = 'active';
      if (/none of these|ready for summary|done/.test(normalizedInput)) {
        status = 'complete';
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Noted.',
          question: 'Which symptom stands out most right now?',
          soap_updates: {
            S: {
              chief_complaint: 'fever',
              last_input: patientInput,
            },
          },
          ddx: ['Malaria (ICD-10: B54)', 'Viral febrile illness (ICD-10: R50.9)'],
          agent_state: {
            phase: status === 'complete' ? 'resolution' : 'differential',
            confidence: 80,
            focus_area: 'Fever engine narrowing',
            pending_actions: ['Narrow differential'],
            last_decision: 'Loop-guard regression test',
            positive_findings: ['fever'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: true,
              status: status === 'complete' ? 'cleared' : 'pending',
              last_question: 'Which symptom stands out most right now?',
              last_response: patientInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 80,
          thinking: 'mock loop response',
          needs_options: true,
          lens_trigger: null,
          status,
        }),
      });
    });

    await page.route('**/api/options', async (route) => {
      const requestBody = route.request().postDataJSON() as { lastQuestion?: string };
      const question = String(requestBody?.lastQuestion || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildOptionsForQuestion(question)),
      });
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    const intake = page.getByPlaceholder('Describe your main concern...');
    await intake.fill('fever');
    await intake.press('Enter');

    for (let step = 0; step < 4; step += 1) {
      const option = page.locator('.option-button').first();
      await expect(option).toBeVisible();
      await option.click();
    }

    const doctorQuestions = await page.evaluate(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return [] as string[];
      try {
        const parsed = JSON.parse(raw);
        const conversation = parsed?.state?.conversation || [];
        return conversation
          .filter((entry: { role?: string }) => entry?.role === 'doctor')
          .map((entry: { metadata?: { question?: string }; content?: string }) =>
            String(entry?.metadata?.question || entry?.content || '').trim()
          )
          .filter(Boolean);
      } catch {
        return [] as string[];
      }
    });

    expect(doctorQuestions.length).toBeGreaterThanOrEqual(4);

    const normalized = doctorQuestions.map((question) =>
      question.toLowerCase().replace(/\s+/g, ' ').trim()
    );
    for (let index = 1; index < normalized.length; index += 1) {
      expect(normalized[index]).not.toBe(normalized[index - 1]);
    }

    expect(normalized.some((question) => /changed since|how has|better|worse/.test(question))).toBeTruthy();
    expect(
      normalized.some((question) => /pattern|intermittent|constant|day|night/.test(question))
    ).toBeTruthy();
    expect(
      normalized.some((question) =>
        /danger signs|breathlessness|confusion|persistent vomiting|bleeding|chest pain/.test(question)
      )
    ).toBeTruthy();
  });
});
