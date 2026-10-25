import { AreaLandingPage } from "@/components/marketing/area-landing-page";
import { REGION_CONTENT } from "@/lib/seo-regions";
import { marketingMetadata } from "@/lib/seo";

const region = { slug: "eastern-westchester", name: "Eastern Westchester" } as const;
const copy = REGION_CONTENT[region.slug];
export const metadata = marketingMetadata(`/areas/${region.slug}`, copy.title, copy.description);
export default function Page() { return <AreaLandingPage region={region} />; }
