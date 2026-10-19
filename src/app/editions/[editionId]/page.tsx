import { redirect } from "next/navigation";
// New reservations always start with normalized category selection.
export default function EditionPage() { redirect("/areas"); }
