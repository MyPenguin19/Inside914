import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui/primitives";

const SCREENS = [
  { href: "/", title: "Homepage", body: "Hero, Verified Mail, how it works, pricing, FAQ." },
  { href: "/demo/areas", title: "1. Advertising areas", body: "Choose the mailing edition." },
  { href: "/demo/postcard", title: "2. Choose your space", body: "Front/back postcard, standard or double." },
  { href: "/demo/artwork", title: "3. Upload and adjust", body: "Crop, zoom, move, live postcard preview." },
  { href: "/demo/checkout", title: "4. Your details", body: "Short business and contact form." },
  { href: "/demo/payment", title: "5. Reserve", body: "Future-payment explanation and card prototype." },
  { href: "/demo/confirmed", title: "6. Confirmation", body: "Your advertising space is reserved." },
  { href: "/demo/verified-mail", title: "Verified Mail", body: "Campaign tracking timeline." },
  { href: "/demo/admin", title: "Owner dashboard", body: "Campaign, advertisers, artwork, payments." },
];

export default function DemoHub() {
  return (
    <div>
      <SectionHeading
        eyebrow="Design preview"
        title="Walk through Inside914 as a customer."
        intro="Start with the advertising areas and follow the flow, or jump to any screen. Everything here uses sample data and stays in your browser."
      />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCREENS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Card className="h-full transition-colors hover:border-foreground/40">
                <h2 className="font-medium">{s.title}</h2>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
