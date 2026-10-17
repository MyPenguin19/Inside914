import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

// Shown on later preview steps when nothing has been chosen yet in this tab.
export function NeedSelection({ what = "a space on the postcard" }: { what?: string }) {
  return (
    <Card className="mx-auto mt-8 max-w-xl text-center">
      <h1 className="font-display text-2xl font-medium">Start by choosing {what}.</h1>
      <p className="mt-2 text-muted">This step uses what you picked earlier in the preview.</p>
      <ButtonLink href="/demo/postcard" className="mt-6">
        Choose a space
      </ButtonLink>
    </Card>
  );
}
