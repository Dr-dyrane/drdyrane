/**
 * LSC Test Consultation - Direct API Testing
 * 
 * This script tests the LLM-First architecture by simulating
 * Francis Moneke's LSC case WITHOUT hardcoded disease patterns.
 */

const API_URL = 'http://localhost:5173/api/consult';

// Test conversation turns
const TEST_TURNS = [
  {
    turn: 1,
    description: "Initial presentation - chronic itch with dark patches",
    input: "I've been having itching for years now. It sometimes comes and goes, but it's basically always present. When I scratch, I get dry skin and dark patches.",
    expectedPatterns: [
      /location|where|site|area/i,
      /trigger|worse|aggravat/i,
      /chronic|long|duration/i
    ]
  },
  {
    turn: 2,
    description: "Location and triggers",
    input: "It's mainly on my face and neck. The itching gets worse when I'm hot or sweating, especially after exercise.",
    expectedPatterns: [
      /scratch|rub|itch/i,
      /pattern|cycle/i,
      /heat|sweat/i
    ]
  },
  {
    turn: 3,
    description: "Itch-scratch cycle (CRITICAL MOMENT)",
    input: "Yes, I scratch a lot, sometimes without even realizing it. The dark patches appear where I scratch the most.",
    expectedPatterns: [
      /lichen simplex chronicus|lsc/i,
      /lichenification|thicken/i,
      /itch.*scratch.*cycle|scratch.*itch/i
    ]
  },
  {
    turn: 4,
    description: "Previous treatment",
    input: "I tried Cetirizine but it didn't help. I also used Biocoten cream which helped, but when I stopped, it came back.",
    expectedPatterns: [
      /steroid|corticosteroid/i,
      /relaps|chronic/i,
      /barrier|moisturiz/i
    ]
  },
  {
    turn: 5,
    description: "Skincare routine",
    input: "I use Dove soap and sometimes moisturize with CeraVe or La Roche-Posay, but not regularly.",
    expectedPatterns: [
      /examination|visual|photo|image/i,
      /skin.*texture|appearance/i,
      /diagnosis/i
    ]
  }
];

// Initial state
let state = {
  soap: {},
  agent_state: {},
  ddx: [],
  urgency: 'low',
  probability: 0,
  profile: {},
  conversation: []
};

async function runTurn(turn, input, expectedPatterns) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TURN ${turn.turn}: ${turn.description}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`\n📝 PATIENT INPUT:\n"${input}"\n`);

  const requestBody = {
    patientInput: input,
    state: state
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Update state for next turn
    state.conversation.push(
      { role: 'patient', content: input },
      { role: 'doctor', content: result.statement || result.question || '' }
    );
    if (result.soap_updates) {
      state.soap = { ...state.soap, ...result.soap_updates };
    }
    if (result.ddx) {
      state.ddx = result.ddx;
    }
    if (result.agent_state) {
      state.agent_state = { ...state.agent_state, ...result.agent_state };
    }
    if (result.urgency) {
      state.urgency = result.urgency;
    }
    if (result.probability !== undefined) {
      state.probability = result.probability;
    }

    // Display results
    console.log(`🤖 LLM RESPONSE:`);
    if (result.statement) {
      console.log(`\nStatement: ${result.statement}`);
    }
    if (result.question) {
      console.log(`\nQuestion: ${result.question}`);
    }
    if (result.thinking) {
      console.log(`\n💭 Thinking: ${result.thinking}`);
    }
    if (result.ddx && result.ddx.length > 0) {
      console.log(`\n🔍 Differential Diagnosis:`);
      result.ddx.forEach((dx, i) => console.log(`  ${i + 1}. ${dx}`));
    }
    if (result.diagnosis) {
      console.log(`\n✅ DIAGNOSIS: ${result.diagnosis.label} (${result.diagnosis.icd10})`);
      if (result.diagnosis.rationale) {
        console.log(`   Rationale: ${result.diagnosis.rationale}`);
      }
    }

    // Validate expected patterns
    console.log(`\n✓ VALIDATION:`);
    const fullResponse = JSON.stringify(result).toLowerCase();
    expectedPatterns.forEach((pattern, i) => {
      const matched = pattern.test(fullResponse);
      console.log(`  ${matched ? '✅' : '❌'} Pattern ${i + 1}: ${pattern}`);
    });

    return result;

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                   LSC VALIDATION TEST - LLM-FIRST ARCHITECTURE             ║
║                                                                            ║
║  Testing: Can LLM diagnose Lichen Simplex Chronicus WITHOUT hardcoded     ║
║           disease patterns using pure pathophysiological reasoning?       ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

  try {
    for (const turn of TEST_TURNS) {
      await runTurn(turn, turn.input, turn.expectedPatterns);
      // Small delay between turns
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`FINAL STATE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\nDifferential Diagnosis: ${state.ddx.join(', ')}`);
    console.log(`Urgency: ${state.urgency}`);
    console.log(`Probability: ${state.probability}%`);
    console.log(`\n✅ TEST COMPLETE\n`);

  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}\n`);
    process.exit(1);
  }
}

main();

