import { redirect } from "next/navigation";
// New reservations always start with area selection.
export default function EditionPage() { redirect("/areas"); }
