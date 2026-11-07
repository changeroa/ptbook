import { Link } from "react-router-dom";

export function Dashboard() {
  return (
    <div className="page">
      <h1>오늘의 운동, 같이 끝내요.</h1>
      <p className="calm">
        코치에게 “오늘 하체 계획 짜줘”라고 말해보세요.
        수면을 참고한 계획을 확인하고 적용하면, 세트를 기록할 때마다 진행이 갱신돼요.
      </p>
      <section className="card">
        <h2>세트 사이에 필요한 한 가지</h2>
        <p>중량·횟수·체감 강도를 알려주면 다음 행동과 관련 영상 구간을 찾아드려요.</p>
        <p>식사는 공개 사진 샘플을 분석하거나 음식과 분량을 적어주세요. 영상은 소유자가 제공한 스쿼트 샘플의 저장된 분석을 확인할 수 있어요.</p>
        <p className="calm">게스트 수면은 체험용 예시이고 기록은 임시 저장돼요. 로그인 사용자는 자신의 원장을 다시 읽을 수 있어요.</p>
        <Link to="/app/mobile">휴대폰에서 같은 코치 열기</Link>
      </section>
    </div>
  );
}
