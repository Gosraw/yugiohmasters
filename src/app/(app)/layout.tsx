import { BottomNav } from "@/components/bottom-nav";
import { ActionFeedbackBanner } from "@/components/action-feedback-banner";
import { requireUser } from "@/lib/supabase/queries";
import { getLeagueIdForUser } from "@/lib/league-stats";
import { getAttentionItems } from "@/lib/attention-items";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireUser() redirects unauthenticated visitors on its own (via
  // next/navigation redirect(), which must NOT be swallowed by a
  // try/catch) - so it stays outside the error-tolerant block below.
  const { supabase, userId } = await requireUser();

  let attentionCount = 0;

  try {
    const leagueId = await getLeagueIdForUser(supabase, userId);
    const items = await getAttentionItems(supabase, userId, leagueId);
    attentionCount = items.length;
  } catch {
    // If this fails for any reason, just render the nav without a badge
    // rather than breaking navigation for the whole app.
  }

  return (
    <>
      <ActionFeedbackBanner />
      <div className="pb-24">{children}</div>
      <BottomNav attentionCount={attentionCount} />
    </>
  );
}
