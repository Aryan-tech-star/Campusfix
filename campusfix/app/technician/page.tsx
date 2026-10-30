import TechnicianDashboard from "@/components/technician/dashboard";
import { requireRole } from "@/lib/portal/server-auth";
import "../manager/manager.css";
import "../portal.css";
import "@/components/technician/technician.css";

export default async function TechnicianPage() {
  await requireRole("TECHNICIAN");
  return <TechnicianDashboard />;
}
