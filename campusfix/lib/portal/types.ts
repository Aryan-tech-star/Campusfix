import type {
  Analysis,
  Category,
  Complaint,
  Property,
  Technician,
} from "../manager/domain";

export type Role = "STUDENT" | "MANAGER" | "TECHNICIAN";
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  propertyId?: string;
  room?: string;
  technicianId?: string;
};
export type Notification = {
  id: string;
  title: string;
  message: string;
  complaintId?: string;
  createdAt: string;
  readAt?: string;
};
export type Assignment = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "COMPLETED" | "CANCELLED";
  assignedAt: string;
  acceptedAt?: string;
  instructions: string;
  declineReason?: string;
};
export type PortalComplaint = Complaint & {
  assignment?: Assignment;
  technician?: Pick<Technician, "id" | "name" | "specialization" | "phone">;
};
export type PortalMeta = {
  demo: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
  aiModel: string;
};
export type StudentSnapshot = {
  user: SessionUser;
  property: Property;
  complaints: PortalComplaint[];
  notifications: Notification[];
  meta: PortalMeta;
};
export type TechnicianProfile = Technician & {
  serviceArea: string;
  bio: string;
};
export type TechnicianSnapshot = {
  user: SessionUser;
  technician: TechnicianProfile;
  properties: Property[];
  complaints: PortalComplaint[];
  notifications: Notification[];
  meta: PortalMeta;
};
export type TechnicianAdvice = {
  summary: string;
  potentialCauses: string[];
  considerations: string[];
  reportSummary: string;
  disclaimer: string;
  model: string;
  generatedAt: string;
};
export type ComplaintSubmission = {
  title: string;
  description: string;
  category: Category;
  propertyId: string;
  room: string;
  urgency: Complaint["urgency"];
  images: string[];
};
export type ComplaintResult = {
  complaint: PortalComplaint;
  analysis?: Analysis;
  aiError?: string;
};
