import type { ReactNode } from "react";
import { CoursePortalBrand } from "@/components/course-portal-navigation";
import { normalizeLineOfficialUrl } from "@/lib/line-official-url";
import styles from "./public-trial.module.css";

export type PublicTrialPlace = { address?: string; mapUrl?: string; contactUrl?: string };
export function safeTrialMap(value?: string) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

export function PublicTrialVisit({ mode, address, mapUrl, contactUrl }: PublicTrialPlace & { mode: "sports" | "beauty" }) {
  const map = safeTrialMap(mapUrl), contact = normalizeLineOfficialUrl(contactUrl);
  return <section className={styles.visit} aria-label="到店資訊">
    <div className={styles.location}><div><span className={styles.eyebrow}>到店資訊</span><p>{address || "服務地點請向門市確認"}</p></div><div className={styles.inlineLinks}>{map && <a href={map} target="_blank" rel="noopener noreferrer">開啟導航 ↗</a>}{contact && <a href={contact} target="_blank" rel="noopener noreferrer">聯繫門市 ↗</a>}</div></div>
    <details className={styles.visitDetails}><summary>到店準備與注意事項</summary><div className={styles.visitGrid}>
      <article><span className={styles.smallNumber}>01</span><h3>確認預約</h3><p>保留成功頁的日期、時間與項目。需要調整時，請依店家規則取消或聯繫門市。</p></article>
      <article><span className={styles.smallNumber}>02</span><h3>{mode === "sports" ? "準備上課" : "安心體驗"}</h3><p>{mode === "sports" ? "穿著適合活動的服裝。課程所需用品與身體狀況注意事項，請事先向門市確認。" : "如有需留意的身體狀況、皮膚不適或用品過敏，請先與店家確認適合的服務。"}</p></article>
    </div></details>
  </section>;
}

/** Shared public-facing shell; prices/content come from this store's catalog. */
export function PublicTrialPage({ mode, storeName, prices, durationLabel, children, ...place }: {
  mode: "sports" | "beauty"; storeName: string; prices: number[]; durationLabel?: string; children: ReactNode;
} & PublicTrialPlace) {
  const min = prices.length ? Math.min(...prices) : null, max = prices.length ? Math.max(...prices) : null;
  const price = min === null ? "選擇項目後顯示" : `NT$ ${min.toLocaleString("zh-TW")}${min !== max ? " 起" : ""}`;
  return <div className={`course-portal ${styles.page}`} data-trial-mode={mode}>
    <div className={styles.surface}>
      <header className={styles.brand}><CoursePortalBrand storeFirst storeName={storeName} /></header>
      <section className={styles.hero} aria-label="體驗介紹">
        <div className={styles.heroArt} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.heroContent}><span className={styles.eyebrow}>{mode === "sports" ? "MOVE AT YOUR OWN PACE" : "A MOMENT FOR YOURSELF"}</span>
          <h1>{mode === "sports" ? <>找到自己的節奏，<br />從一堂體驗開始。</> : <>留一段時間，<br />好好照顧自己。</>}</h1>
          <p>{mode === "sports" ? "選一堂喜歡的課，讓改變從今天開始。" : "選擇喜歡的服務，讓身心慢下來。"}</p>
          <div className={styles.heroBottom}><div className={styles.heroFacts}><div><span>體驗費用</span><strong>{price}</strong></div><div><span>體驗時間</span><strong>{durationLabel || "依所選項目"}</strong></div></div>
          <a href="#public-trial-booking" className={styles.heroCta}>選擇{mode === "sports" ? "體驗課程" : "體驗服務"}<span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>
      <main id="public-trial-booking" className={styles.main}>
        <div className={styles.sectionTitle}><h2>預約你的第一次體驗</h2><span>{mode === "sports" ? "課程與時段" : "服務與時段"}</span></div>
        {children}
      </main>
      <div className={styles.footerContent}><PublicTrialVisit mode={mode} {...place} />
        <section className={styles.faq} aria-label="預約常見問題"><h2>預約前，你可能想知道</h2>
          <details><summary>預約成功後，要做什麼？</summary><p>保留頁面上的預約資訊，依約到店即可。付款方式與服務注意事項請向門市確認。</p></details>
          <details><summary>臨時需要改期或取消？</summary><p>請依預約頁的店家規則操作，或透過本店官方 LINE 聯繫門市。需要確認預約結果時，請勿重複送出新預約。</p></details>
          <details><summary>沒有看到合適的時段？</summary><p>可選擇其他日期或項目，或直接聯繫門市。未開放的時段不代表門市休息，實際安排以門市回覆為準。</p></details>
        </section>
        <footer className={styles.footer}><span>{storeName}</span><span>預約服務由蒸管家提供</span><a href="/privacy">隱私權政策</a></footer>
      </div>
    </div>
  </div>;
}
