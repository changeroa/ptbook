import { Card, Heading, Progress, Row, Stack, Text } from "@ggui-ai/design";

type Macro = { carbG: number; proteinG: number; fatG: number };
type Meal = { id: string; label: string; kcal: number; macros: Macro; occurredAt: string; corrected: boolean };
export interface DietAProps {
  readonly variant: "diet-A";
  readonly flow: "record-first";
  readonly dataMode: "live" | "imported" | "sample" | "estimated";
  readonly status: "ready" | "loading" | "empty" | "error";
  readonly statusText?: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly date: string;
  readonly totals: { kcal: number; macros: Macro };
  readonly target: { kcal: number | null };
  readonly lastMeal: Meal | null;
  readonly uploadUrl: string;
}
const rootStyle = { wordBreak: "keep-all", overflowWrap: "anywhere", fontFamily: "var(--ggui-font-family-sans)" } as const;
const numberStyle = { fontVariantNumeric: "tabular-nums" } as const;
const fmt = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

export default function DietACard(props: DietAProps) {
  const meal = props.lastMeal;
  const target = props.target.kcal ?? 2000;
  return <div lang="ko" style={rootStyle} data-blueprint="ptbook:diet-A">
    <Card padding="lg" radius="lg" shadow="none" border><Stack gap="lg">
      <Heading level={2}>{props.status === "empty" ? "오늘 식사 기록이 없어요" : props.title}</Heading>
      {props.status === "loading" || props.status === "error" ? <div role="status"><Text>{props.statusText ?? "잠시 후 다시 확인해주세요."}</Text></div> : <>
        <Row gap="sm" align="end"><span style={{ ...numberStyle, fontSize: "var(--ggui-font-size-4xl)", fontWeight: 700 }}>
          {fmt(meal?.kcal ?? props.totals.kcal)}</span><Text>kcal</Text></Row>
        {meal ? <Text>{meal.label}</Text> : null}
        <Row gap="lg" wrap>
          <Text>탄수 {fmt((meal?.macros ?? props.totals.macros).carbG)}g</Text>
          <Text>단백질 {fmt((meal?.macros ?? props.totals.macros).proteinG)}g</Text>
          <Text>지방 {fmt((meal?.macros ?? props.totals.macros).fatG)}g</Text>
        </Row>
        <Stack gap="sm"><Row justify="between" wrap><Text weight="semibold">오늘 누적</Text>
          <Text style={numberStyle}>{fmt(props.totals.kcal)} / {fmt(target)} kcal</Text></Row>
          <Progress label="오늘 섭취량" value={Math.min(100, props.totals.kcal / target * 100)} max={100} size="lg" />
          {props.target.kcal === null ? <Text size="sm" tone="muted">기본 목표 {fmt(target)}kcal</Text> : null}
        </Stack>
      </>}
      <a href={props.uploadUrl} target="_blank" rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "56px",
          borderRadius: "var(--ggui-shape-radius-control)", background: "var(--ggui-color-primary-500)",
          color: "var(--ggui-color-onPrimary)", textDecoration: "none", fontWeight: 600 }}>식단 사진 올리기</a>
    </Stack></Card>
  </div>;
}
