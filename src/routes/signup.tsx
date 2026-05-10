import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  // Signup is now disabled. Telecallers are created by the admin in the User Management page.
  return <Navigate to="/login" replace />;
}
