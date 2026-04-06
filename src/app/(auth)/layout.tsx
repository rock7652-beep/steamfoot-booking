import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import BuildFooter from "@/components/build-footer";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.role === "CUSTOMER" ? "/book" : "/dashboard");
  }
  return (
    <div className="flex min-h-screen flex-col bg-earth-50">
      <div className="flex flex-1 items-center justify-center">
        {children}
      </div>
      <BuildFooter />
    </div>
  );
}
