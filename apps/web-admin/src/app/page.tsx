import Link from "next/link";

export default function AdminHomePage() {
  return (
    <main style={{ maxWidth: "960px", margin: "0 auto" }}>
      <h1>Delivery Shield — Admin</h1>
      <p>관리자 Web 골격. 사용자 지원 콘솔 Phase F 확장 중.</p>
      <nav>
        <ul>
          <li>
            <Link href="/support">사용자 지원 / 계정 복구</Link>
          </li>
          <li>전체 대시보드</li>
          <li>배송회사 관리</li>
          <li>구독/결제</li>
          <li>교통/주의구역</li>
          <li>사고접수</li>
          <li>API 상태</li>
        </ul>
      </nav>
    </main>
  );
}
