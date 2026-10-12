import { BottomNav } from "@/components/bottom-nav";
import { ActionFeedbackBanner } from "@/components/action-feedback-banner";
import { RewardPopup } from "@/components/reward-popup";
import { requireUser } from "@/lib/supabase/queries";
import { getLeagueIdForUser } from "@/lib/league-stats";
import { getAttentionItems } from "@/lib/attention-items";
import { TabTransition } from "@/components/tab-transition";
import { OnboardedCookieReset } from "@/components/onboarded-cookie-reset";
import {
  ONBOARDED_COOKIE,
  getCurrentSeasonNumber,
  parseOnboardedCookieValue,
} from "@/lib/onboarded-cookie";
import { cookies } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireUser() redirects unauthenticated visitors on its own (via
  // next/navigation redirect(), which must NOT be swallowed by a
  // try/catch) - so it stays outside the error-tolerant block below.
  const { supabase, userId } = await requireUser();

  let attentionCount = 0;
  let staleOnboardedCookie = false;

  const onboarded = parseOnboardedCookieValue(
    (await cookies()).get(ONBOARDED_COOKIE)?.value,
  );

  try {
    // The season number is only needed to validate the proxy's
    // "onboarded" cookie; it loads in parallel with the league.
    const [leagueId, seasonNumber] = await Promise.all([
      getLeagueIdForUser(supabase, userId),
      onboarded ? getCurrentSeasonNumber(supabase) : Promise.resolve(null),
    ]);

    // Stale cookie (e.g. right after a season reset: no league yet,
    // or a new season): clear it so the proxy re-runs the gate now.
    staleOnboardedCookie = Boolean(
      onboarded &&
        (onboarded.userId !== userId ||
          !leagueId ||
          onboarded.leagueId !== leagueId ||
          onboarded.seasonNumber !== seasonNumber),
    );

    const items = await getAttentionItems(supabase, userId, leagueId);
    attentionCount = items.length;
  } catch {
    // If this fails for any reason, just render the nav without a badge
    // rather than breaking navigation for the whole app.
  }

  return (
    <>
      {staleOnboardedCookie && <OnboardedCookieReset />}
      <ActionFeedbackBanner />
      <RewardPopup userId={userId} />
      <div className="pb-24">
        <TabTransition>{children}</TabTransition>
      </div>
      <BottomNav attentionCount={attentionCount} />
    </>
  );
}
