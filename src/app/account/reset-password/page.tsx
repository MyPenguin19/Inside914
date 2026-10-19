import { AccountForm } from "../form";
export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Choose a new password</h1>
      <AccountForm mode="reset" />
    </>
  );
}
