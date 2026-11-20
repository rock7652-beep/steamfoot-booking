import { renderLiffResume, type ResumeQuery } from "./render-resume";

export default async function LiffResumePage({ searchParams }: { searchParams: Promise<ResumeQuery> }) {
  return renderLiffResume(await searchParams, false);
}
