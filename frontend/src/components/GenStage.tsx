import { useTranslation } from 'react-i18next'
import type { Work } from '../features/works/works'
import DrawingStage from './DrawingStage'

/**
 * Экран рисования (work-progress). Стадии идут только от настоящих статусов работы:
 * checking → generating → generating с файлом (идёт проверка картинки). Процентов и таймера нет: их неоткуда взять.
 * Облако цвета из образца стиля, а не из картинки ребёнка: готовую работу показываем только после проверки.
 */
export default function GenStage({ work, sample = '/art/custom-style.webp', styleName, title: fixed }: { work: Work; sample?: string; styleName?: string; title?: string }) {
  const { t } = useTranslation()
  const drawn = work.status === 'generating' && !!work.drawn
  const painting = work.status === 'generating'
  const upload = work.kind === 'upload'
  const title = fixed ?? (drawn
    ? t('gen.verify')
    : painting
      ? work.kind === 'alive' ? t('gen.alive') : t('gen.draw', { style: styleName ?? '', interpolation: { escapeValue: false } })
      : t(upload ? 'gen.readUpload' : 'gen.read'))

  return (
    <div data-testid="work-progress">
      <DrawingStage src={sample} cloud words={(work.idea || styleName || '').split(/\s+/).filter(Boolean).slice(0, 8)} phase={painting ? 'glow' : 'look'} title={title} />
      {work.rewrite_text && (
        <p data-testid="rewrite" className="mx-auto -mt-6 max-w-xl rounded-2xl bg-primary-soft px-4 py-2 text-center text-base font-bold text-heading">
          {t('create.rewrite', { text: work.rewrite_text })}
        </p>
      )}
    </div>
  )
}
