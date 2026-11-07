/**
 * "Talk on mobile" — a QR code to this agent in the guuey portal
 * (app.guuey.com and its env twins). The QR targets the agent's CARD page
 * (`/agent/<slug-or-appId>`), which resolves the live endpoint itself —
 * never the chat route directly. Plain URL today; upgrades to a native
 * deep link when portal applinks land (same path, so the QR stays valid).
 */
import { appConfig } from "../config";
import { QrLink } from "../components/QrLink";

export function TalkOnMobile() {
  const link = appConfig.link;
  const target = link ? `${link.portalUrl}/agent/${link.slug ?? link.appId}` : null;

  return (
    <div className="page mobile-page">
      <h1>휴대폰에서 계속</h1>
      {target ? (
        <>
          <p className="calm">
            QR을 스캔하면 Guuey Portal에서 같은 코치를 열어요.
            Portal은 별도 로그인이며 새 대화로 시작해요.
          </p>
          <QrLink url={target} size={240} />
        </>
      ) : (
        <p className="calm">
          배포된 코치와 연결한 뒤 QR이 표시돼요.
        </p>
      )}
    </div>
  );
}
