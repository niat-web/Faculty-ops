import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.js";

// No public landing page — go straight to login (or the app if already signed in).
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/app" : "/login");
}
