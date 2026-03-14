// Test script for LLM prescription generation API
// Run with: node test-prescription-api.js

const testCases = [
  {
    name: 'Lichen Simplex Chronicus (LSC)',
    diagnosis: 'Lichen Simplex Chronicus',
    age: 35,
    weight_kg: 70,
    sex: 'female',
    urgency: 'medium',
  },
  {
    name: 'Peptic Ulcer Disease',
    diagnosis: 'Peptic Ulcer Disease',
    age: 45,
    weight_kg: 75,
    sex: 'male',
    urgency: 'medium',
  },
  {
    name: 'Acute Stroke',
    diagnosis: 'Acute Ischemic Stroke',
    age: 65,
    weight_kg: 80,
    sex: 'male',
    urgency: 'high',
  },
  {
    name: 'Malaria (to compare with hardcoded)',
    diagnosis: 'Uncomplicated Malaria',
    age: 8,
    weight_kg: 25,
    sex: 'male',
    urgency: 'medium',
  },
];

async function testPrescriptionGeneration(testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const response = await fetch('http://localhost:5173/api/generate-prescription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagnosis: testCase.diagnosis,
        age: testCase.age,
        weight_kg: testCase.weight_kg,
        sex: testCase.sex,
        urgency: testCase.urgency,
        soap: { S: {}, O: {}, A: {}, P: {} },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    console.log(`✅ SUCCESS - Generated ${result.prescriptions?.length || 0} prescription lines\n`);
    
    if (result.rationale) {
      console.log(`📋 Rationale: ${result.rationale}\n`);
    }

    if (result.prescriptions && result.prescriptions.length > 0) {
      console.log('💊 Prescriptions:');
      result.prescriptions.forEach((rx, index) => {
        console.log(`\n${index + 1}. ${rx.form} ${rx.medication}`);
        console.log(`   Dose: ${rx.dose_per_kg ? `${rx.dose_per_kg} mg/kg` : 'Fixed'} (max: ${rx.max_dose} ${rx.unit})`);
        console.log(`   Frequency: ${rx.frequency}`);
        console.log(`   Duration: ${rx.duration}`);
        if (rx.note) console.log(`   Note: ${rx.note}`);
      });
    }

    return { success: true, result };
  } catch (error) {
    console.error(`❌ FAILED: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n🧪 LLM PRESCRIPTION GENERATION API TEST SUITE');
  console.log('='.repeat(80));
  console.log('Testing arbitrary diagnosis prescription generation...\n');

  const results = [];

  for (const testCase of testCases) {
    const result = await testPrescriptionGeneration(testCase);
    results.push({ testCase: testCase.name, ...result });
    
    // Wait 2 seconds between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.testCase}: ${r.error}`);
    });
  }
}

// Run tests
runAllTests().catch(console.error);

