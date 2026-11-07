/**
 * ptbook:plan-A. Single-file blueprint: only react, @ggui-ai/design and
 * @ggui-ai/wire imports (sandbox externals), because the pool-artifact code
 * body is compiled in isolation by guuey deploy. Every colour, size and
 * spacing is a --ggui-* theme token or a design primitive prop.
 */
import { useState, type ReactNode } from "react";
import { Badge, Button, Card, Heading, Row, Skeleton, Stack, Text } from "@ggui-ai/design";
import { useAction } from "@ggui-ai/wire";

type DataMode = "live" | "imported" | "sample" | "estimated";
type Status = "ready" | "loading" | "empty" | "error";

export interface PlanRow {
  readonly id: string;
  readonly exercise: string;
  readonly sets: number;
  readonly targetKg: number | null;
  readonly targetReps: number;
  readonly completedSets: number;
}

export interface Plan {
  readonly id: string;
  readonly date: string;
  readonly revision: number;
  readonly status: "draft" | "applied" | "in_progress" | "completed";
  readonly rows: readonly PlanRow[];
  readonly reason: string;
  readonly sleepDate?: string | null;
}

export interface PlanAProps {
  readonly variant: "plan-A";
  readonly dataMode: DataMode;
  readonly status: Status;
  readonly statusText?: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly date: string;
  readonly current: Plan | null;
  readonly candidate: Plan | null;
  readonly confirmation: {
    readonly state: "idle" | "pending" | "applied" | "kept" | "stale";
    readonly message?: string;
  };
}

interface PlanActionPayload {
  readonly candidateId: string;
  readonly expectedRevision: number;
  readonly date: string;
}

const MODE_LABEL: Record<DataMode, string> = {
  live: "실시간",
  imported: "가져온 기록",
  sample: "샘플",
  estimated: "추정",
};

const STATUS_LABEL: Record<Plan["status"], string> = {
  draft: "제안",
  applied: "적용됨",
  in_progress: "진행 중",
  completed: "완료",
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

/* 64px ledger row = spacing-12 (48px) + spacing-4 (16px). */
const LEDGER_ROW_STYLE = {
  minHeight: "calc(var(--ggui-spacing-12) + var(--ggui-spacing-4))",
  paddingBlock: "var(--ggui-spacing-2)",
  borderBottom: "1px solid var(--ggui-color-outlineVariant)",
} as const;

const NUM_STYLE = { fontVariantNumeric: "tabular-nums" } as const;

function fmt(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

/** 총 부하 = Σ sets × reps × kg (맨몸 행은 kg 0으로 센다). */
function totalLoad(plan: Plan): number | null {
  if (plan.rows.some(r => r.targetKg === null)) return null;
  return plan.rows.reduce((sum, r) => sum + r.sets * r.targetReps * (r.targetKg ?? 0), 0);
}

function totalSets(plan: Plan): number {
  return plan.rows.reduce((sum, r) => sum + r.sets, 0);
}

function rowLabel(r: PlanRow): string {
  const load = r.targetKg === null ? "중량 미정" : r.targetKg === 0 ? "맨몸" : `${fmt(r.targetKg)}kg`;
  return `${r.sets}세트 × ${r.targetReps}회 · ${load}`;
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
        <Text size="sm" tone="muted">{text ?? "계획을 확인하고 있어요"}</Text>
        <div aria-hidden="true">
          <Stack gap="sm">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="rect" height="var(--ggui-spacing-12)" radius="md" />
            <Skeleton variant="rect" height="var(--ggui-spacing-12)" radius="md" />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}

function PlanLedger({ plan, showProgress }: { plan: Plan; showProgress: boolean }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="운동 계획 행">
      {plan.rows.map((r) => {
        const done = r.completedSets >= r.sets;
        return (
          <li key={r.id} style={LEDGER_ROW_STYLE}>
            <Row gap="md" align="center" justify="between">
              <Stack gap="xs">
                <Text weight="semibold">{r.exercise}</Text>
                <Text size="sm" tone="muted" style={NUM_STYLE}>{rowLabel(r)}</Text>
              </Stack>
              {showProgress ? (
                <Badge variant={done ? "success" : "default"} size="md" pill>
                  <span style={NUM_STYLE}>{r.completedSets}/{r.sets}</span>
                </Badge>
              ) : null}
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

function Totals({ plan, label }: { plan: Plan; label: string }) {
  return (
    <Stack gap="xs">
      <Text size="xs" tone="muted" caps>{label}</Text>
      <Text size="sm" style={NUM_STYLE}>
        {totalSets(plan)}세트 · {totalLoad(plan) === null ? "미정 중량 포함" : `총 부하 ${fmt(totalLoad(plan) ?? 0)}kg`}
      </Text>
    </Stack>
  );
}

function Confirmation({
  current,
  candidate,
  date,
  state,
  message,
}: {
  current: Plan | null;
  candidate: Plan;
  date: string;
  state: PlanAProps["confirmation"]["state"];
  message?: string;
}) {
  const applyPlan = useAction<PlanActionPayload>("apply_plan");
  const keepPlan = useAction<PlanActionPayload>("keep_plan");
  const [submitted, setSubmitted] = useState<"apply" | "keep" | null>(null);

  const payload: PlanActionPayload = {
    candidateId: candidate.id,
    expectedRevision: candidate.revision,
    date,
  };
  const settled = state === "applied" || state === "kept" || state === "stale";
  const busy = submitted !== null || state === "pending";
  const prevLoad = current ? totalLoad(current) : null;
  const nextLoad = totalLoad(candidate);
  const deltaPct = prevLoad !== null && prevLoad > 0 && nextLoad !== null
    ? Math.round(((nextLoad - prevLoad) / prevLoad) * 100) : null;

  return (
    <Card surface="sunken" padding="md" radius="md" shadow="none">
      <Stack gap="md">
        <Row gap="sm" align="center" justify="between" wrap>
          <Heading level={3}>제안된 변경</Heading>
          <Badge variant="info" size="sm" pill>revision {candidate.revision}</Badge>
        </Row>
        <Text size="sm">{candidate.reason}</Text>
        <PlanLedger plan={candidate} showProgress={false} />
        <Row gap="lg" wrap>
          {current ? <Totals plan={current} label="변경 전" /> : null}
          <Totals plan={candidate} label="변경 후" />
          {deltaPct !== null ? (
            <Stack gap="xs">
              <Text size="xs" tone="muted" caps>부하 차이</Text>
              <Text size="sm" weight="semibold" style={NUM_STYLE} tone={deltaPct < 0 ? "warning" : "success"}>
                {deltaPct > 0 ? "+" : ""}{deltaPct}%
              </Text>
            </Stack>
          ) : null}
        </Row>

        {settled ? (
          <div role="status" aria-live="polite"><Text size="sm" weight="semibold" tone={state === "stale" ? "warning" : "success"}>
            {message ?? (state === "applied" ? "적용됐어요" : state === "kept" ? "기존 계획을 유지했어요" : "계획이 바뀌었어요. 최신 계획을 다시 불러오세요")}
          </Text></div>
        ) : (
          <Stack gap="sm">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              style={PRIMARY_ACTION_STYLE}
              disabled={busy}
              loading={submitted === "apply" || state === "pending"}
              aria-disabled={busy}
              onPress={() => {
                if (busy) return;
                setSubmitted("apply");
                applyPlan(payload);
              }}
            >
              이 계획 적용
            </Button>
            <Button
              variant="outline"
              size="lg"
              fullWidth
              disabled={busy}
              loading={submitted === "keep"}
              aria-disabled={busy}
              onPress={() => {
                if (busy) return;
                setSubmitted("keep");
                keepPlan(payload);
              }}
            >
              기존 계획 유지
            </Button>
            {busy ? (
              <div role="status" aria-live="polite"><Text size="sm" tone="muted">
                {message ?? "서버에서 확인하는 중이에요. 완료되면 이 카드가 갱신돼요"}
              </Text></div>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

export default function PlanACard(props: PlanAProps) {
  const { status, statusText, title, sourceLabel, dataMode, date, current, candidate, confirmation } = props;

  let body: ReactNode;
  if (status === "loading") {
    body = <LoadingBody text={statusText} />;
  } else if (status === "error") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold" tone="error">계획을 불러오지 못했어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "잠시 후 다시 요청해 주세요"}</Text>
        </Stack>
      </Card>
    );
  } else if (status === "empty" || (!current && !candidate)) {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold">오늘 계획이 아직 없어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "수면 기록을 바탕으로 오늘 계획을 만들어 달라고 말해 보세요"}</Text>
        </Stack>
      </Card>
    );
  } else {
    const shown = candidate ?? current;
    const rows = shown?.rows.filter(row => !candidate || !current || current.rows.every(old =>
      old.id !== row.id || old.sets !== row.sets || old.targetKg !== row.targetKg || old.targetReps !== row.targetReps)) ?? [];
    body = (
      <Stack gap="md">
        {shown ? (
          <Stack gap="sm">
            <PlanLedger plan={{ ...shown, rows }} showProgress={!candidate} />
            <Totals plan={shown} label="오늘 합계" />
          </Stack>
        ) : null}
      </Stack>
    );
  }

  return (
    <div lang="ko" style={ROOT_STYLE} data-blueprint="ptbook:plan-A">
      <Card padding="lg" radius="lg" shadow="none" border>
        <Stack gap="md">
          <Heading level={2}>{title}</Heading>
          {body}
        </Stack>
      </Card>
    </div>
  );
}
