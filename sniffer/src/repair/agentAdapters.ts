import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type { AgentResult, FixPacket } from '../types.js'
import { assertSafeFixPacket } from './safety.js'

export interface AgentAdapter {
  name: string
  applyFix(fixPacket: FixPacket, options?: { allowDestructive?: boolean; attemptDir?: string }): Promise<AgentResult>
}

export class MockAgentAdapter implements AgentAdapter {
  name = 'mock'

  async applyFix(fixPacket: FixPacket): Promise<AgentResult> {
    return {
      agent: this.name,
      status: 'applied',
      stdout: `Mock applied fix packet ${fixPacket.issue_id}`,
      stderr: '',
      commandsRun: [],
      modifiedFiles: []
    }
  }
}

export class ManualAgentAdapter implements AgentAdapter {
  name = 'manual'

  async applyFix(fixPacket: FixPacket, options?: { attemptDir?: string }): Promise<AgentResult> {
    const message = [
      `Manual fix required for ${fixPacket.issue_id}.`,
      `Open fix packet: ${path.join(options?.attemptDir ?? '.', '..', '..', 'fix_packets', `${fixPacket.issue_id}.md`)}`,
      '',
      fixPacket.prompt
    ].join('\n')
    return {
      agent: this.name,
      status: 'not_run',
      stdout: message,
      stderr: '',
      commandsRun: [],
      modifiedFiles: []
    }
  }
}

export class CodexAgentAdapter implements AgentAdapter {
  name = 'codex'

  async applyFix(fixPacket: FixPacket, options?: { allowDestructive?: boolean; attemptDir?: string }): Promise<AgentResult> {
    assertSafeFixPacket(fixPacket, options?.allowDestructive)
    const command = process.env.SNIFFER_CODEX_COMMAND
    if (!command) {
      return {
        agent: this.name,
        status: 'not_run',
        stdout: 'SNIFFER_CODEX_COMMAND is not configured. Run apply-fix with --agent manual or set SNIFFER_CODEX_COMMAND.',
        stderr: '',
        commandsRun: [],
        modifiedFiles: []
      }
    }

    await mkdir(options?.attemptDir ?? fixPacket.working_directory, { recursive: true })
    const promptPath = path.join(options?.attemptDir ?? fixPacket.working_directory, 'codex_prompt.md')
    await writeFile(promptPath, fixPacket.prompt, 'utf8')
    const result = spawnSync(command, [promptPath], {
      cwd: fixPacket.working_directory,
      shell: true,
      encoding: 'utf8'
    })

    return {
      agent: this.name,
      status: result.status === 0 ? 'applied' : 'failed',
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      commandsRun: [`${command} ${promptPath}`],
      modifiedFiles: []
    }
  }
}

export function createAgentAdapter(name = process.env.SNIFFER_AGENT ?? 'manual'): AgentAdapter {
  if (name === 'mock') return new MockAgentAdapter()
  if (name === 'codex') return new CodexAgentAdapter()
  return new ManualAgentAdapter()
}
