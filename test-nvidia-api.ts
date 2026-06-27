/**
 * Quick test script to verify NVIDIA API connection with z-ai/glm-5.1.
 *
 * Usage:
 *   cd E:\PROGRAMACION\cli
 *   bun run test-nvidia-api.ts
 */

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'z-ai/glm-5.1';

// Load API key from .env file
const envFile = await Bun.file('.env').text();
const apiKeyMatch = envFile.match(/^NVIDIA_API_KEY=(.+)$/m);
const NVIDIA_API_KEY = apiKeyMatch?.[1];

console.log('='.repeat(60));
console.log('🧪 NVIDIA API Connection Test');
console.log('='.repeat(60));
console.log(`\n🔧 Model:        ${MODEL}`);
console.log(`🔧 API Base URL: ${NVIDIA_API_BASE}`);
console.log(`🔧 API Key:      ${NVIDIA_API_KEY ? `${NVIDIA_API_KEY.slice(0, 8)}...${NVIDIA_API_KEY.slice(-4)}` : '❌ NOT FOUND'}`);
console.log('');

if (!NVIDIA_API_KEY) {
  console.error('❌ ERROR: NVIDIA_API_KEY not found in .env file');
  process.exit(1);
}

async function runTest() {
  try {
    console.log('📤 Sending test request...\n');

    const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: 'Responde en español. Di solamente: "✅ Conexión exitosa con NVIDIA API usando el modelo z-ai/glm-5.1. Todo funciona correctamente."',
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    const status = response.status;
    console.log(`📥 Response Status: ${status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ ERROR (${status}):`);
      console.error(errorText);
      process.exit(1);
    }

    const data = await response.json();
    
    console.log('\n✅ RESPUESTA EXITOSA!');
    console.log('-'.repeat(40));
    console.log(`📝 Model used:    ${data.model ?? data.object}`);
    console.log(`⏱️  Usage:`);
    console.log(`   - Prompt tokens:     ${data.usage?.prompt_tokens ?? 'N/A'}`);
    console.log(`   - Completion tokens: ${data.usage?.completion_tokens ?? 'N/A'}`);
    console.log(`   - Total tokens:      ${data.usage?.total_tokens ?? 'N/A'}`);
    console.log('');
    console.log('💬 Respuesta:');
    console.log(data.choices?.[0]?.message?.content ?? '(no content)');
    console.log('');
    console.log('='.repeat(60));
    console.log('🎉 TODO OK! La conexión con NVIDIA API funciona correctamente.');
    console.log('='.repeat(60));
  } catch (err) {
    console.error(`\n❌ ERROR DE CONEXIÓN:`);
    console.error(err instanceof Error ? err.message : String(err));
    console.error('\n🔍 Posibles causas:');
    console.error('  - Sin conexión a internet');
    console.error('  - La URL de NVIDIA API cambió');
    console.error('  - Firewall bloqueando la conexión');
    process.exit(1);
  }
}

runTest();
