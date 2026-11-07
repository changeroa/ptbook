/**
 * ptbook:sleep-B. Single-file blueprint: only react, @ggui-ai/design and
 * @ggui-ai/wire imports (sandbox externals), because the pool-artifact code
 * body is compiled in isolation by guuey deploy. Every colour, size and
 * spacing is a --ggui-* theme token or a design primitive prop.
 */
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, Heading, Row, Skeleton, Stack, Text } from "@ggui-ai/design";
import { useAction } from "@ggui-ai/wire";

type DataMode = "live" | "imported" | "sample" | "estimated";
type Status = "ready" | "loading" | "empty" | "error";
type Intensity = "keep" | "lower" | "rest";

export interface SleepBProps {
  readonly variant: "sleep-B";
  readonly dataMode: DataMode;
  readonly status: Status;
  readonly statusText?: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly sleep: {
    readonly date: string;
    readonly totalMinutes: number | null;
    readonly deepMinutes: number | null;
    readonly remMinutes: number | null;
    readonly efficiencyPct: number | null;
  };
  readonly recommendation: {
    readonly intensity: Intensity;
    readonly label: string;
    readonly reason: string;
  };
  readonly thresholds?: {
    readonly minTotalMinutes?: number;
    readonly minEfficiencyPct?: number;
  };
}

interface ProposePlanPayload {
  readonly sleepDate: string;
  readonly intensity: Intensity;
}

const MODE_LABEL: Record<DataMode, string> = {
  live: "실시간",
  imported: "가져온 기록",
  sample: "샘플",
  estimated: "추정",
};

const INTENSITY_LABEL: Record<Intensity, string> = {
  keep: "평소대로",
  lower: "강도 낮춤",
  rest: "오늘은 휴식",
};

const INTENSITIES: readonly Intensity[] = ["keep", "lower", "rest"];

const ROOT_STYLE = {
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
  fontFamily: "var(--ggui-font-family-sans)",
} as const;

/* 56px primary action = spacing-10 (40px) + spacing-4 (16px), token-derived. */
const PRIMARY_ACTION_STYLE = {
  minHeight: "calc(var(--ggui-spacing-10) + var(--ggui-spacing-4))",
} as const;

/* 44px chip = spacing-8 (32px) + spacing-3 (12px), token-derived. */
const CHIP_STYLE = {
  minHeight: "calc(var(--ggui-spacing-8) + var(--ggui-spacing-3))",
} as const;

const CHIP_SELECTED_STYLE = {
  ...CHIP_STYLE,
  background: "var(--ggui-color-onContainer)",
  color: "var(--ggui-color-container)",
  borderColor: "var(--ggui-color-onContainer)",
} as const;

const METRIC_VALUE_STYLE = {
  fontSize: "var(--ggui-font-size-4xl)",
  fontWeight: "var(--ggui-font-weight-bold)",
  letterSpacing: "var(--ggui-letter-spacing-heading)",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ggui-color-onContainer)",
} as const;

const SUB_VALUE_STYLE = {
  fontSize: "var(--ggui-font-size-xl)",
  fontWeight: "var(--ggui-font-weight-semibold)",
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ggui-color-onContainer)",
} as const;

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function fmtPct(v: number): string {
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
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
        <Text size="sm" tone="muted">{text ?? "수면 기록을 확인하고 있어요"}</Text>
        <div aria-hidden="true">
          <Stack gap="sm">
            <Skeleton variant="rect" height="var(--ggui-spacing-12)" radius="md" />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="40%" />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}

function HeroMetric({ value, label }: { value: number | null; label: string }) {
  return (
    <Stack gap="xs">
      <Row gap="xs" align="end">
        {value === null ? (
          <span style={SUB_VALUE_STYLE}>기록 없음</span>
        ) : (
          <span style={METRIC_VALUE_STYLE}>{fmtMinutes(value)}</span>
        )}
      </Row>
      <Text size="sm" tone="muted">{label}</Text>
    </Stack>
  );
}

function SubMetric({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  return (
    <Stack gap="xs">
      <Row gap="xs" align="end">
        <span style={SUB_VALUE_STYLE}>{value === null ? "기록 없음" : unit === "%" ? fmtPct(value) : fmtMinutes(value)}</span>
        {value !== null && unit === "%" ? <Text size="sm" tone="muted">%</Text> : null}
      </Row>
      <Text size="sm" tone="muted">{label}</Text>
    </Stack>
  );
}

function IntensityPicker({
  value,
  onChange,
  disabled,
}: {
  value: Intensity;
  onChange: (next: Intensity) => void;
  disabled: boolean;
}) {
  return (
    <Row gap="sm" wrap aria-label="오늘 강도 선택">
      {INTENSITIES.map((i) => {
        const selected = i === value;
        return (
          <Button
            key={i}
            type="button"
            variant="outline"
            size="md"
            style={selected ? CHIP_SELECTED_STYLE : CHIP_STYLE}
            aria-pressed={selected}
            disabled={disabled}
            onPress={() => onChange(i)}
          >
            {INTENSITY_LABEL[i]}
          </Button>
        );
      })}
    </Row>
  );
}

function ReadyBody({ sleep, recommendation, thresholds }: Pick<SleepBProps, "sleep" | "recommendation" | "thresholds">) {
  const proposePlan = useAction<ProposePlanPayload>("propose_plan");
  const [intensity, setIntensity] = useState<Intensity>(recommendation.intensity);
  const [submitted, setSubmitted] = useState(false);

  const belowTotal =
    sleep.totalMinutes !== null &&
    thresholds?.minTotalMinutes !== undefined &&
    sleep.totalMinutes < thresholds.minTotalMinutes;
  const belowEff =
    sleep.efficiencyPct !== null &&
    thresholds?.minEfficiencyPct !== undefined &&
    sleep.efficiencyPct < thresholds.minEfficiencyPct;

  return (
    <Stack gap="lg">
      <Row gap="lg" align="end" wrap>
        <HeroMetric value={sleep.totalMinutes} label={`${sleep.date} 총 수면`} />
        <SubMetric value={sleep.efficiencyPct} unit="%" label="효율" />
      </Row>
      <Row gap="lg" wrap>
        <SubMetric value={sleep.deepMinutes} unit="min" label="깊은 잠" />
        <SubMetric value={sleep.remMinutes} unit="min" label="REM" />
      </Row>
      {thresholds ? (
        <Text size="sm" tone="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          기준
          {thresholds.minTotalMinutes !== undefined ? ` · 총 수면 ${fmtMinutes(thresholds.minTotalMinutes)} 이상` : ""}
          {thresholds.minEfficiencyPct !== undefined ? ` · 효율 ${fmtPct(thresholds.minEfficiencyPct)}% 이상` : ""}
          {belowTotal || belowEff ? " · 오늘은 기준 아래" : ""}
        </Text>
      ) : null}

      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="md">
          <Stack gap="xs">
            <Heading level={3}>{recommendation.label}</Heading>
            <Text size="sm">{recommendation.reason}</Text>
          </Stack>
          <IntensityPicker value={intensity} onChange={setIntensity} disabled={submitted} />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            style={PRIMARY_ACTION_STYLE}
            disabled={submitted}
            loading={submitted}
            aria-disabled={submitted}
            onPress={() => {
              if (submitted) return;
              setSubmitted(true);
              proposePlan({ sleepDate: sleep.date, intensity });
            }}
          >
            {INTENSITY_LABEL[intensity]}로 오늘 계획 만들기
          </Button>
          {submitted ? (
            <div role="status" aria-live="polite"><Text size="sm" tone="muted">
              계획을 만드는 중이에요. 완료되면 계획표 카드가 나타나요
            </Text></div>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}

export default function SleepBCard(props: SleepBProps) {
  const { status, statusText, title, sourceLabel, dataMode, sleep, recommendation, thresholds } = props;

  let body: ReactNode;
  if (status === "loading") {
    body = <LoadingBody text={statusText} />;
  } else if (status === "error") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold" tone="error">수면 기록을 불러오지 못했어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "잠시 후 다시 요청해 주세요"}</Text>
        </Stack>
      </Card>
    );
  } else if (status === "empty") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold">{sleep.date} 수면 기록이 없어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "기록이 동기화되면 강도 제안을 다시 받을 수 있어요"}</Text>
        </Stack>
      </Card>
    );
  } else {
    body = <ReadyBody sleep={sleep} recommendation={recommendation} thresholds={thresholds} />;
  }

  return (
    <div lang="ko" style={ROOT_STYLE} data-blueprint="ptbook:sleep-B">
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
