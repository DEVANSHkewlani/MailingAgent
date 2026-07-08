import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Clock3, Pause, Play, Plus, RotateCw, Trash2 } from 'lucide-react'
import { $userId } from '../../store/auth'
import {
  createCronJob,
  deleteCronJob,
  fetchCronJobs,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
  type CronJob,
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

  const canCreate = useMemo(() => prompt.trim().length >= 3, [prompt])

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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CronJobsView
