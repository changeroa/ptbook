import { useEffect, useState } from "react";
import { Button, Card, Heading, Progress, Row, Stack, Text } from "@ggui-ai/design";

type Macro = { carbG: number; proteinG: number; fatG: number };
type Meal = { id: string; label: string; kcal: number; macros: Macro; occurredAt: string; corrected: boolean };
type Daily = { kcal: number; macros: Macro; targetKcal: number | null };
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
  readonly editUrl: string | null;
}
const rootStyle = { wordBreak: "keep-all", overflowWrap: "anywhere", fontFamily: "var(--ggui-font-family-sans)" } as const;
const numberStyle = { fontVariantNumeric: "tabular-nums" } as const;
const inputStyle = {
  width: "100%", minHeight: "44px", padding: "var(--ggui-spacing-3)", borderRadius: "var(--ggui-shape-radius-control)",
  border: "1px solid var(--ggui-color-outlineVariant)", background: "var(--ggui-color-container)",
  color: "var(--ggui-color-onContainer)", font: "inherit",
} as const;
const fmt = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

function readMacro(value: unknown): Macro | null {
  if (typeof value !== "object" || value === null) return null;
  const carbG: unknown = Reflect.get(value, "carbG");
  const proteinG: unknown = Reflect.get(value, "proteinG");
  const fatG: unknown = Reflect.get(value, "fatG");
  return typeof carbG === "number" && typeof proteinG === "number" && typeof fatG === "number"
    ? { carbG, proteinG, fatG } : null;
}
function readResult(value: unknown): { meal: Meal; daily: Daily } | null {
  if (typeof value !== "object" || value === null || Reflect.get(value, "ok") !== true) return null;
  const meal: unknown = Reflect.get(value, "meal");
  const daily: unknown = Reflect.get(value, "daily");
  if (typeof meal !== "object" || meal === null || typeof daily !== "object" || daily === null) return null;
  const id: unknown = Reflect.get(meal, "id");
  const label: unknown = Reflect.get(meal, "label");
  const kcal: unknown = Reflect.get(meal, "kcal");
  const occurredAt: unknown = Reflect.get(meal, "occurredAt");
  const corrected: unknown = Reflect.get(meal, "corrected");
  const macros = readMacro(Reflect.get(meal, "macros"));
  const total: unknown = Reflect.get(daily, "kcal");
  const target: unknown = Reflect.get(daily, "targetKcal");
  const totalMacros = readMacro(Reflect.get(daily, "macros"));
  if (typeof id !== "string" || typeof label !== "string" || typeof kcal !== "number" ||
    typeof occurredAt !== "string" || typeof corrected !== "boolean" || !macros ||
    typeof total !== "number" || (typeof target !== "number" && target !== null) || !totalMacros) return null;
  return { meal: { id, label, kcal, occurredAt, corrected, macros },
    daily: { kcal: total, targetKcal: target, macros: totalMacros } };
}

export default function DietACard(props: DietAProps) {
  const [meal, setMeal] = useState(props.lastMeal);
  const [daily, setDaily] = useState<Daily>({ ...props.totals, targetKcal: props.target.kcal });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setMeal(props.lastMeal); setDaily({ ...props.totals, targetKcal: props.target.kcal }); },
    [props.lastMeal, props.totals, props.target.kcal]);
  useEffect(() => {
    if (!props.editUrl || new URL(props.editUrl).origin !== "https://ptbook-mcp.changeroa.workers.dev") return;
    const controller = new AbortController();
    fetch(props.editUrl, { signal: controller.signal }).then(response => response.json()).then((body: unknown) => {
      const result = readResult(body);
      if (result) { setMeal(result.meal); setDaily(result.daily); }
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (reason instanceof Error) { setError("최신 기록은 채팅에서 다시 확인해주세요."); return; }
      throw reason;
    });
    return () => controller.abort();
  }, [props.editUrl]);
  async function save(form: HTMLFormElement) {
    if (!props.editUrl || new URL(props.editUrl).origin !== "https://ptbook-mcp.changeroa.workers.dev") return;
    const values = new FormData(form);
    setSaving(true); setError("");
    try {
      const response = await fetch(props.editUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ label: String(values.get("label")), kcal: Number(values.get("kcal")),
          macros: { carbG: Number(values.get("carbG")), proteinG: Number(values.get("proteinG")), fatG: Number(values.get("fatG")) },
          requestId: crypto.randomUUID() }),
      });
      const result = readResult(await response.json());
      if (!response.ok || !result) { setError("수정하지 못했어요. 채팅에서 바꿀 내용을 알려주세요."); return; }
      setMeal(result.meal); setDaily(result.daily); setEditing(false);
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason;
      setError("연결을 확인하고 다시 저장해주세요.");
    } finally { setSaving(false); }
  }
  return <div lang="ko" style={rootStyle} data-blueprint="ptbook:diet-A">
    <Card padding="lg" radius="lg" shadow="none" border><Stack gap="lg">
      <Row justify="between" align="center" wrap><Text size="sm" tone="muted">{props.sourceLabel}</Text>
        {meal && props.editUrl ? <Button variant="ghost" onPress={() => setEditing(value => !value)}>수정</Button> : null}</Row>
      <Heading level={2}>{props.status === "empty" ? "오늘 식사 기록이 없어요" : props.title}</Heading>
      {props.status === "loading" || props.status === "error" ? <Text role="status">{props.statusText ?? "잠시 후 다시 확인해주세요."}</Text> : <>
        <Row gap="sm" align="end"><span style={{ ...numberStyle, fontSize: "var(--ggui-font-size-4xl)", fontWeight: 700 }}>
          {fmt(meal?.kcal ?? daily.kcal)}</span><Text>kcal</Text></Row>
        {meal ? <Text>{meal.label}</Text> : null}
        <Row gap="lg" wrap>
          <Text>탄수 {fmt((meal?.macros ?? daily.macros).carbG)}g</Text>
          <Text>단백질 {fmt((meal?.macros ?? daily.macros).proteinG)}g</Text>
          <Text>지방 {fmt((meal?.macros ?? daily.macros).fatG)}g</Text>
        </Row>
        <Stack gap="sm"><Row justify="between" wrap><Text weight="semibold">오늘 누적</Text>
          <Text style={numberStyle}>{fmt(daily.kcal)}{daily.targetKcal ? ` / ${fmt(daily.targetKcal)}` : ""} kcal</Text></Row>
          {daily.targetKcal ? <Progress label="오늘 섭취량" value={Math.min(100, daily.kcal / daily.targetKcal * 100)} max={100} size="lg" /> : null}
        </Stack>
      </>}
      {editing && meal ? <form onSubmit={event => { event.preventDefault(); void save(event.currentTarget); }}>
        <Stack gap="md">
          <label>음식<input name="label" defaultValue={meal.label} maxLength={120} required style={inputStyle} /></label>
          <label>칼로리 (kcal)<input name="kcal" type="number" min={0} max={5000} step="any" defaultValue={meal.kcal} required style={inputStyle} /></label>
          <label>탄수화물 (g)<input name="carbG" type="number" min={0} max={1000} step="any" defaultValue={meal.macros.carbG} required style={inputStyle} /></label>
          <label>단백질 (g)<input name="proteinG" type="number" min={0} max={1000} step="any" defaultValue={meal.macros.proteinG} required style={inputStyle} /></label>
          <label>지방 (g)<input name="fatG" type="number" min={0} max={1000} step="any" defaultValue={meal.macros.fatG} required style={inputStyle} /></label>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving} loading={saving}>수정 저장</Button>
        </Stack>
      </form> : null}
      {error ? <Text tone="error" role="alert">{error}</Text> : null}
    </Stack></Card>
  </div>;
}
