import { access, mkdir, writeFile } from 'node:fs/promises'
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
    const now = new Date().toISOString()
    return {
      agent: this.name,
      status: 'applied',
      success: true,
      exitCode: 0,
      stdout: `Mock applied fix packet ${fixPacket.issue_id}`,
      stderr: '',
      startedAt: now,
      completedAt: now,
      commandsRun: [],
      modifiedFiles: [],
      changedFiles: [],
      diffSummary: '',
      notes: ['Mock adapter does not modify files.']
    }
  }
}

export class ManualAgentAdapter implements AgentAdapter {
  name = 'manual'

  async applyFix(fixPacket: FixPacket, options?: { attemptDir?: string }): Promise<AgentResult> {
    const now = new Date().toISOString()
    const packetPath = options?.attemptDir
      ? path.join(options.attemptDir, '..', '..', '..', 'fix_packets', `${fixPacket.issue_id}.md`)
      : path.join('.', 'fix_packets', `${fixPacket.issue_id}.md`)
    const message = [
      `Manual fix required for ${fixPacket.issue_id}.`,
      `Open fix packet: ${path.normalize(packetPath)}`,
      `Repair root: ${fixPacket.repair_root}`,
      `Allowed paths: ${fixPacket.allowed_paths.join(', ') || 'none'}`,
      '',
      fixPacket.prompt
    ].join('\n')
    return {
      agent: this.name,
      status: 'not_run',
      success: false,
      exitCode: null,
      stdout: message,
      stderr: '',
      startedAt: now,
      completedAt: now,
      commandsRun: [],
      modifiedFiles: [],
      changedFiles: [],
      diffSummary: '',
      notes: ['Manual mode does not modify files.']
    }
  }
}

export class CodexCliAgentAdapter implements AgentAdapter {
  name = 'codex'

  async applyFix(fixPacket: FixPacket, options?: { allowDestructive?: boolean; attemptDir?: string }): Promise<AgentResult> {
    const startedAt = new Date().toISOString()
    assertSafeFixPacket(fixPacket, options?.allowDestructive)
    const command = process.env.SNIFFER_CODEX_COMMAND ?? 'codex'
    const timeoutSeconds = Number(process.env.SNIFFER_CODEX_TIMEOUT_SECONDS ?? 900)
    const codexArgs = process.env.SNIFFER_CODEX_ARGS ?? ''
    const exists = await commandExists(command)
    if (!exists) {
      const completedAt = new Date().toISOString()
      return {
        agent: this.name,
        status: 'not_run',
        success: false,
        exitCode: null,
        stdout: `Codex command not found: ${command}. Set SNIFFER_CODEX_COMMAND or run apply-fix with --agent manual.`,
        stderr: `Command not found: ${command}`,
        startedAt,
        completedAt,
        commandsRun: [],
        modifiedFiles: [],
        changedFiles: [],
        diffSummary: '',
        notes: ['Codex CLI was not invoked.']
      }
    }

    const attemptDir = options?.attemptDir ?? fixPacket.repair_root
    await mkdir(attemptDir, { recursive: true })
    const promptPath = path.join(attemptDir, 'codex_prompt.md')
    await writeFile(promptPath, fixPacket.prompt, 'utf8')

    const commandTemplate = `${command}${codexArgs ? ` ${codexArgs}` : ''}`
    const commandLine = commandTemplate.includes('{prompt_file}')
      ? commandTemplate.replaceAll('{prompt_file}', shellQuote(promptPath))
      : commandTemplate
    const result = spawnSync(commandLine, {
      cwd: fixPacket.repair_root,
      shell: true,
      encoding: 'utf8',
      input: commandTemplate.includes('{prompt_file}') ? undefined : fixPacket.prompt,
      timeout: timeoutSeconds * 1000,
      env: sanitizedEnv(process.env)
    })
    const completedAt = new Date().toISOString()

    return {
      agent: this.name,
      status: result.status === 0 ? 'applied' : 'failed',
      success: result.status === 0,
      exitCode: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      startedAt,
      completedAt,
      commandsRun: [commandTemplate.includes('{prompt_file}') ? commandLine : `${commandLine} < ${promptPath}`],
      modifiedFiles: [],
      changedFiles: [],
      diffSummary: '',
      notes: [`Prompt written to ${promptPath}`]
    }
  }
}

export function createAgentAdapter(name = process.env.SNIFFER_AGENT ?? 'manual'): AgentAdapter {
  if (name === 'mock') return new MockAgentAdapter()
  if (name === 'codex') return new CodexCliAgentAdapter()
  return new ManualAgentAdapter()
}

export async function commandExists(command: string): Promise<boolean> {
  const binary = command.trim().split(/\s+/)[0]
  if (binary.includes(path.sep)) {
    return access(binary).then(() => true).catch(() => false)
  }
  const result = spawnSync('command', ['-v', binary], { shell: true, encoding: 'utf8' })
  return result.status === 0
}

function sanitizedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !/(API_KEY|TOKEN|SECRET|PASSWORD|OPENAI|ANTHROPIC)/i.test(key))
  )
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
