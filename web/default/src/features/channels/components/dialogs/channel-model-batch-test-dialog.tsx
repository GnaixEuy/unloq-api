/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Square, TestTubeDiagonal } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

import { getChannels, searchChannels, testChannel } from '../../api'
import { CHANNEL_STATUS_LABELS } from '../../constants'
import {
  channelsQueryKeys,
  getChannelTypeLabel,
  parseModelsList,
} from '../../lib'
import type {
  Channel,
  ChannelSortBy,
  ChannelSortOrder,
  ChannelTestResponse,
  GetChannelsParams,
  SearchChannelsParams,
} from '../../types'

export type ChannelModelBatchTestFilters = {
  keyword?: string
  model?: string
  group?: string
  status?: string
  type?: number
  id_sort?: boolean
  sort_by?: ChannelSortBy
  sort_order?: ChannelSortOrder
}

type ChannelModelBatchTestDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: ChannelModelBatchTestFilters
  shouldSearch: boolean
}

type ReportStatus = 'success' | 'failed' | 'skipped'

type BatchProgress = {
  total: number
  completed: number
  success: number
  failed: number
  skipped: number
}

type ChannelModelTask = {
  index: number
  channel: Channel
  model: string
  requestInfo: string
}

type ChannelModelReportRow = {
  index: number
  channelId: number
  channelName: string
  channelType: string
  channelGroup: string
  channelStatus: string
  model: string
  status: ReportStatus
  responseTime?: number
  reason: string
  testedAt: string
  requestInfo: string
  rawResponse: string
}

const PAGE_SIZE = 100
const TEST_CONCURRENCY = 5
const TEST_DELAY_MS = 100

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function getChannelTestResponseTime(
  response: ChannelTestResponse
): number | undefined {
  const responseTime = response.data?.response_time
  if (typeof responseTime === 'number' && Number.isFinite(responseTime)) {
    return responseTime
  }

  if (
    typeof response.time === 'number' &&
    Number.isFinite(response.time) &&
    response.time > 0
  ) {
    return Math.round(response.time * 1000)
  }

  return undefined
}

function formatDuration(responseTime?: number) {
  if (typeof responseTime !== 'number') return ''
  if (responseTime >= 1000) return `${(responseTime / 1000).toFixed(2)} s`
  return `${Math.max(1, Math.round(responseTime))} ms`
}

function getApiErrorMessage(error: unknown) {
  const errorLike = error as {
    response?: {
      status?: number
      data?: {
        message?: string
        error?: string
        error_code?: string
      }
    }
    message?: string
  }

  const message =
    errorLike.response?.data?.message ||
    errorLike.response?.data?.error ||
    errorLike.message
  const errorCode = errorLike.response?.data?.error_code
  const status = errorLike.response?.status

  if (message && errorCode) return `${message} (${errorCode})`
  if (message && status) return `${message} (HTTP ${status})`
  if (message) return message
  if (status) return `HTTP ${status}`
  return ''
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function compactParams<T extends Record<string, unknown>>(params: T) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  ) as Partial<T>
}

function createRequestInfo(channelId: number, model: string) {
  const params = { model }
  const query = new URLSearchParams(params).toString()

  return [
    'GET',
    `/api/channel/test/${channelId}${query ? `?${query}` : ''}`,
    safeJsonStringify({ params }),
  ]
    .filter(Boolean)
    .join('\n')
}

function buildReportRowBase(
  task: ChannelModelTask,
  t: (key: string, options?: Record<string, unknown>) => string
): Pick<
  ChannelModelReportRow,
  | 'index'
  | 'channelId'
  | 'channelName'
  | 'channelType'
  | 'channelGroup'
  | 'channelStatus'
  | 'model'
  | 'requestInfo'
> {
  const channel = task.channel
  const statusLabel =
    CHANNEL_STATUS_LABELS[
      channel.status as keyof typeof CHANNEL_STATUS_LABELS
    ] ?? 'Unknown'

  return {
    index: task.index,
    channelId: channel.id,
    channelName: channel.name,
    channelType: t(getChannelTypeLabel(channel.type)),
    channelGroup: channel.group || '',
    channelStatus: t(statusLabel),
    model: task.model,
    requestInfo: task.requestInfo,
  }
}

function createReportHtml({
  rows,
  generatedAt,
  t,
}: {
  rows: ChannelModelReportRow[]
  generatedAt: string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const columns: Array<{ key: keyof ChannelModelReportRow; label: string }> = [
    { key: 'channelId', label: t('Channel ID') },
    { key: 'channelName', label: t('Channel Name') },
    { key: 'channelType', label: t('Channel Type') },
    { key: 'channelGroup', label: t('Group') },
    { key: 'channelStatus', label: t('Channel Status') },
    { key: 'model', label: t('Model') },
    { key: 'status', label: t('Test Result') },
    { key: 'responseTime', label: t('Response Time') },
    { key: 'reason', label: t('Failure Reason') },
    { key: 'testedAt', label: t('Test Time') },
    { key: 'requestInfo', label: t('Request Information') },
    { key: 'rawResponse', label: t('Raw Response') },
  ]

  const statusLabels: Record<ReportStatus, string> = {
    success: t('Success'),
    failed: t('Failed'),
    skipped: t('Skipped'),
  }

  const sortedRows = [...rows].sort((a, b) => a.index - b.index)
  const bodyRows = sortedRows
    .map(
      (row) => `
        <tr>
          ${columns
            .map(({ key }) => {
              let value: string | number | undefined = row[key]
              if (key === 'status') {
                value = statusLabels[row.status]
              } else if (key === 'responseTime') {
                value = formatDuration(row.responseTime)
              }
              return `<td>${escapeHtml(value)}</td>`
            })
            .join('')}
        </tr>`
    )
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; }
    h1 { font-size: 18px; }
    p { color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d9d9d9; padding: 8px; mso-number-format:"\\@"; vertical-align: top; }
    th { background: #034656; color: #fff; font-weight: 700; }
    td { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(t('Channel Model Test Report'))}</h1>
  <p>${escapeHtml(t('Generated at: {{time}}', { time: generatedAt }))}</p>
  <table>
    <thead>
      <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`
}

function downloadReportFile({
  rows,
  t,
}: {
  rows: ChannelModelReportRow[]
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const generatedAt = new Date().toLocaleString()
  const html = createReportHtml({ rows, generatedAt, t })
  const blob = new Blob([html], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `channel-model-test-report-${timestamp}.xls`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function getReportStats(rows: ChannelModelReportRow[]) {
  return rows.reduce(
    (stats, row) => {
      stats.completed += 1
      if (row.status === 'success') stats.success += 1
      if (row.status === 'failed') stats.failed += 1
      if (row.status === 'skipped') stats.skipped += 1
      return stats
    },
    { completed: 0, success: 0, failed: 0, skipped: 0 }
  )
}

function createInitialProgress(total: number): BatchProgress {
  return {
    total,
    completed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  }
}

export function ChannelModelBatchTestDialog({
  open,
  onOpenChange,
  filters,
  shouldSearch,
}: ChannelModelBatchTestDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const stopRequestedRef = useRef(false)
  const reportRowsRef = useRef<ChannelModelReportRow[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isStopRequested, setIsStopRequested] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [reportRows, setReportRows] = useState<ChannelModelReportRow[]>([])
  const [currentTarget, setCurrentTarget] = useState('')

  const reportStats = useMemo(() => getReportStats(reportRows), [reportRows])
  const progressValue =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0
  const hasReport = reportRows.length > 0

  const resetRunState = useCallback(() => {
    stopRequestedRef.current = false
    reportRowsRef.current = []
    setIsRunning(false)
    setIsStopRequested(false)
    setProgress(null)
    setReportRows([])
    setCurrentTarget('')
  }, [])

  const appendReportRow = useCallback((row: ChannelModelReportRow) => {
    reportRowsRef.current = [...reportRowsRef.current, row]
    setReportRows(reportRowsRef.current)
    setProgress((current) => {
      if (!current) return current

      return {
        ...current,
        completed: current.completed + 1,
        success: current.success + (row.status === 'success' ? 1 : 0),
        failed: current.failed + (row.status === 'failed' ? 1 : 0),
        skipped: current.skipped + (row.status === 'skipped' ? 1 : 0),
      }
    })
  }, [])

  const fetchChannelsForReport = useCallback(async () => {
    const channels: Channel[] = []
    let page = 1
    let total: number | undefined

    do {
      const paging = { p: page, page_size: PAGE_SIZE, tag_mode: false }
      const sanitizedFilters = compactParams(filters)
      const { keyword: _keyword, model: _model, ...listFilters } =
        sanitizedFilters
      const response = shouldSearch
        ? await searchChannels({
            ...(sanitizedFilters as SearchChannelsParams),
            ...paging,
          })
        : await getChannels({
            ...(listFilters as GetChannelsParams),
            ...paging,
          })

      if (!response.success) {
        throw new Error(response.message || t('Failed to load channels'))
      }

      const items = response.data?.items ?? []
      total = response.data?.total ?? channels.length + items.length
      channels.push(...items)

      if (items.length === 0 || channels.length >= total) {
        break
      }

      page += 1
    } while (page < 10000)

    return channels
  }, [filters, shouldSearch, t])

  const createTasks = useCallback(
    (channels: Channel[]) => {
      const tasks: ChannelModelTask[] = []
      const skippedRows: ChannelModelReportRow[] = []
      let index = 0

      for (const channel of channels) {
        const models = parseModelsList(channel.models)
        const uniqueModels = Array.from(new Set(models))

        if (uniqueModels.length === 0) {
          const fallbackModel = channel.test_model?.trim()
          if (fallbackModel) {
            index += 1
            tasks.push({
              index,
              channel,
              model: fallbackModel,
              requestInfo: createRequestInfo(channel.id, fallbackModel),
            })
          } else {
            index += 1
            const syntheticTask: ChannelModelTask = {
              index,
              channel,
              model: '',
              requestInfo: '',
            }
            skippedRows.push({
              ...buildReportRowBase(syntheticTask, t),
              status: 'skipped',
              reason: t('No models configured'),
              testedAt: new Date().toLocaleString(),
              rawResponse: '',
            })
          }
          continue
        }

        for (const model of uniqueModels) {
          index += 1
          tasks.push({
            index,
            channel,
            model,
            requestInfo: createRequestInfo(channel.id, model),
          })
        }
      }

      return { tasks, skippedRows, total: index }
    },
    [t]
  )

  const runSingleTask = useCallback(
    async (task: ChannelModelTask) => {
      const testedAt = new Date().toLocaleString()
      const base = buildReportRowBase(task, t)

      setCurrentTarget(
        t('{{channel}} / {{model}}', {
          channel: task.channel.name,
          model: task.model,
        })
      )

      try {
        const response = await testChannel(task.channel.id, {
          model: task.model,
        })
        const responseTime = getChannelTestResponseTime(response)

        if (response.success) {
          appendReportRow({
            ...base,
            status: 'success',
            responseTime,
            reason: '',
            testedAt,
            rawResponse: safeJsonStringify(response),
          })
          return
        }

        const reason =
          response.data?.error ||
          response.message ||
          t('Test failed') ||
          response.error_code ||
          ''
        appendReportRow({
          ...base,
          status: 'failed',
          responseTime,
          reason: response.error_code
            ? `${reason} (${response.error_code})`
            : reason,
          testedAt,
          rawResponse: safeJsonStringify(response),
        })
      } catch (error: unknown) {
        appendReportRow({
          ...base,
          status: 'failed',
          reason: getApiErrorMessage(error) || t('Test failed'),
          testedAt,
          rawResponse: safeJsonStringify(error),
        })
      }
    },
    [appendReportRow, t]
  )

  const handleDownloadReport = useCallback(() => {
    if (!reportRowsRef.current.length) return

    try {
      downloadReportFile({ rows: reportRowsRef.current, t })
      toast.success(t('Batch test report downloaded'))
    } catch {
      toast.error(t('Failed to download report'))
    }
  }, [t])

  const handleStart = useCallback(async () => {
    resetRunState()
    setIsRunning(true)
    setCurrentTarget(t('Preparing channels...'))

    try {
      const channels = await fetchChannelsForReport()
      if (channels.length === 0) {
        toast.info(t('No channels to test'))
        resetRunState()
        return
      }

      const { tasks, skippedRows, total } = createTasks(channels)
      setProgress(createInitialProgress(total))
      for (const row of skippedRows) {
        appendReportRow(row)
      }

      if (tasks.length === 0) {
        toast.info(t('No channel models to test'))
        setIsRunning(false)
        setCurrentTarget('')
        if (reportRowsRef.current.length > 0) {
          handleDownloadReport()
        }
        return
      }

      for (
        let startIndex = 0;
        startIndex < tasks.length;
        startIndex += TEST_CONCURRENCY
      ) {
        if (stopRequestedRef.current) {
          const remaining = tasks.slice(startIndex)
          for (const task of remaining) {
            appendReportRow({
              ...buildReportRowBase(task, t),
              status: 'skipped',
              reason: t('Stopped before test'),
              testedAt: new Date().toLocaleString(),
              rawResponse: '',
            })
          }
          break
        }

        const batch = tasks.slice(startIndex, startIndex + TEST_CONCURRENCY)
        await Promise.allSettled(batch.map((task) => runSingleTask(task)))

        if (
          stopRequestedRef.current ||
          startIndex + TEST_CONCURRENCY >= tasks.length
        ) {
          continue
        }

        await sleep(TEST_DELAY_MS)
      }

      const stopped = stopRequestedRef.current
      if (stopped) {
        toast.info(
          t('Batch test stopped. Download the partial report if needed.')
        )
      } else {
        toast.success(t('Batch model test completed'))
      }

      handleDownloadReport()
      void queryClient.invalidateQueries({
        queryKey: channelsQueryKeys.lists(),
      })
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error) || t('Failed to load channels'))
    } finally {
      stopRequestedRef.current = false
      setIsRunning(false)
      setIsStopRequested(false)
      setCurrentTarget('')
    }
  }, [
    appendReportRow,
    createTasks,
    fetchChannelsForReport,
    handleDownloadReport,
    queryClient,
    resetRunState,
    runSingleTask,
    t,
  ])

  const handleStop = useCallback(() => {
    if (!isRunning || isStopRequested) return
    stopRequestedRef.current = true
    setIsStopRequested(true)
  }, [isRunning, isStopRequested])

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isRunning) {
        handleStop()
        return
      }

      if (!nextOpen) {
        resetRunState()
      }

      onOpenChange(nextOpen)
    },
    [handleStop, isRunning, onOpenChange, resetRunState]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title={t('Batch Test Channel Models')}
      description={t(
        'Test every configured model in matching channels and download an Excel report with success, failure reason, and request information.'
      )}
      contentClassName='sm:max-w-3xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => handleClose(false)}
            disabled={isRunning}
          >
            {t('Close')}
          </Button>
          <Button
            variant='outline'
            onClick={handleDownloadReport}
            disabled={!hasReport || isRunning}
          >
            <Download data-icon='inline-start' />
            {t('Download report')}
          </Button>
          {isRunning ? (
            <Button
              variant='outline'
              onClick={handleStop}
              disabled={isStopRequested}
            >
              <Square data-icon='inline-start' />
              {isStopRequested ? t('Stopping...') : t('Stop testing')}
            </Button>
          ) : (
            <Button onClick={handleStart}>
              <TestTubeDiagonal data-icon='inline-start' />
              {t('Start batch test')}
            </Button>
          )}
        </>
      }
    >
      <div className='space-y-4'>
        <div className='bg-muted/30 rounded-md border p-3 text-sm'>
          <p className='font-medium'>
            {t('Search filters on this page are applied to the batch test.')}
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Tag aggregation is ignored so the report tests concrete channels.'
            )}
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'The report will download automatically after the test finishes.'
            )}
          </p>
        </div>

        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          <SummaryTile label={t('Completed')} value={reportStats.completed} />
          <SummaryTile
            label={t('Success')}
            value={reportStats.success}
            variant='success'
          />
          <SummaryTile
            label={t('Failed')}
            value={reportStats.failed}
            variant='danger'
          />
          <SummaryTile
            label={t('Skipped')}
            value={reportStats.skipped}
            variant='neutral'
          />
        </div>

        {progress && (
          <div className='space-y-2 rounded-md border p-3'>
            <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-2'>
                {isRunning && <Loader2 className='size-4 animate-spin' />}
                <p className='text-sm font-medium'>
                  {isStopRequested
                    ? t('Stopping batch test...')
                    : isRunning
                      ? t('Testing channel models...')
                      : t('Report is ready')}
                </p>
              </div>
              <p className='text-muted-foreground text-xs tabular-nums'>
                {t('{{completed}}/{{total}} completed', {
                  completed: progress.completed,
                  total: progress.total,
                })}
              </p>
            </div>
            <Progress value={progressValue} />
            {currentTarget && (
              <p className='text-muted-foreground truncate text-xs'>
                {currentTarget}
              </p>
            )}
          </div>
        )}

        {hasReport && (
          <div className='overflow-hidden rounded-md border'>
            <div className='bg-muted/30 border-b px-3 py-2 text-sm font-medium'>
              {t('Latest results')}
            </div>
            <div className='max-h-72 overflow-auto'>
              <table className='w-full min-w-[720px] text-sm'>
                <thead className='bg-muted/50 sticky top-0 z-10'>
                  <tr className='border-b text-start'>
                    <th className='px-3 py-2 text-start font-medium'>
                      {t('Channel')}
                    </th>
                    <th className='px-3 py-2 text-start font-medium'>
                      {t('Model')}
                    </th>
                    <th className='px-3 py-2 text-start font-medium'>
                      {t('Status')}
                    </th>
                    <th className='px-3 py-2 text-start font-medium'>
                      {t('Failure Reason')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...reportRows]
                    .sort((a, b) => b.index - a.index)
                    .slice(0, 20)
                    .map((row) => (
                      <tr
                        key={`${row.index}-${row.channelId}-${row.model}`}
                        className='border-b last:border-0'
                      >
                        <td className='px-3 py-2'>{row.channelName}</td>
                        <td className='px-3 py-2'>{row.model || '-'}</td>
                        <td className='px-3 py-2'>
                          <ReportStatusBadge status={row.status} />
                        </td>
                        <td className='text-muted-foreground max-w-96 px-3 py-2'>
                          <span className='line-clamp-2'>
                            {row.reason || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function SummaryTile({
  label,
  value,
  variant = 'neutral',
}: {
  label: string
  value: number
  variant?: 'success' | 'danger' | 'neutral'
}) {
  return (
    <div className='rounded-md border p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p
        className={
          variant === 'success'
            ? 'text-success mt-1 text-2xl font-semibold tabular-nums'
            : variant === 'danger'
              ? 'text-destructive mt-1 text-2xl font-semibold tabular-nums'
              : 'mt-1 text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  )
}

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useTranslation()
  if (status === 'success') {
    return (
      <StatusBadge label={t('Success')} variant='success' copyable={false} />
    )
  }
  if (status === 'failed') {
    return <StatusBadge label={t('Failed')} variant='danger' copyable={false} />
  }
  return <StatusBadge label={t('Skipped')} variant='neutral' copyable={false} />
}
