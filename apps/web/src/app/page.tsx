import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <p className={styles.brand}>Delivery Shield</p>
      <h1 className={styles.title}>배송사에 묶이지 않는 통합 배송 업무</h1>
      <p className={styles.lead}>
        송장 스캔, 배송지 핀, 경로 추천, 내비게이션 연동까지 하나의 흐름으로.
      </p>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/login">
          로그인
        </Link>
        <span className={styles.note}>Phase 0 — Landing / Login 골격</span>
      </div>
    </main>
  );
}
