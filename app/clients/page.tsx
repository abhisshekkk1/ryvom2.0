import { redirect } from "next/navigation";

// /clients redirects to the main dashboard which shows the client list
export default function ClientsPage() {
  redirect("/");
}
