import type { REGIONS } from "./catalog/regions";

// Editorial planning guidance, not a definition of postal routes or confirmed delivery coverage.
export const REGION_CONTENT: Record<(typeof REGIONS)[number]["slug"], {
  title: string; description: string; intro: string; heading: string; audience: string; tips: readonly string[];
}> = {
  "central-westchester": {
    title: "Central Westchester Direct Mail Advertising",
    description: "Plan shared postcard advertising in Central Westchester. Explore the mid-county area guide, business use cases and how Inside914 campaign reservations work.",
    intro: "Central Westchester brings together the mid-county communities in Inside914’s planning map. Use this guide to compare the places your business serves with the area proposed for a shared postcard.",
    heading: "Plan around your service area",
    audience: "A White Plains shop may want to introduce a local offer, while a home-service business based in Greenburgh may serve several neighboring towns. Start with the places customers can realistically travel from—or the places your team can travel to—before choosing an area.",
    tips: ["List the towns you already serve and compare them with the proposed Central grouping.", "Use one clear offer or service on the postcard, with an easy way to contact you.", "If your service area extends north or south, compare those areas separately rather than assuming one mailing covers them."],
  },
  "southern-westchester": {
    title: "Southern Westchester Postcard Advertising",
    description: "Explore postcard advertising in Southern Westchester, from Yonkers to Pelham. Compare the proposed area and plan a clear local offer with Inside914.",
    intro: "Southern Westchester is Inside914’s proposed grouping closest to New York City. It includes city and town communities; a single area label does not mean every neighborhood or household receives a postcard.",
    heading: "Make the next visit easy to understand",
    audience: "Restaurants, retailers and appointment-based businesses can use a shared postcard to explain why someone might visit. A Yonkers location and a Pelham location may draw from different nearby communities, so check the eventual mailing routes against your own customer catchment.",
    tips: ["Include your actual business location or service area so readers can judge whether you are nearby.", "Keep an offer’s conditions and expiry clear, and align any expiry with the confirmed mailing schedule.", "Choose an easy next step, such as calling for an appointment or visiting a short web address."],
  },
  "northern-westchester": {
    title: "Northern Westchester Postcard Advertising",
    description: "Explore Northern Westchester shared postcards, including the Cortlandt and Yorktown area guide. Plan service coverage, artwork and campaign participation.",
    intro: "Northern Westchester groups communities toward Putnam County, including the Hudson-side communities of Cortlandt and Peekskill and towns farther inland. Review the area as a planning guide before considering a campaign.",
    heading: "Match the message to the jobs you can serve",
    audience: "Home services, garden care and local professional practices may serve customers across multiple northern towns. A useful ad makes that service area clear. For appointment or on-site work, consider travel time and capacity before promoting an offer across the region.",
    tips: ["Check whether your team can service the proposed communities at the time of the mailing.", "For seasonal work, wait for confirmed campaign dates before promising an appointment window.", "Use a campaign-specific contact code or landing page to ask new inquiries how they found you; mailing alone does not establish a sales result."],
  },
  "eastern-westchester": {
    title: "Eastern Westchester Direct Mail Advertising",
    description: "Plan Eastern Westchester postcard advertising with Inside914. Review the proposed Rye, Mamaroneck and Harrison grouping and how shared campaigns work.",
    intro: "Eastern Westchester is Inside914’s proposed grouping toward Connecticut and Long Island Sound. The guide also includes inland towns. Rye town and Rye city are separate municipalities, and the area label is not a postal boundary.",
    heading: "Be precise about where customers can find you",
    audience: "Local shops, food businesses and professional services can introduce a location or a specific service on a shared postcard. Businesses serving Mamaroneck, Harrison or Rye should describe their own location accurately and compare it with the final campaign routes before committing to delivery assumptions.",
    tips: ["Use the correct town, city or village in your own business address; do not treat Rye town and Rye city as interchangeable.", "Check inland service coverage as well as communities near the Sound.", "If you also serve central or southern communities, review those separate campaign areas and their individual prices."],
  },
};
