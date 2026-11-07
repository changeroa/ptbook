/**
 * ptbook:video-A. Single-file blueprint: only react, @ggui-ai/design and
 * @ggui-ai/wire imports (sandbox externals), because the pool-artifact code
 * body is compiled in isolation by guuey deploy. Every colour, size and
 * spacing is a --ggui-* theme token or a design primitive prop.
 */
import { type ReactNode } from "react";
import { Badge, Card, Heading, Link, Row, Skeleton, Stack, Text } from "@ggui-ai/design";
import { useAction } from "@ggui-ai/wire";

type DataMode = "live" | "imported" | "sample" | "estimated";
type Status = "ready" | "loading" | "empty" | "error";

export interface ReferenceClip {
  readonly id: string;
  readonly creator: string;
  readonly sourceUrl: string;
  readonly clipUrl: string | null;
  readonly startSec: number;
  readonly endSec: number;
  readonly label: string;
  readonly cue: string;
}

export interface VideoAProps {
  readonly variant: "video-A";
  readonly dataMode: DataMode;
  readonly status: Status;
  readonly statusText?: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly query: string;
  readonly clips: readonly ReferenceClip[];
  readonly analysisNote?: string;
}

interface OpenClipPayload {
  readonly clipId: string;
  readonly sourceUrl: string;
  readonly startSec: number;
  readonly endSec: number;
}

const MODE_LABEL: Record<DataMode, string> = {
  live: "실시간",
  imported: "가져온 기록",
  sample: "샘플",
  estimated: "추정",
};

const DEFAULT_ANALYSIS_NOTE = "내 영상 분석은 지원하지 않아요 · 참고 구간만 안내해요";

const ROOT_STYLE = {
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
  fontFamily: "var(--ggui-font-family-sans)",
} as const;

/* 64px timeline row = spacing-12 (48px) + spacing-4 (16px), token-derived. */
const TIMELINE_ROW_STYLE = {
  minHeight: "calc(var(--ggui-spacing-12) + var(--ggui-spacing-4))",
  paddingBlock: "var(--ggui-spacing-3)",
  borderBottom: "1px solid var(--ggui-color-outlineVariant)",
} as const;

const TIMESTAMP_STYLE = {
  fontFamily: "var(--ggui-font-family-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: "var(--ggui-font-size-lg)",
  fontWeight: "var(--ggui-font-weight-semibold)",
  color: "var(--ggui-color-onContainer)",
  whiteSpace: "nowrap",
} as const;

/* 56px link target = spacing-10 (40px) + spacing-4 (16px), token-derived. */
const LINK_BUTTON_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: "calc(var(--ggui-spacing-10) + var(--ggui-spacing-4))",
  paddingInline: "var(--ggui-spacing-4)",
  borderRadius: "var(--ggui-shape-radius-control)",
  background: "var(--ggui-color-primary-500)",
  color: "var(--ggui-color-onPrimary)",
  fontWeight: "var(--ggui-font-weight-semibold)",
  textDecoration: "none",
} as const;

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
        <Text size="sm" tone="muted">{text ?? "참고 구간을 찾고 있어요"}</Text>
        <div aria-hidden="true">
          <Stack gap="sm">
            <Skeleton variant="rect" height="var(--ggui-spacing-12)" radius="md" />
            <Skeleton variant="rect" height="var(--ggui-spacing-12)" radius="md" />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}

function ClipRow({ clip, primary }: { clip: ReferenceClip; primary: boolean }) {
  const openClip = useAction<OpenClipPayload>("open_clip");
  const href = clip.clipUrl ?? clip.sourceUrl;
  const fire = () => openClip({ clipId: clip.id, sourceUrl: clip.sourceUrl, startSec: clip.startSec, endSec: clip.endSec });

  return (
    <li style={TIMELINE_ROW_STYLE}>
      <Stack gap="sm">
        <Row gap="md" align="start" justify="between" wrap>
          <Stack gap="xs">
            <Row gap="sm" align="center" wrap>
              <span style={TIMESTAMP_STYLE}>{fmtClock(clip.startSec)} – {fmtClock(clip.endSec)}</span>
              {primary ? <Badge variant="primary" size="sm" pill>여기부터</Badge> : null}
            </Row>
            <Text weight="semibold">{clip.label}</Text>
            <Text size="sm">{clip.cue}</Text>
            <Text size="sm" tone="muted">{clip.creator} · 원본 영상</Text>
          </Stack>
        </Row>
        {primary ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={LINK_BUTTON_STYLE} onClick={fire}>
            원본에서 {fmtClock(clip.startSec)}부터 열기
          </a>
        ) : (
          <Link href={href} external underline="always" onClick={fire}>
            원본에서 {fmtClock(clip.startSec)}부터 열기
          </Link>
        )}
      </Stack>
    </li>
  );
}

export default function VideoACard(props: VideoAProps) {
  const { status, statusText, title, sourceLabel, dataMode, query, clips, analysisNote } = props;

  let body: ReactNode;
  if (status === "loading") {
    body = <LoadingBody text={statusText} />;
  } else if (status === "error") {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold" tone="error">참고 구간을 찾지 못했어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "다른 표현으로 다시 물어봐 주세요"}</Text>
        </Stack>
      </Card>
    );
  } else if (status === "empty" || clips.length === 0) {
    body = (
      <Card surface="sunken" padding="md" radius="md" shadow="none">
        <Stack gap="xs">
          <Text weight="semibold">"{query}"에 맞는 구간이 인덱스에 없어요</Text>
          <Text size="sm" tone="muted">{statusText ?? "운동 이름과 자세 포인트를 함께 말해 주세요"}</Text>
        </Stack>
      </Card>
    );
  } else {
    body = (
      <Stack gap="md">
        <Text size="sm" tone="muted">찾는 포인트 · {query}</Text>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="참고 영상 구간">
          {clips.map((clip, i) => (
            <ClipRow key={clip.id} clip={clip} primary={i === 0} />
          ))}
        </ol>
        <Text size="sm" tone="muted">{analysisNote ?? DEFAULT_ANALYSIS_NOTE}</Text>
      </Stack>
    );
  }

  return (
    <div lang="ko" style={ROOT_STYLE} data-blueprint="ptbook:video-A">
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
