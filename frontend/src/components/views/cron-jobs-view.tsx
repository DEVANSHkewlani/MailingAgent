import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Clock3, Pause, Play, Plus, RotateCw, Trash2, Activity } from 'lucide-react'
import { $userId } from '../../store/auth'
import {
  createCronJob,
  deleteCronJob,
  fetchCronJobs,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
  fetchCronRuns,
  type CronJob,
  type CronRun,
} from '../../lib/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

const intervalOptions = [
  { label: 'Every 15 minutes', value: '15' },
  { label: 'Every hour', value: '60' },
  { label: 'Every 6 hours', value: '360' },
  { label: 'Daily at a time', value: 'daily' },
]

function formatDate(value?: string | null) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function scheduleLabel(job: CronJob) {
  if (job.schedule_type === 'daily') return `Daily at ${job.schedule_value}`
  return `Every ${job.schedule_value} minutes`
}

export function CronJobsView() {
  const userId = useStore($userId)
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState('60')
  const [dailyTime, setDailyTime] = useState('09:00')

  // History expanded state
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)

  const canCreate = useMemo(() => prompt.trim().length >= 3, [prompt])

  function formatDuration(startedAt: string, finishedAt?: string | null) {
    if (!finishedAt) return 'Running...'
    const start = new Date(startedAt).getTime()
    const end = new Date(finishedAt).getTime()
    const diffMs = end - start
    if (diffMs < 1000) return `${diffMs}ms`
    const diffSec = Math.round(diffMs / 1000)
    if (diffSec < 60) return `${diffSec}s`
    const diffMin = Math.floor(diffSec / 60)
    const remSec = diffSec % 60
    return `${diffMin}m ${remSec}s`
  }

  async function toggleHistory(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null)
      setRuns([])
    } else {
      setExpandedJobId(jobId)
      setRuns([])
      setLoadingRuns(true)
      try {
        const history = await fetchCronRuns(jobId)
        setRuns(history)
      } catch (err: any) {
        console.error('Failed to fetch runs:', err)
      } finally {
        setLoadingRuns(false)
      }
    }
  }

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setJobs(await fetchCronJobs(userId))
    } catch (err: any) {
      setError(err.message || 'Failed to load cron jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [userId])

  async function handleCreate() {
    if (!canCreate) return
    setError(null)
    try {
      const created = await createCronJob({
        user_id: userId,
        name: name.trim() || undefined,
        prompt: prompt.trim(),
        schedule_type: schedule === 'daily' ? 'daily' : 'interval_minutes',
        schedule_value: schedule === 'daily' ? dailyTime : schedule,
      })
      setJobs([created, ...jobs])
      setName('')
      setPrompt('')
    } catch (err: any) {
      setError(err.message || 'Failed to create cron job')
    }
  }

  async function updateJob(job: CronJob, action: () => Promise<CronJob | any>, remove = false) {
    setBusyId(job.id)
    setError(null)
    try {
      const updated = await action()
      if (remove) {
        setJobs(jobs.filter(item => item.id !== job.id))
      } else if (updated?.id) {
        setJobs(jobs.map(item => (item.id === job.id ? updated : item)))
      } else {
        await refresh()
      }
    } catch (err: any) {
      setError(err.message || 'Cron job action failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-themed">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) pb-4">
          <Clock3 className="size-5 text-primary" />
          <h2 className="text-[1.125rem] font-bold text-foreground">Cron Jobs</h2>
        </div>

        <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Name, optional"
              className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Tell the agent what to do in the background"
              className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
              className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none"
            >
              {intervalOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {schedule === 'daily' && (
              <input
                type="time"
                value={dailyTime}
                onChange={e => setDailyTime(e.target.value)}
                className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none"
              />
            )}
            <Button onClick={handleCreate} disabled={!canCreate} className="bg-primary text-primary-foreground">
              <Plus className="size-3.5" />
              Add Job
            </Button>
          </div>
        </div>

        {error && <div className="text-xs text-(--ui-red)">{error}</div>}

        {loading ? (
          <div className="p-8 text-center text-xs text-(--ui-text-tertiary)">Loading cron jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-8 text-center">
            <div className="text-[0.875rem] font-medium text-foreground">No cron jobs yet</div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">Add a background instruction above and choose how often it should run.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground truncate">{job.name || 'Background instruction'}</h3>
                      <Badge variant={job.enabled ? 'success' : 'muted'}>{job.state}</Badge>
                    </div>
                    <p className="text-xs text-(--ui-text-secondary) whitespace-pre-wrap">{job.prompt}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                      <span>{scheduleLabel(job)}</span>
                      <span>Next: {formatDate(job.next_run_at)}</span>
                      <span>Last: {formatDate(job.last_run_at)}</span>
                    </div>
                    {job.last_error && <div className="text-[0.6875rem] text-(--ui-red)">Last error: {job.last_error}</div>}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={expandedJobId === job.id ? 'bg-primary/10 border-primary/20 text-primary' : ''}
                      onClick={() => toggleHistory(job.id)}
                    >
                      <Activity className="size-3.5" />
                      History
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === job.id} onClick={() => updateJob(job, () => triggerCronJob(job.id))}>
                      <RotateCw className="size-3.5" />
                      Run Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === job.id}
                      onClick={() => updateJob(job, () => (job.enabled ? pauseCronJob(job.id) : resumeCronJob(job.id)))}
                    >
                      {job.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      {job.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === job.id} onClick={() => updateJob(job, () => deleteCronJob(job.id), true)}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Expanded execution history sub-panel */}
                {expandedJobId === job.id && (
                  <div className="mt-4 border-t border-(--ui-stroke-tertiary) pt-4 space-y-3 font-sans">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Activity className="size-3.5 text-primary" />
                      Execution History Logs
                    </div>
                    {loadingRuns ? (
                      <div className="text-xs text-(--ui-text-tertiary) py-2">Loading logs...</div>
                    ) : runs.length === 0 ? (
                      <div className="text-xs text-(--ui-text-tertiary) py-2">No executions recorded yet.</div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {runs.map(run => (
                          <div key={run.id} className="bg-(--ui-bg-quinary) border border-(--ui-stroke-tertiary) rounded-lg p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={
                                    run.status === 'completed' ? 'success' : 
                                    run.status === 'failed' ? 'destructive' : 'muted'
                                  }
                                >
                                  {run.status.toUpperCase()}
                                </Badge>
                                <span className="text-(--ui-text-tertiary) text-[10px] font-mono">
                                  {formatDate(run.started_at)}
                                </span>
                              </div>
                              <span className="text-(--ui-text-tertiary) text-[10px]">
                                Duration: {formatDuration(run.started_at, run.finished_at)}
                              </span>
                            </div>
                            
                            {run.output && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold text-(--ui-text-tertiary)">Output Summary:</span>
                                <pre className="bg-[#0c0c0e] border border-white/5 text-white/80 rounded p-2 text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                  {run.output}
                                </pre>
                              </div>
                            )}

                            {run.error && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold text-(--ui-red)">Error Log:</span>
                                <pre className="bg-[#120a0b] border border-red-500/10 text-red-400 rounded p-2 text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                  {run.error}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CronJobsView
