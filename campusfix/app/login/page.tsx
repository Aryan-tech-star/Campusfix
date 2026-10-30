import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";
import "./login.css";

export const metadata: Metadata = {
  title: "Welcome · CampusFix",
  description:
    "Sign in to CampusFix to report an issue, coordinate repairs, or manage your maintenance work.",
};

export default function LoginPage() {
  return <AuthPage />;
}
