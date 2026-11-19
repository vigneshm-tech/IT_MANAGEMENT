import type { RoleId } from "./roles";

/**
 * Seed accounts used when Supabase is not configured (local preview / CI).
 * They are never active when NEXT_PUBLIC_SUPABASE_URL is set, so this list is
 * not a production credential store.
 */
export type DemoUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: RoleId;
  title: string;
  location: string;
};

export const DEMO_PASSWORD = "Tornado@123";

export const DEMO_USERS: DemoUser[] = [
  // Hidden platform account — deliberately absent from every role picker.
  { id: "u-super-admin", email: "super.admin@tasktornado.dev", password: DEMO_PASSWORD, name: "Vignesh", role: "super_admin", title: "Super Admin", location: "Chennai" },
  { id: "u-it-manager", email: "it.manager@tasktornado.dev", password: DEMO_PASSWORD, name: "Meera Raghavan", role: "it_manager", title: "IT Manager", location: "Chennai" },
  { id: "u-it-engineer", email: "it.engineer@tasktornado.dev", password: DEMO_PASSWORD, name: "Arun Prakash", role: "it_engineer", title: "IT Engineer", location: "Chennai" },
  { id: "u-l2-manager", email: "l2.manager@tasktornado.dev", password: DEMO_PASSWORD, name: "Divya Suresh", role: "l2_support_manager", title: "L2 Support Manager", location: "Bengaluru" },
  { id: "u-l2-lead", email: "l2.lead@tasktornado.dev", password: DEMO_PASSWORD, name: "Karthik Raman", role: "l2_support_lead", title: "L2 Support Lead", location: "Chennai" },
  { id: "u-l2-engineer", email: "l2.engineer@tasktornado.dev", password: DEMO_PASSWORD, name: "Nisha Verma", role: "l2_support_engineer", title: "L2 Support Engineer", location: "Hyderabad" },
  { id: "u-impl-manager", email: "implementation.manager@tasktornado.dev", password: DEMO_PASSWORD, name: "Suresh Iyer", role: "implementation_manager", title: "Implementation Manager", location: "Chennai" },
  { id: "u-impl-lead", email: "implementation.lead@tasktornado.dev", password: DEMO_PASSWORD, name: "Priya Nair", role: "implementation_lead", title: "Implementation Lead", location: "Kochi" },
  { id: "u-impl-engineer", email: "implementation.engineer@tasktornado.dev", password: DEMO_PASSWORD, name: "Vikram Shetty", role: "implementation_engineer", title: "Implementation Engineer", location: "Chennai" },
  { id: "u-dev-manager", email: "development.manager@tasktornado.dev", password: DEMO_PASSWORD, name: "Anand Krishnan", role: "development_manager", title: "Development Manager", location: "Bengaluru" },
  { id: "u-dev-lead", email: "development.lead@tasktornado.dev", password: DEMO_PASSWORD, name: "Sneha Pillai", role: "development_lead", title: "Development Lead", location: "Chennai" },
  { id: "u-dev-engineer", email: "development.engineer@tasktornado.dev", password: DEMO_PASSWORD, name: "Rahul Menon", role: "development_engineer", title: "Development Engineer", location: "Chennai" },
  { id: "u-qa-manager", email: "testing.manager@tasktornado.dev", password: DEMO_PASSWORD, name: "Lakshmi Narayan", role: "testing_manager", title: "Testing Manager", location: "Chennai" },
  { id: "u-qa-lead", email: "testing.lead@tasktornado.dev", password: DEMO_PASSWORD, name: "Farhan Ali", role: "testing_lead", title: "Testing Lead", location: "Hyderabad" },
  { id: "u-qa-engineer", email: "testing.engineer@tasktornado.dev", password: DEMO_PASSWORD, name: "Ananya Bose", role: "testing_engineer", title: "Testing Engineer", location: "Kolkata" },
  { id: "u-management", email: "management@tasktornado.dev", password: DEMO_PASSWORD, name: "Ramesh Subramanian", role: "management", title: "Management", location: "Chennai" },
];

export type DemoAccount = Pick<DemoUser, "email" | "password" | "name" | "role">;

export function findDemoUser(email: string): DemoUser | undefined {
  const normalised = email.trim().toLowerCase();
  return DEMO_USERS.find((u) => u.email === normalised);
}
