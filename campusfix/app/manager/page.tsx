import Dashboard from "@/components/manager/dashboard";
import "./manager.css";
import { requireRole } from "@/lib/portal/server-auth";
export default async function ManagerPage() {
  await requireRole("MANAGER");
  return <Dashboard />;
}
