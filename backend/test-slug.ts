import { generateSlug } from './src/common/utils/slug.util';

const testCases = [
  { input: 'Uñas', expected: 'unas' },
  { input: 'Peluquería', expected: 'peluqueria' },
  { input: 'Niño', expected: 'nino' },
  { input: 'Uñas & Co', expected: 'unas-co' },
  { input: '¿Cómo estás?', expected: 'como-estas' },
  { input: 'A&B', expected: 'a-b' },
];

async function runTests() {
  console.log('--- Testing Slug Generation (Async) ---');
  for (const { input, expected } of testCases) {
    const result = await generateSlug(input);
    const status = result === expected ? '✅' : '❌';
    console.log(`${status} Input: "${input}" | Result: "${result}" | Expected: "${expected}"`);
  }
}

runTests().catch(console.error);
