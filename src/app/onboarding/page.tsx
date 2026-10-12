import {
  redirect,
} from "next/navigation";

// The old cosmetic Boss Monster onboarding is retired: new players go
// through Boss Route select + the Initial Draft (the proxy's
// onboarding gate sends them to the right step from "/"), and the
// Boss Monster flavour pick lives on /profile.
export default function OnboardingPage() {
  redirect("/");
}
