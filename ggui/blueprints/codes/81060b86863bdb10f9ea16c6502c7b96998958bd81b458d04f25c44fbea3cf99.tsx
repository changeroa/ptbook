/**
 * ptbook:diet-A. Single-file blueprint: only react, @ggui-ai/design and
 * @ggui-ai/wire imports (sandbox externals), because the pool-artifact code
 * body is compiled in isolation by guuey deploy. Every colour, size and
 * spacing is a --ggui-* theme token or a design primitive prop.
 */
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, Heading, Progress, Row, Skeleton, Stack, Text } from "@ggui-ai/design";
import { useAction } from "@ggui-ai/wire";

type DataMode = "live" | "imported" | "sample" | "estimated";
type Status = "ready" | "loading" | "empty" | "error";
type Confidence = "low" | "medium" | "high";

export interface Macros {
  readonly carbG: number;
  readonly proteinG: number;
  readonly fatG: number;
}

export interface DietAProps {
  readonly variant: "diet-A";
  readonly dataMode: DataMode;
  readonly status: Status;
  readonly statusText?: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly date: string;
  readonly totals: { readonly kcal: number; readonly macros: Macros };
  readonly target: { readonly kcal: number | null };
  readonly estimate: {
    readonly isEstimate: boolean;
    readonly basis: "image" | "text" | "manual";
    readonly confidence: Confidence;
    readonly note: string | null;
  };
  readonly pendingEstimate: {
    readonly id: string;
    readonly label: string;
    readonly kcal: number;
    readonly macros: Macros;
    readonly confidence: Confidence;
    readonly assumptions: readonly string[];
  } | null;
  readonly lastMeal: {
    readonly id: string;
    readonly label: string;
    readonly kcal: number;
    readonly occurredAt: string;
    readonly corrected: boolean;
  } | null;
}

interface LogMealPayload {
  readonly estimateId: string;
  readonly label: string;
  readonly kcal: number;
  readonly macros: Macros;
}

interface CorrectMealPayload {
  readonly target: "estimate" | "meal";
  readonly id: string;
}

const MODE_LABEL: Record<DataMode, string> = {
  live: "실시간",
  imported: "가져온 기록",
  sample: "샘플",
  estimated: "추정",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "신뢰도 낮음",
  medium: "신뢰도 보통",
  high: "신뢰도 높음",
};

const ROOT_STYLE = {
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
  fontFamily: "var(--ggui-font-family-sans)",
} as const;

/* 56px primary action = spacing-10 (40px) + spacing-4 (16px), token-derived. */
const PRIMARY_ACTION_STYLE = {
  minHeight: "calc(var(--ggui-spacing-10) + var(--ggui-spacing-4))",
} as const;

const NUM_STYLE = { fontVariantNumeric: "tabular-nums" } as const;

const METRIC_VALUE_STYLE = {
  fontSize: "var(--ggui-font-size-4xl)",
  fontWeight: "var(--ggui-font-weight-bold)",
  letterSpacing: "var(--ggui-letter-spacing-heading)",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ggui-color-onContainer)",
} as const;

/* Macro ring geometry: viewBox 100, radius 40 → circumference 2π·40. */
const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SIZE = "calc(var(--ggui-spacing-12) * 2)";

const MACRO_COLOR = {
  carb: "var(--ggui-color-primary-500)",
  protein: "var(--ggui-color-info-500)",
  fat: "var(--ggui-color-warning-500)",
} as const;

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

/* Energy share: 4 kcal/g carb and protein, 9 kcal/g fat; null when the sum is 0. */
function energyShare(m: Macros): { carb: number; protein: number; fat: number; kcal: number } | null {
  const carb = m.carbG * 4;
  const protein = m.proteinG * 4;
  const fat = m.fatG * 9;
  const kcal = carb + protein + fat;
  if (kcal <= 0) return null;
  return { carb: (carb / kcal) * 100, protein: (protein / kcal) * 100, fat: (fat / kcal) * 100, kcal };
}

function SourceRow({ sourceLabel, dataMode }: { sourceLabel: string; dataMode: DataMode }) {
  return (
    <Row gap="sm" align="center" justify="between" wrap>
      <Text size="sm" tone="muted">{sourceLabel}</Text>
      <Badge variant={dataMode === "live" ? "success" : "default"} size="sm" pill>
        {MODE_LABEL[dataMode]}
      </Badge>
    </Row>
  );
}

function LoadingBody({ text }: { text?: string }) {
  return (
    <div role="status" aria-live="polite">
      <Stack gap="sm">
        <Text size="sm" tone="muted">{text ?? "식사를 추정하고 있어요"}</Text>
        <div aria-hidden="true">
          <Stack gap="sm">
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="rect" height="var(--ggui-spacing-6)" radius="full" />
            <Skeleton variant="circle" width={RING_SIZE} height={RING_SIZE} />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}

function MacroRing({ macros }: { macros: Macros }) {
  const share = energyShare(macros);
  const legend = [
    { key: "carb", label: "탄수화물", grams: macros.carbG, pct: share?.carb ?? null, color: MACRO_COLOR.carb },
    { key: "protein", label: "단백질", grams: macros.proteinG, pct: share?.protein ?? null, color: MACRO_COLOR.protein },
    { key: "fat", label: "지방", grams: macros.fatG, pct: share?.fat ?? null, color: MACRO_COLOR.fat },
  ] as const;
  const description = share
    ? legend.map((l) => `${l.label} ${fmt(l.grams, 1)}g (에너지 ${fmt(l.pct ?? 0)}%)`).join(", ")
    : "탄단지 기록 없음";

  let offset = 0;
  const segments = share
    ? legend.map((l) => {
        const length = ((l.pct ?? 0) / 100) * RING_CIRCUMFERENCE;
        const seg = { ...l, dash: `${length} ${RING_CIRCUMFERENCE - length}`, offset: -offset };
        offset += length;
        return seg;
      })
    : [];

  return (
    <Row gap="lg" align="center" wrap>
      <svg
        role="img"
        aria-label={`탄단지 에너지 비율: ${description}`}
        viewBox="0 0 100 100"
        style={{ width: RING_SIZE, height: RING_SIZE, flexShrink: 0 }}
      >
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--ggui-color-sunken)" strokeWidth="12" />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke={s.color}
            strokeWidth="12"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-hidden="true">
        {legend.map((l) => (
          <li key={l.key} style={{ display: "flex", alignItems: "center", gap: "var(--ggui-spacing-2)", minHeight: "var(--ggui-spacing-6)" }}>
            <span style={{ width: "var(--ggui-spacing-3)", height: "var(--ggui-spacing-3)", borderRadius: "var(--ggui-shape-radius-full)", background: l.color, flexShrink: 0 }} />
            <Text size="sm" style={NUM_STYLE}>
              {l.label} {fmt(l.grams, 1)}g{l.pct !== null ? ` · 에너지 ${fmt(l.pct)}%` : ""}
            </Text>
          </li>
        ))}
      </ul>
    </Row>
  );
}

function KcalGauge({ kcal, targetKcal }: { kcal: number; targetKcal: number | null }) {
  if (targetKcal === null || targetKcal <= 0) {
    return (
      <Stack gap="xs">
        <Row gap="xs" align="end">
          <span style={METRIC_VALUE_STYLE}>{fmt(kcal)}</span>
          <Text size="sm" tone="muted">kcal</Text>
        </Row>
        <Text size="sm" tone="muted">오늘 누적 · 목표가 없어 진행률은 표시하지 않아요</Text>
      </Stack>
    );
  }
  const pct = (kcal / targetKcal) * 100;
  const over = kcal - targetKcal;
  return (
    <Stack gap="sm">
      <Row gap="md" align="end" justify="between" wrap>
        <Row gap="xs" align="end">
          <span style={METRIC_VALUE_STYLE}>{fmt(kcal)}</span>
          <Text size="sm" tone="muted">/ {fmt(targetKcal)} kcal</Text>
        </Row>
        <Text size="sm" weight="semibold" style={NUM_STYLE} tone={over > 0 ? "warning" : "default"}>
          {fmt(pct)}%{over > 0 ? ` · ${fmt(over)}kcal 초과` : ""}
        </Text>
      </Row>
      <Progress
        value={Math.max(0, Math.min(100, pct))}
        max={100}
        size="lg"
        variant={over > 0 ? "warning" : "default"}
        label="오늘 칼로리 진행률"
      />
    </Stack>
  );
}

function PendingEstimate({ estimate, basisNote }: { estimate: NonNullable<DietAProps["pendingEstimate"]>; basisNote: string }) {
  const logMeal = useAction<LogMealPayload>("log_meal");
  const correctMeal = useAction<CorrectMealPayload>("correct_meal");
  const [submitted, setSubmitted] = useState<"log" | "correct" | null>(null);
  const busy = submitted !== null;

  return (
    <Card surface="sunken" padding="md" radius="md" shadow="none">
      <Stack gap="md">
        <Row gap="sm" align="center" justify="between" wrap>
          <Heading level={3}>기록 전 확인</Heading>
          <Badge variant={estimate.confidence === "high" ? "success" : estimate.confidence === "medium" ? "info" : "warning"} size="sm" pill>
            {CONFIDENCE_LABEL[estimate.confidence]}
          </Badge>
        </Row>
        <Text weight="semibold">{estimate.label}</Text>
        <Text style={NUM_STYLE}>
          약 {fmt(estimate.kcal)}kcal · 탄 {fmt(estimate.macros.carbG, 1)}g · 단 {fmt(estimate.macros.proteinG, 1)}g · 지 {fmt(estimate.macros.fatG, 1)}g
        </Text>
        <Text size="sm" tone="muted">{basisNote}</Text>
        {estimate.assumptions.length > 0 ? (
          <Text size="sm" tone="muted">가정 · {estimate.assumptions.join(" · ")}</Text>
        ) : null}
        <Stack gap="sm">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            style={PRIMARY_ACTION_STYLE}
            disabled={busy}
            loading={submitted === "log"}
            aria-disabled={busy}
            onPress={() => {
              if (busy) return;
              setSubmitted("log");
              logMeal({ estimateId: estimate.id, label: estimate.label, kcal: estimate.kcal, macros: estimate.macros });
            }}
          >
            이대로 기록
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            disabled={busy}
            loading={submitted === "correct"}
            aria-disabled={busy}
            onPress={() => {
              if (busy) return;
              setSubmitted("correct");
              correctMeal({ target: "estimate", id: estimate.id });
            }}
          >
            수정할게요
          </Button>
          {busy ? (
            <div role="status" aria-live="polite"><Text size="sm" tone="muted">
              {submitted === "log" ? "기록하는 중이에요. 저장되면 합계가 갱신돼요" : "무엇을 바꿀지 대화에서 이어서 물어볼게요"}
            </Text></div>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  );
}

function LastMeal({ meal }: { meal: NonNullable<DietAProps["lastMeal"]> }) {
  const correctMeal = useAction<CorrectMealPayload>("correct_meal");
  const [submitted, setSubmitted] = useState(false);

  return (
    <Row gap="md" align="center" justify="between" wrap>
      <Stack gap="xs">
        <Text size="xs" tone="muted" caps>최근 기록</Text>
        <Text weight="semibold">{meal.label}</Text>
        <Text size="sm" tone="muted" style={NUM_STYLE}>
          {fmt(meal.kcal)}kcal{meal.corrected ? " · 수정됨" : ""}
        </Text>
      </Stack>
      <Button
        variant="ghost"
        size="md"
        disabled={submitted}
        loading={submitted}
        aria-disabled={submitted}
        onPress={() => {
          if (submitted) return;
          setSubmitted(true);
          correctMeal({ target: "meal", id: meal.id });
        }}
      >
        기록 수정
      </Button>
    </Row>
  );
}

export default function DietACard(props: DietAProps) {
  const { status, statusText, title, sourceLabel, dataMode, totals, target, estimate, pendingEstimate, lastMeal } = props;
  const basisNote = estimate.basis === "image" ? "사진 기반 추정 · 공개 식사 샘플"
    : estimate.basis === "text" ? "텍스트 기반 추정 · 사진 미분석" : "직접 입력한 수치";

  let body: ReactNode;
  if (status === "loading") {
    body = <LoadingBody text={statusText} />;
  } else if (status === "error") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold" tone="error">식사를 추정하지 못했어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "먹은 음식과 양을 한 번 더 말해 주세요"}</Text>
        </Stack>
      </Card>
    );
  } else if (status === "empty") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold">오늘 식사 기록이 없어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "먹은 음식을 말하면 텍스트 기반으로 추정해서 기록해요"}</Text>
        </Stack>
      </Card>
    );
  } else {
    body = (
      <Stack gap="lg">
        <KcalGauge kcal={totals.kcal} targetKcal={target.kcal} />
        <MacroRing macros={totals.macros} />
        <Text size="sm" tone="muted">
          {estimate.isEstimate ? `${basisNote} · ${CONFIDENCE_LABEL[estimate.confidence]}` : "직접 입력한 수치"}
          {estimate.note ? ` · ${estimate.note}` : ""}
        </Text>
        {pendingEstimate ? <PendingEstimate estimate={pendingEstimate} basisNote={basisNote} /> : null}
        {lastMeal ? <LastMeal meal={lastMeal} /> : null}
      </Stack>
    );
  }

  return (
    <div lang="ko" style={ROOT_STYLE} data-blueprint="ptbook:diet-A">
      <Card padding="lg" radius="lg" shadow="none" border>
        <Stack gap="md">
          <SourceRow sourceLabel={sourceLabel} dataMode={dataMode} />
          <Heading level={2}>{title}</Heading>
          {body}
        </Stack>
      </Card>
    </div>
  );
}
