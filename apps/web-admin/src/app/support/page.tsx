import Link from "next/link";
import styles from "./support.module.css";

export default function AdminUserSupportPage() {
  return (
    <main className={styles.main}>
      <Link className={styles.back} href="/">
        ← Admin 홈
      </Link>
      <header className={styles.header}>
        <h1 className={styles.title}>사용자 지원 / 계정 복구</h1>
        <p className={styles.lead}>
          사용자 검색과 복구 권한 부여 전용 콘솔입니다. 비밀번호는 조회·표시·설정하지
          않습니다.
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="support-search">
        <h2 id="support-search">사용자 검색</h2>
        <form className={styles.formGrid}>
          <label className={styles.label}>
            이름
            <input className={styles.input} name="legalName" placeholder="홍길동" />
          </label>
          <label className={styles.label}>
            생년월일
            <input className={styles.input} name="birthDate" placeholder="YYYY-MM-DD" />
          </label>
          <label className={styles.label}>
            휴대폰 (일부)
            <input className={styles.input} name="phoneFragment" placeholder="뒤 4자리 등" />
          </label>
          <label className={styles.label}>
            이메일 (일부)
            <input className={styles.input} name="emailFragment" placeholder="example@" />
          </label>
        </form>
        <button className={styles.button} type="button" disabled>
          검색 (Phase F 연동 예정)
        </button>
      </section>

      <section className={styles.panel} aria-labelledby="support-results">
        <h2 id="support-results">검색 결과</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>회원 유형</th>
              <th>계정 상태</th>
              <th>이메일</th>
              <th>휴대폰</th>
              <th>본인인증</th>
              <th>복구 수단</th>
              <th>지원</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className={styles.empty}>
                API `/v1/admin/support/users/search` 연동 후 표시됩니다.
              </td>
            </tr>
          </tbody>
        </table>
        <p className={styles.note}>
          지원 액션: 본인확인 후 <strong>복구 권한 부여</strong>만 가능합니다. 사용자가
          앱/웹에서 직접 새 비밀번호를 설정합니다.
        </p>
      </section>
    </main>
  );
}
