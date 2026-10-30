import StudentDashboard from "@/components/student/dashboard";
import { requireRole } from "@/lib/portal/server-auth";
import "../manager/manager.css";
import "../portal.css";

export default async function StudentPage() {
  await requireRole("STUDENT");
  return <StudentDashboard />;
}
