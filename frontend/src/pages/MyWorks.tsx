import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import ChipSelect from '../components/ChipSelect'
import PublishBox from '../components/PublishBox'
import SubmitBox from '../components/SubmitBox'
import { isOpen, loadAssignments } from '../features/assignments/assignments'
import type { Assignment } from '../features/assignments/assignments'
import type { Work } from '../features/works/works'
import { useLoad } from '../useLoad'

const loadWorks = () => api<Work[]>('/api/works/mine')
const loadRejected = () => api<{ id: number; item_type: string; text: string | null }[]>('/api/held/mine')

export default function MyWorks() {
  const { t } = useTranslation()
  const [works] = useLoad(loadWorks)
  const [rejected] = useLoad(loadRejected)
  const [tasks, reloadTasks] = useLoad(loadAssignments)
  const open = tasks?.filter(isOpen) ?? []
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-heading">{t('myWorks.title')}</h1>
      {rejected?.map((r) => (
        <p key={r.id} data-testid="rejected-note" className="mt-3 rounded-2xl bg-primary-soft px-4 py-2 font-bold text-heading">
          {r.text ? t('review.childRejected', { text: r.text }) : t('review.childRejectedNoText')}
        </p>
      ))}
      {works && works.length === 0 && (
        <p data-testid="works-empty" className="mt-4 text-text">
          {t('myWorks.empty')}
        </p>
      )}
      <div data-testid="works-grid" className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {works?.map((w) => (
          <WorkCard key={w.id} w={w} open={open} onSubmitted={reloadTasks} />
        ))}
      </div>
    </div>
  )
}

function WorkCard({ w, open, onSubmitted }: { w: Work; open: Assignment[]; onSubmitted: () => void }) {
  const { t } = useTranslation()
  const [support, setSupport] = useState(false)
  const [form, setForm] = useState(false)
  // выбранное задание запоминаем: после сдачи оно уходит из открытых, а итог на карточке остаётся
  const [task, setTask] = useState<Pick<Assignment, 'id' | 'title'> | null>(null)
  const cur = task ?? open[0]
  // после публикации с тревожным текстом в карточке только тёплый ответ
  if (support) {
    return (
      <div data-testid="work-card" className="overflow-hidden rounded-card border border-border bg-surface p-3 shadow-card">
        <p data-testid="publish-support" className="text-sm font-extrabold text-heading">{t('publish.support')}</p>
      </div>
    )
  }
  return (
    <div data-testid="work-card" className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      {w.image_url ? (
        <img src={w.image_url} alt={t(`templates.${w.template_id}`)} className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-primary-soft p-3 text-center font-extrabold text-heading">
          {t(`myWorks.status.${w.status}`)}
        </div>
      )}
      <p className="px-3 py-2 text-sm font-extrabold text-heading">{t(`templates.${w.template_id}`)}</p>
      {w.status === 'ready' && (
        <div className="px-3 pb-3">
          <PublishBox workId={w.id} onSupport={() => setSupport(true)} />
          {cur && (
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                data-testid="submit-from-works"
                aria-expanded={form}
                onClick={() => {
                  setForm((o) => !o)
                  setTask((x) => x ?? open[0] ?? null)
                }}
                className="h-11 w-full rounded-full border border-primary bg-surface px-4 text-sm font-extrabold uppercase text-primary"
              >
                {t('task.submit')}
              </button>
              {form && (
                <>
                  {open.length > 1 && (
                    <ChipSelect
                      testid="submit-pick"
                      label={t('task.pick')}
                      value={String(cur.id)}
                      onChange={(v) => setTask(open.find((x) => x.id === Number(v)) ?? null)}
                      options={open.map((x) => ({ value: String(x.id), label: x.title }))}
                    />
                  )}
                  <SubmitBox key={cur.id} workId={w.id} assignment={cur} onSupport={() => setSupport(true)} onDone={onSubmitted} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
