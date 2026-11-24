import { redirect } from "next/navigation";

/** Old address for the role editor: one role's permissions. */
export default async function RoleMovedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/modules/users/roles/${encodeURIComponent(id)}`);
}
