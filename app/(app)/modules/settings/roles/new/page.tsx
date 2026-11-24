import { redirect } from "next/navigation";

/** Old address for the role editor: new role. */
export default function NewRoleMovedPage() {
  redirect("/modules/users/roles/new");
}
