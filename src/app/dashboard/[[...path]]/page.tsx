import { redirect } from "next/navigation";

// Customer accounts were retired; keep old bookmarks working.
export default function RetiredCustomerPage() {
  redirect("/areas");
}
