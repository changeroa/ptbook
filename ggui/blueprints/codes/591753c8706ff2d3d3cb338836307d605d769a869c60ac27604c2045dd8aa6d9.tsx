/**
 * ptbook:set-B. Single-file blueprint: only react, @ggui-ai/design and
 * @ggui-ai/wire imports (sandbox externals), because the pool-artifact code
 * body is compiled in isolation by guuey deploy. Every colour, size and
 * spacing is a --ggui-* theme token or a design primitive prop.
 */
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, Heading, Progress, Row, Skeleton, Stack, Text } from "@ggui-ai/design";
import { useAction } from "@ggui-ai/wire";

type DataMode = "live" | "imported" | "sample" | "estimated";
type Status = "ready" | "loading" | "empty" | "error";

export interface SetBProps {
  readonly variant: "set-B";
  readonly dataMode: DataMode;
  readonly status: Status;
  readonly statusText?: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly record: {
    readonly id: string;
    readonly occurredAt: string;
    readonly planRowId: string | null;
    readonly exercise: string;
    readonly kg: number;
    readonly reps: number;
    readonly rpe: number | null;
    readonly note: string | null;
  };
  readonly observation: {
    readonly observed: boolean;
    readonly items: readonly string[];
  };
  readonly coaching: {
    readonly change: string;
    readonly why: string;
  };
  readonly next: {
    readonly exercise: string;
    readonly kg: number;
    readonly reps: number;
    readonly cue: string | null;
  };
  readonly progress: {
    readonly completedSets: number;
    readonly totalSets: number;
  } | null;
}

interface LogNextSetPayload {
  readonly planRowId: string | null;
  readonly exercise: string;
  readonly kg: number;
  readonly reps: number;
  readonly rpe: number | null;
}

const MODE_LABEL: Record<DataMode, string> = {
  live: "실시간",
  imported: "가져온 기록",
  sample: "샘플",
  estimated: "추정",
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

function fmt(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
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
        <Text size="sm" tone="muted">{text ?? "세트 기록을 확인하고 있어요"}</Text>
        <div aria-hidden="true">
          <Stack gap="sm">
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="rect" height="var(--ggui-spacing-12)" radius="md" />
            <Skeleton variant="text" width="80%" />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}

function Metric({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <Stack gap="xs">
      <Row gap="xs" align="end">
        <span style={METRIC_VALUE_STYLE}>{value}</span>
        {unit ? <Text size="sm" tone="muted">{unit}</Text> : null}
      </Row>
      <Text size="sm" tone="muted">{label}</Text>
    </Stack>
  );
}

function ReadyBody({ record, observation, coaching, next, progress }: Pick<SetBProps, "record" | "observation" | "coaching" | "next" | "progress">) {
  const logNextSet = useAction<LogNextSetPayload>("log_next_set");
  const [submitted, setSubmitted] = useState(false);
  const kgDelta = next.kg - record.kg;

  return (
    <Stack gap="lg">
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="md">
          <Row gap="sm" align="center" justify="between" wrap>
            <Heading level={3}>다음 세트: {coaching.change}</Heading>
            {kgDelta !== 0 ? (
              <Badge variant={kgDelta < 0 ? "warning" : "success"} size="sm" pill>
                <span style={NUM_STYLE}>{kgDelta > 0 ? "+" : ""}{fmt(kgDelta)}kg</span>
              </Badge>
            ) : null}
          </Row>
          <Row gap="lg" align="end" wrap>
            <Metric value={fmt(next.kg)} unit="kg" label={next.exercise} />
            <Metric value={String(next.reps)} unit="회" label="목표 횟수" />
          </Row>
          {next.cue ? <Text size="sm" weight="semibold">자세 큐 · {next.cue}</Text> : null}
          <Text size="sm">{coaching.why}</Text>
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
              logNextSet({ planRowId: record.planRowId, exercise: next.exercise, kg: next.kg, reps: next.reps, rpe: null });
            }}
          >
            이대로 다음 세트 기록
          </Button>
          {submitted ? (
            <div role="status" aria-live="polite"><Text size="sm" tone="muted">
              기록하는 중이에요. 저장되면 진행 상황이 갱신돼요
            </Text></div>
          ) : null}
        </Stack>
      </Card>

      <Stack gap="sm">
        <Text size="xs" tone="muted" caps>방금 기록</Text>
        <Row gap="sm" align="center" justify="between" wrap>
          <Text weight="semibold">{record.exercise}</Text>
          <Text size="sm" tone="muted" style={NUM_STYLE}>{fmtTime(record.occurredAt)}</Text>
        </Row>
        <Text style={NUM_STYLE}>
          {fmt(record.kg)}kg × {record.reps}회{record.rpe !== null ? ` · RPE ${fmt(record.rpe)}` : ""}
        </Text>
        {record.note ? <Text size="sm" tone="muted">메모 · {record.note}</Text> : null}
        <Text size="sm" tone="muted">
          {observation.observed && observation.items.length > 0
            ? `보고한 관찰 · ${observation.items.join(" · ")}`
            : "관찰 없음 · 사용자가 보고한 내용만 반영해요"}
        </Text>
      </Stack>

      {progress ? (
        <Stack gap="xs">
          <Row gap="sm" align="center" justify="between">
            <Text size="sm" tone="muted">오늘 계획 진행</Text>
            <Text size="sm" weight="semibold" style={NUM_STYLE}>{progress.completedSets}/{progress.totalSets} 세트</Text>
          </Row>
          <Progress
            value={Math.min(progress.completedSets, progress.totalSets)}
            max={progress.totalSets}
            size="md"
            variant={progress.completedSets >= progress.totalSets ? "success" : "default"}
            label="오늘 계획 진행"
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

export default function SetBCard(props: SetBProps) {
  const { status, statusText, title, sourceLabel, dataMode, record, observation, coaching, next, progress } = props;

  let body: ReactNode;
  if (status === "loading") {
    body = <LoadingBody text={statusText} />;
  } else if (status === "error") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold" tone="error">세트를 기록하지 못했어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "다시 말해 주시면 기록을 시도할게요"}</Text>
        </Stack>
      </Card>
    );
  } else if (status === "empty") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold">오늘 기록된 세트가 없어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "운동·중량·횟수를 말하면 바로 기록해요"}</Text>
        </Stack>
      </Card>
    );
  } else {
    body = <ReadyBody record={record} observation={observation} coaching={coaching} next={next} progress={progress} />;
  }

  return (
    <div lang="ko" style={ROOT_STYLE} data-blueprint="ptbook:set-B">
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
