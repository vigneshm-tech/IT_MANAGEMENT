import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Roles & access" };

/**
 * Roles used to live under Settings. The pages moved to Users & Groups, where
 * the people they belong to are; this keeps an old bookmark working.
 */
export default function RolesMovedPage() {
  redirect("/modules/users/roles");
}
