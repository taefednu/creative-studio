import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { ApiError } from '../api'
import type { ShellContext } from '../components/AppShell'
import ErrorText, { errorKey } from '../components/ErrorText'
import GenStage from '../components/GenStage'
import PublishBox from '../components/PublishBox'
import StoryBook from '../components/StoryBook'
import SupportCard from '../components/SupportCard'
import { STORY_POLLING, bookPages, loadStory } from '../features/story/story'
import type { Story as StoryT } from '../features/story/story'
import type { Work } from '../features/works/works'

/** Экран сказки: пока пишется, настоящие стадии; страницы показываются, только когда прошли проверку. */
export default function Story() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const { reloadMe } = useOutletContext<ShellContext>()
  const [story, setStory] = useState<StoryT | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const polling = !story || STORY_POLLING.includes(story.status)

  useEffect(() => {
    if (!polling) return
    let alive = true
    const tick = () =>
      loadStory(id)
        .then((s) => {
          if (!alive) return
          setStory(s)
          if (!STORY_POLLING.includes(s.status)) reloadMe()
        })
        .catch((x) => alive && x instanceof ApiError && x.status === 404 && setErr(errorKey(x)))
    void tick()
    const timer = setInterval(() => void tick(), 1500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id, polling, reloadMe])

  if (err) return <div className="mx-auto mt-10 max-w-md"><ErrorText code={err} /></div>
  if (!story) return null
  if (story.status === 'support') return <SupportCard testid="story-support" body="create.supportText" />
  const ready = story.pages.filter((p) => p.ok).length
  if (story.status === 'checking' || story.status === 'writing' || (story.status === 'drawing' && ready === 0)) {
    const stage = { status: story.status === 'drawing' ? 'generating' : 'checking', idea: story.idea, kind: 'story' } as unknown as Work
    const title = t(story.status === 'checking' ? 'story.checking' : story.status === 'writing' ? 'story.writing' : 'story.drawing')
    return <GenStage work={stage} title={title} />
  }
  if (story.status === 'held' || story.status === 'refused' || story.status === 'failed') {
    return (
      <div data-testid={`story-${story.status}`} className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-[28px] border border-border bg-surface p-6 text-center shadow-card">
        <img src={story.status === 'held' ? '/art/shield.webp' : '/art/robot-happy.webp'} alt="" className="h-28 w-28 object-contain" />
        <h1 className="text-2xl font-extrabold text-heading">{t(`story.${story.status}Title`)}</h1>
        <p className="text-text">{t(`story.${story.status}Text`)}</p>
        <Link to="/create" className="flex h-12 items-center rounded-full bg-primary px-8 font-extrabold uppercase text-primary-fg">{t('story.toCreate')}</Link>
      </div>
    )
  }
  return (
    <div data-testid={`story-${story.status}`} className="mx-auto max-w-[1180px]">
      <StoryBook title={story.title} pages={bookPages(story)}>
        {story.status === 'drawing' && <p data-testid="story-progress" className="gen-title font-extrabold text-primary">{t('story.drawingLeft')}</p>}
        {story.status === 'ready' && story.cover_work_id !== null && (
          <div data-testid="story-actions" className="mt-2 flex flex-col gap-2">
            <PublishBox workId={story.cover_work_id} />
            <Link to="/create" data-testid="story-more" className="text-center text-sm font-extrabold text-primary underline">{t('story.toCreate')}</Link>
          </div>
        )}
      </StoryBook>
    </div>
  )
}
