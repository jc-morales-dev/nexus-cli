import { NexusClient } from '@nexus/sdk'

async function main() {
  const client = new NexusClient({
    // You need to pass in your own API key here.
    // Get one here: https://www.nexus.com/api-keys
    apiKey: process.env.NEXUS_API_KEY,
    cwd: process.cwd(),
  })

  // First run
  const runState1 = await client.run({
    // The agent id. Any agent on the store (https://nexus.com/store)
    agent: 'nexus/base@0.0.16',
    prompt: 'Create a simple calculator class',
    handleEvent: (event) => {
      // All events that happen during the run: agent start/finish, tool calls/results, text responses, errors.
      console.log('Nexus Event', JSON.stringify(event))
    },
  })

  // Continue the same session with a follow-up
  const _runOrError2 = await client.run({
    agent: 'nexus/base@0.0.16',
    prompt: 'Add unit tests for the calculator',
    previousRun: runState1, // <-- this is where your next run differs from the previous run
    handleEvent: (event) => {
      console.log('Nexus Event', JSON.stringify(event))
    },
  })
}

main()
