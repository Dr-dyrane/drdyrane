import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Summary Progression', () => {
  test('summary-ready selection advances to final safety/finalize path instead of generic loop', async ({
    page,
  }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const summaryQuestion =
          'What other detail should I clarify before I summarize your working diagnosis?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.ddx = ['Malaria (ICD-10: B54)', 'Viral febrile illness (ICD-10: R50.9)'];
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever with chills for 2 days',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: summaryQuestion,
            timestamp: now - 1,
            metadata: {
              statement: 'I can summarize now.',
              question: summaryQuestion,
            },
          },
        ];
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'summary-ready', text: 'Ready for summary', category: 'summary' },
            { id: 'summary-add-detail', text: 'Add one detail', category: 'summary' },
            { id: 'summary-not-sure', text: 'Not sure', category: 'summary' },
          ],
          allow_custom_input: true,
          context_hint: 'Choose to summarize now or add one last detail.',
        };
        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    let lastConsultInput = '';

    await page.route('**/api/consult', async (route) => {
      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      lastConsultInput = String(requestBody?.patientInput || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Noted.',
          question: 'Which associated symptom stands out most right now?',
          soap_updates: { S: { chief_complaint: 'fever' } },
          ddx: ['Malaria (ICD-10: B54)', 'Viral febrile illness (ICD-10: R50.9)'],
          agent_state: {
            phase: 'differential',
            confidence: 83,
            focus_area: 'Fever narrowing',
            pending_actions: ['Clarify associated symptom'],
            last_decision: 'generic question from upstream mock',
            positive_findings: ['fever', 'chills'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: false,
              status: 'idle',
              last_question: 'Which associated symptom stands out most right now?',
              last_response: lastConsultInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 83,
          thinking: 'upstream generic question',
          needs_options: true,
          lens_trigger: null,
          status: 'active',
        }),
      });
    });

    await page.route('**/api/options', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'single',
          ui_variant: 'grid',
          options: [
            { id: 'headache', text: 'Headache' },
            { id: 'chills', text: 'Chills' },
            { id: 'nausea', text: 'Nausea' },
            { id: 'none', text: 'None stand out' },
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

    await expect(
      page.getByText('What other detail should I clarify before I summarize your working diagnosis?')
    ).toBeVisible();
    await page.locator('.option-button', { hasText: 'Ready for summary' }).first().click();

    await expect.poll(() => lastConsultInput).toBe('Ready for summary');
    await expect(
      page.getByText(
        'Before I finalize, any danger signs now: confusion, fainting, breathing trouble, chest pain, persistent vomiting, or bleeding?'
      )
    ).toBeVisible();
    await expect(
      page.getByText('Which associated symptom stands out most right now?')
    ).toHaveCount(0);
  });

  test('summary-ready with cleared safety checkpoint advances to finalize confirmation without clarifier loop', async ({
    page,
  }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const dangerQuestion =
          'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?';
        const summaryQuestion =
          'What other detail should I clarify before I summarize your working diagnosis?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.ddx = ['Malaria (ICD-10: B54)', 'Viral febrile illness (ICD-10: R50.9)'];
        envelope.state.agent_state = {
          ...(envelope.state.agent_state || {}),
          phase: 'resolution',
          confidence: 86,
          focus_area: 'Final summary readiness',
          pending_actions: ['Finalize plan'],
          last_decision: 'Safety checkpoint already cleared',
          positive_findings: ['fever', 'chills', 'night pattern'],
          negative_findings: ['danger signs denied'],
          must_not_miss_checkpoint: {
            required: false,
            status: 'cleared',
            last_question: dangerQuestion,
            last_response: 'None of these',
            updated_at: now - 2000,
          },
        };
        envelope.state.conversation = [
          {
            id: `patient-a-${now - 5}`,
            role: 'patient',
            content: 'fever with chills',
            timestamp: now - 5,
          },
          {
            id: `doctor-a-${now - 4}`,
            role: 'doctor',
            content: dangerQuestion,
            timestamp: now - 4,
            metadata: {
              statement: 'I need one safety check.',
              question: dangerQuestion,
            },
          },
          {
            id: `patient-b-${now - 3}`,
            role: 'patient',
            content: 'None of these',
            timestamp: now - 3,
          },
          {
            id: `doctor-b-${now - 2}`,
            role: 'doctor',
            content: summaryQuestion,
            timestamp: now - 2,
            metadata: {
              statement: 'I can summarize now.',
              question: summaryQuestion,
            },
          },
        ];
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'summary-ready', text: 'Ready for summary', category: 'summary' },
            { id: 'summary-add-detail', text: 'Add one detail', category: 'summary' },
            { id: 'summary-not-sure', text: 'Not sure', category: 'summary' },
          ],
          allow_custom_input: true,
          context_hint: 'Choose to summarize now or add one last detail.',
        };
        envelope.state.question_gate = null;
        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    await page.route('**/api/consult', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Noted.',
          question: 'Which associated symptom stands out most right now?',
          soap_updates: { S: { chief_complaint: 'fever' } },
          ddx: ['Malaria (ICD-10: B54)', 'Viral febrile illness (ICD-10: R50.9)'],
          agent_state: {
            phase: 'differential',
            confidence: 83,
            focus_area: 'Fever narrowing',
            pending_actions: ['Clarify associated symptom'],
            last_decision: 'generic question from upstream mock',
            positive_findings: ['fever', 'chills'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: false,
              status: 'cleared',
              last_question: 'Any danger signs now?',
              last_response: 'None of these',
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 83,
          thinking: 'upstream generic question',
          needs_options: true,
          lens_trigger: null,
          status: 'active',
        }),
      });
    });

    await page.route('**/api/options', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'single',
          ui_variant: 'grid',
          options: [
            { id: 'headache', text: 'Headache' },
            { id: 'chills', text: 'Chills' },
            { id: 'nausea', text: 'Nausea' },
            { id: 'none', text: 'None stand out' },
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

    await page.locator('.option-button', { hasText: 'Ready for summary' }).first().click();
    await expect(
      page.getByText('Would you like your working diagnosis and plan now?')
    ).toBeVisible();

    await expect(
      page.getByText('Which associated symptom stands out most right now?')
    ).toHaveCount(0);
  });
});
