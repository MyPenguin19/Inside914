import { AccountForm } from "../form";
export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold">Verify your email</h1>
      <p className="mb-6">
        Verify ownership of your email before we link your reservations. Open
        the verification email in this browser.
      </p>
      <AccountForm mode="verify" />
    </>
  );
}
