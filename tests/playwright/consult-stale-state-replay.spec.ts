import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Stale State Replay', () => {
  test('blocks stale shorter payload from truncating thread and preserves latest options', async ({
    page,
  }) => {
    await seedClinicalStorage(page);

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }
    await expect(
      page
        .locator(
          'textarea[placeholder="Describe your main concern..."], textarea[placeholder="Type your response..."]'
        )
        .first()
    ).toBeVisible();

    const snapshot = await page.evaluate(async () => {
      const host = window as Window & {
        __drDyraneClinical?: {
          getState: () => {
            conversation: Array<{ metadata?: { question?: string } }>;
            response_options?: { options?: Array<{ text?: string }> } | null;
            status: string;
          };
          dispatch: (action: unknown) => void;
        };
        __drDyraneInvariantAudit?: {
          getSnapshot: () => { counts?: Record<string, number> };
        };
      };

      if (!host.__drDyraneClinical) {
        throw new Error('Clinical debug handle is unavailable');
      }

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, ms));

      const now = Date.now();
      const longConversation = [
        {
          id: `patient-a-${now - 4}`,
          role: 'patient',
          content: 'fever',
          timestamp: now - 4,
        },
        {
          id: `doctor-a-${now - 3}`,
          role: 'doctor',
          content: 'How long has this complaint been present?',
          timestamp: now - 3,
          metadata: {
            question: 'How long has this complaint been present?',
            statement: 'Noted.',
          },
        },
        {
          id: `patient-b-${now - 2}`,
          role: 'patient',
          content: '1-2 days ago',
          timestamp: now - 2,
        },
        {
          id: `doctor-b-${now - 1}`,
          role: 'doctor',
          content:
            'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding? Also, anything else?',
          timestamp: now - 1,
          metadata: {
            question:
              'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding? Also, anything else?',
            statement: 'I need one safety check.',
          },
        },
      ];

      host.__drDyraneClinical.dispatch({
        type: 'SET_AGENT_RESPONSE',
        payload: {
          status: 'active',
          conversation: longConversation,
          response_options: {
            mode: 'single',
            ui_variant: 'grid',
            options: [
              { id: 'none', text: 'None of these' },
              { id: 'sob', text: 'Breathlessness' },
              { id: 'confusion', text: 'Confusion' },
            ],
            allow_custom_input: true,
          },
        },
      });
      await sleep(60);

      const afterLong = host.__drDyraneClinical.getState();
      const staleConversation = longConversation.slice(0, 2);

      host.__drDyraneClinical.dispatch({
        type: 'SET_AGENT_RESPONSE',
        payload: {
          status: 'active',
          conversation: staleConversation,
          response_options: {
            mode: 'single',
            ui_variant: 'stack',
            options: [
              { id: 'today', text: 'Started today' },
              { id: 'd1-2', text: '1-2 days ago' },
            ],
            allow_custom_input: true,
          },
        },
      });
      await sleep(60);

      const afterStale = host.__drDyraneClinical.getState();
      const audit = host.__drDyraneInvariantAudit?.getSnapshot?.();

      localStorage.setItem(
        'dr_dyrane.v2.session',
        JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          revision: 99,
          stateHash: 'playwright-stale-replay',
          state: afterStale,
        })
      );

      return {
        longLength: afterLong.conversation.length,
        finalLength: afterStale.conversation.length,
        finalQuestion:
          afterStale.conversation[afterStale.conversation.length - 1]?.metadata?.question || '',
        finalOptionTexts: (afterStale.response_options?.options || []).map((item) =>
          String(item?.text || '')
        ),
        conversationRegressionBlocked:
          Number(audit?.counts?.conversation_regression_blocked || 0),
      };
    });

    expect(snapshot.longLength).toBeGreaterThanOrEqual(4);
    expect(snapshot.finalLength).toBe(snapshot.longLength);
    expect(snapshot.finalQuestion).toMatch(/Any danger signs now/i);
    expect(snapshot.finalQuestion).not.toMatch(/Also, anything else/i);
    expect(snapshot.finalOptionTexts).toContain('None of these');
    expect(snapshot.finalOptionTexts).not.toContain('Started today');
    expect(snapshot.conversationRegressionBlocked).toBeGreaterThan(0);

    await page.reload();
    await page.waitForTimeout(80);

    const persistedLength = await page.evaluate(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return 0;
      try {
        const envelope = JSON.parse(raw);
        return Array.isArray(envelope?.state?.conversation)
          ? envelope.state.conversation.length
          : 0;
      } catch {
        return 0;
      }
    });

    expect(persistedLength).toBe(snapshot.longLength);
  });
});
