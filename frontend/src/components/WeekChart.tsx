import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { weekBars } from "../features/review/week";

const PAD = { l: 34, r: 8, t: 14, b: 28 };

/** Столбцы «картинок в день» за 7 дней по меткам готовых работ; день считает браузер. */
export default function WeekChart({ readyAt }: { readyAt: string[] }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  // размеры берём из колонки, чтобы подписи не сжимались вместе с картинкой
  const [W, setW] = useState(550);
  const H = W < 400 ? 160 : 200;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setW(Math.max(260, Math.round(el.clientWidth))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bars = weekBars(readyAt, new Date());
  const top = Math.max(
    4,
    Math.ceil(Math.max(...bars.map((b) => b.count)) / 2) * 2,
  );
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / bars.length;
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  return (
    <div ref={box} className="w-full">
      <svg
        data-testid="week-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("cab.week.chart")}
        className="block h-auto w-full"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={PAD.l - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted text-[13px]"
            >
              {Number.isInteger(v) ? v : ""}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const h = (b.count / top) * ih;
          return (
            <g key={b.key}>
              <rect
                data-testid={`week-bar-${i}`}
                data-count={b.count}
                x={PAD.l + i * slot + slot * 0.18}
                y={y(b.count)}
                width={slot * 0.64}
                height={h}
                rx="4"
                className="fill-primary"
              />
              {b.count > 0 && (
                <text
                  x={PAD.l + i * slot + slot / 2}
                  y={y(b.count) - 4}
                  textAnchor="middle"
                  className="fill-heading text-[13px] font-bold"
                >
                  {b.count}
                </text>
              )}
              <text
                x={PAD.l + i * slot + slot / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted text-[13px]"
              >
                {t(`weekday.${b.weekday}`)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
