import {
  redirect,
} from "next/navigation";

// 2.0: the one-evening "tonight" flow became the season "This Round"
// screen (rounds are played on different days). Old links and
// bookmarks land there.
export default async function CompetitionTonightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const {
    id,
  } = await params;

  redirect(
    `/competitions/${id}/round`
  );
}
