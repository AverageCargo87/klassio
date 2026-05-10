// RED: config-loader tests — will fail until lib/trainer/config-loader.ts is created.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock 'server-only' pragma so it does not throw in test environment
vi.mock('server-only', () => ({}))

// Mock node:fs/promises so tests do not touch real disk
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

describe('loadTrainerConfig', () => {
  let readFileMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const fsMod = await import('node:fs/promises')
    readFileMock = vi.mocked(fsMod.readFile as ReturnType<typeof vi.fn>)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns parsed TrainerConfig for valid JSON file', async () => {
    const validConfig = {
      title: 'Тест',
      tasks: [
        {
          id: 'task-1',
          type: 'numeric-input',
          prompt: 'Реши: 1 + 1 = ?',
          correct: 2,
          hints: ['Считай пальцы'],
        },
      ],
    }
    readFileMock.mockResolvedValueOnce(JSON.stringify(validConfig))

    const { loadTrainerConfig } = await import('@/lib/trainer/config-loader')
    const result = await loadTrainerConfig('sample.json')

    expect(result.title).toBe('Тест')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].id).toBe('task-1')
    expect(result.tasks[0].correct).toBe(2)
  })

  it('throws ZodError when JSON is invalid against schema', async () => {
    const invalidConfig = { title: 'Тест', tasks: [] } // empty tasks violates min(1)
    readFileMock.mockResolvedValueOnce(JSON.stringify(invalidConfig))

    const { loadTrainerConfig } = await import('@/lib/trainer/config-loader')
    await expect(loadTrainerConfig('bad.json')).rejects.toThrow()
  })

  it('throws when file does not exist (fs rejects)', async () => {
    readFileMock.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))

    const { loadTrainerConfig } = await import('@/lib/trainer/config-loader')
    await expect(loadTrainerConfig('missing.json')).rejects.toThrow('ENOENT')
  })

  it('throws when file contains malformed JSON', async () => {
    readFileMock.mockResolvedValueOnce('{ invalid json }')

    const { loadTrainerConfig } = await import('@/lib/trainer/config-loader')
    await expect(loadTrainerConfig('broken.json')).rejects.toThrow()
  })

  it('resolves path under public/trainer-configs/', async () => {
    const validConfig = {
      title: 'Путь',
      tasks: [{ id: 't1', type: 'numeric-input', prompt: 'Q?', correct: 5 }],
    }
    readFileMock.mockResolvedValueOnce(JSON.stringify(validConfig))

    const { loadTrainerConfig } = await import('@/lib/trainer/config-loader')
    await loadTrainerConfig('my-file.json')

    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('public'),
      'utf8',
    )
    expect(readFileMock.mock.calls[0][0]).toMatch(/trainer-configs/)
    expect(readFileMock.mock.calls[0][0]).toMatch(/my-file\.json/)
  })
})
