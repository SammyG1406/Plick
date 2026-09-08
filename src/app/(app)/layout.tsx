import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
