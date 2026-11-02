import { api } from '../../api'

export type StoryStatus = 'checking' | 'writing' | 'drawing' | 'ready' | 'held' | 'refused' | 'support' | 'failed'
export type StoryPage = { n: number; ok: boolean; text: string | null; image_url: string | null }
export type Story = {
  id: number
  hero_work_id: number
  cover_work_id: number | null
  status: StoryStatus
  title: string | null
  pages: StoryPage[]
  reason_codes: string[]
  idea: string | null
  created_at: string
}

export const STORY_POLLING: StoryStatus[] = ['checking', 'writing', 'drawing']
export const STORY_PAGES = 4

export const loadStory = (id: number) => api<Story>(`/api/stories/${id}`)
export const loadMyStories = () => api<Story[]>('/api/stories/mine')

/** Страницы для книжки: непришедшие остаются местами под картинку, число страниц всегда одно. */
export function bookPages(s: Story): { text: string | null; url: string | null }[] {
  return Array.from({ length: STORY_PAGES }, (_, i) => {
    const p = s.pages[i]
    return { text: p?.ok ? p.text : null, url: p?.ok ? p.image_url : null }
  })
}
