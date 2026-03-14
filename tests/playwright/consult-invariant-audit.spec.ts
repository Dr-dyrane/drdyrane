import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Invariant Audit', () => {
  test('records option-intent correction details and clears stale selections', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const question =
          'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever with chills',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: question,
            timestamp: now - 1,
            metadata: {
              question,
              statement: 'I need one safety check.',
            },
          },
        ];

        // Intentionally stale timeline options for a danger-signs question.
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'stack',
          options: [
            { id: 'onset-today', text: 'Started today' },
            { id: 'onset-1-2d', text: '1-2 days ago' },
            { id: 'onset-3-4d', text: '3-4 days ago' },
            { id: 'onset-5-7d', text: '5-7 days ago' },
          ],
          allow_custom_input: true,
        };
        envelope.state.selected_options = ['onset-1-2d'];
        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    let consultInput = '';

    await page.route('**/api/consult', async (route) => {
      const body = route.request().postDataJSON() as { patientInput?: string };
      consultInput = String(body?.patientInput || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Safety status noted.',
          question: 'Would you like your working diagnosis and plan now?',
          soap_updates: { S: { chief_complaint: 'fever' } },
          ddx: ['Malaria (ICD-10: B54)'],
          agent_state: {
            phase: 'resolution',
            confidence: 88,
            focus_area: 'Finalize summary',
            pending_actions: ['Finalize diagnosis and plan'],
            last_decision: 'Safety checkpoint captured',
            positive_findings: ['fever'],
            negative_findings: ['danger signs denied'],
            must_not_miss_checkpoint: {
              required: false,
              status: 'cleared',
              last_question:
                'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
              last_response: consultInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 88,
          thinking: 'Ready to finalize.',
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
          ui_variant: 'segmented',
          options: [
            { id: 'summary-ready', text: 'Ready for summary', category: 'summary' },
            { id: 'summary-add-detail', text: 'Add one detail', category: 'summary' },
            { id: 'summary-not-sure', text: 'Not sure', category: 'summary' },
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

    const input = page.getByPlaceholder('Type your response...');
    await expect(input).toBeVisible();
    await input.fill('None of these');
    await input.press('Enter');

    await expect.poll(() => consultInput).toBe('None of these');
    const guardBlade = page.getByTestId('consult-guard-blade');
    await expect(guardBlade).toBeVisible();
    await expect(guardBlade).toContainText('Dr guard aligned response options for this question.');
    await page.getByRole('button', { name: 'Toggle Dr guard details' }).click();
    await expect(guardBlade).toContainText('turn:');

    const snapshot = await page.evaluate(() => {
      const host = window as Window & {
        __drDyraneInvariantAudit?: { getSnapshot?: () => { counts?: Record<string, number>; events?: Array<{ detail?: string }> } };
      };
      const payload = host.__drDyraneInvariantAudit?.getSnapshot?.();
      return {
        optionsCorrected: payload?.counts?.options_corrected || 0,
        optionContractEnforced: payload?.counts?.option_contract_enforced || 0,
        optionContractFailed: payload?.counts?.option_contract_failed || 0,
        selectionsCleared: payload?.counts?.selections_cleared || 0,
        details: Array.isArray(payload?.events)
          ? payload.events.map((event) => String(event?.detail || ''))
          : [],
      };
    });

    expect(snapshot.optionsCorrected).toBeGreaterThan(0);
    expect(snapshot.optionContractEnforced).toBeGreaterThan(0);
    expect(snapshot.optionContractFailed).toBe(0);
    expect(snapshot.selectionsCleared).toBeGreaterThan(0);
    expect(snapshot.details.some((detail) => detail.includes('danger_signs:timeline'))).toBeTruthy();
    expect(snapshot.details.some((detail) => detail.includes('turn:'))).toBeTruthy();
  });
});
