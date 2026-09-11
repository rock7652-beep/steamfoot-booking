import Link from "next/link";

export function ModulePreviewSwitcher({
  active,
}: {
  active: "customer" | "manager";
}) {
  const items = [
    {
      key: "customer" as const,
      label: "顧客端",
      href: "/s/demo/liff/design-preview",
    },
    {
      key: "manager" as const,
      label: "店長端",
      href: "/s/demo/liff/manager-preview",
    },
  ];

  return (
    <nav
      aria-label="SPA 模組預覽角色"
      className="grid grid-cols-2 rounded-2xl bg-earth-100 p-1"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
            active === item.key
              ? "bg-white text-earth-900 shadow-sm"
              : "text-earth-600 hover:text-earth-900"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
