import Link from "next/link";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <p className={styles.brand}>Delivery Shield</p>
      <h1 className={styles.title}>로그인</h1>
      <p className={styles.lead}>
        인증은 Phase 1에서 Supabase Auth로 연결합니다. 지금은 화면 골격만 제공합니다.
      </p>
      <div className={styles.form}>
        <label className={styles.label}>
          이메일
          <input
            className={styles.input}
            type="email"
            name="email"
            autoComplete="email"
            disabled
            placeholder="you@example.com"
          />
        </label>
        <label className={styles.label}>
          비밀번호
          <input
            className={styles.input}
            type="password"
            name="password"
            autoComplete="current-password"
            disabled
            placeholder="••••••••"
          />
        </label>
        <button className={styles.button} type="button" disabled>
          준비 중
        </button>
      </div>
      <Link className={styles.back} href="/">
        ← 랜딩으로
      </Link>
    </main>
  );
}
