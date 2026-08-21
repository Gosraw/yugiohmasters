import { BottomNav } from "@/components/bottom-nav";
import { ActionFeedbackBanner } from "@/components/action-feedback-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ActionFeedbackBanner />
      <div className="pb-24">{children}</div>
      <BottomNav />
    </>
  );
}
