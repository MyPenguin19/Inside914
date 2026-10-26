import { z } from "zod";

export const ContactMessage = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use 100 characters or fewer."),
  email: z.string().trim().max(254).pipe(z.email("Enter a valid email address.")).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(40, "Use 40 characters or fewer."),
  message: z.string().trim().min(10, "Please add a little more detail (at least 10 characters).").max(5000, "Use 5,000 characters or fewer."),
  website: z.string().max(200), // Hidden honeypot, never included in an email.
  submissionId: z.uuid(),
});

export type ContactMessageState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<"name" | "email" | "phone" | "message", string>>;
};
export const CONTACT_RECEIVED = "Thanks — your message has been received. We’ll get back to you by email.";
export const CONTACT_UNAVAILABLE = "We couldn’t submit your message right now. Please try again, or use the email address or phone number on this page.";
