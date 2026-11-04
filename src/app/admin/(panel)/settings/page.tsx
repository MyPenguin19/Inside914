import { HouseArtworkForm } from "@/components/admin/house-artwork-form";
import { Suspense } from "react";
import { PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card, StatusBadge, type Tone } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { getEmailEnv, getStripeKeyMode } from "@/lib/env/checkout";
import { formatPrice } from "@/lib/format";
import { getPricingMode, TEST_PRICES } from "@/lib/pricing";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { verifyOwnerEmail } from "@/app/admin/email-actions";
import { getOwnerVerificationConfig } from "@/lib/email/owner-verification";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Manage the permanent house advertisement and review configuration." />
      <Suspense fallback={<PanelSkeleton />}>
        <Settings />
      </Suspense>
    </div>
  );
}

type Row = { label: string; value: string; tone: Tone; status: string };

function attempt<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

async function Settings() {
  const { supabase } = await requireAdmin();
  const [{ data: house, error: houseError }, { error: dbError }] = await Promise.all([
    supabase.from("house_artwork").select("updated_at").eq("singleton", true).maybeSingle(),
    supabase.from("editions").select("id", { head: true }).limit(1),
  ]);
  const pricing = attempt(() => getPricingMode());
  const stripeMode = attempt(() => getStripeKeyMode());
  const email = getEmailEnv();
  const verification = attempt(getOwnerVerificationConfig);
  const env = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production build" : "development");

  const rows: Row[] = [
    { label: "Business", value: `Inside914 · support address ${email.supportEmail}`, tone: "neutral", status: "Set" },
    {
      label: "Pricing",
      value:
        pricing === "test"
          ? `Temporary prices: ${formatPrice(TEST_PRICES.unitPriceCents)} standard, ${formatPrice(TEST_PRICES.doublePriceCents)} double`
          : pricing === "launch"
            ? "Launch: each edition's own prices"
            : "INSIDE914_PRICING_MODE is missing or invalid",
      tone: pricing === "launch" ? "success" : pricing === "test" ? "warning" : "danger",
      status: pricing ?? "Not set",
    },
    { label: "Supabase", value: dbError ? "Connection or permission problem" : "Connected", tone: dbError ? "danger" : "success", status: dbError ? "Error" : "OK" },
    {
      label: "Stripe",
      value: stripeMode ? `${stripeMode === "live" ? "Live" : "Test"} keys configured · webhook secret ${process.env.STRIPE_WEBHOOK_SECRET ? "set" : "missing"}` : "Keys missing, invalid or mismatched",
      tone: stripeMode ? (process.env.STRIPE_WEBHOOK_SECRET ? "success" : "warning") : "danger",
      status: stripeMode ?? "Not set",
    },
    {
      label: "Email",
      value: email.resendApiKey ? `Resend key set · sending from ${email.from}` : "Not configured: confirmation emails stay queued",
      tone: email.resendApiKey ? "success" : "neutral",
      status: email.resendApiKey ? "Configured" : "Off",
    },
    { label: "Environment", value: env, tone: env === "production" ? "info" : "neutral", status: env },
  ];

  return (
    <>
    {houseError ? <p role="alert">Could not load house artwork settings.</p> : <HouseArtworkForm updatedAt={house?.updated_at ?? null} />}
    <details><summary className="cursor-pointer">Advanced configuration</summary><Card className="mt-4 p-0">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <span>
              <span className="block font-medium">{r.label}</span>
              <span className="block text-sm text-muted">{r.value}</span>
            </span>
            <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
          </li>
        ))}
      </ul>
    </Card>
    {verification && <div className="mt-4">
      <ConfirmAction label="Verify owner email" action={verifyOwnerEmail} fields={{ confirmed: "send" }}
        consequence={`Send one verification email to ${verification.to} using this deployed app. Limited to one message per release; customer emails and payments are not processed.`}
        confirmLabel="Send verification email" />
    </div>}
    </details></>
  );
}
