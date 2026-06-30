"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStoreParentAction, type StoreOrganizationRow } from "@/server/actions/store-organization";

interface Props {
  stores: StoreOrganizationRow[];
}

interface TreeNode {
  store: StoreOrganizationRow;
  children: TreeNode[];
}

export function StoreOrganizationManager({ stores }: Props) {
  const router = useRouter();
  const [selectedStoreId, setSelectedStoreId] = useState(stores[0]?.id ?? "");
  const [parentStoreId, setParentStoreId] = useState<string>(
    stores[0]?.parentStoreId ?? "__none__",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const selectedStore = storeById.get(selectedStoreId) ?? null;
  const currentParent = selectedStore?.parentStoreId
    ? storeById.get(selectedStore.parentStoreId) ?? null
    : null;
  const nextParent = parentStoreId === "__none__" ? null : storeById.get(parentStoreId) ?? null;

  const tree = useMemo(() => buildTree(stores), [stores]);
  const descendantIds = useMemo(
    () => collectDescendantIds(stores, selectedStoreId),
    [stores, selectedStoreId],
  );
  const options = stores.filter(
    (store) => store.id !== selectedStoreId && !descendantIds.has(store.id),
  );

  function onStoreChange(nextStoreId: string) {
    const nextStore = storeById.get(nextStoreId);
    setSelectedStoreId(nextStoreId);
    setParentStoreId(nextStore?.parentStoreId ?? "__none__");
    setMessage(null);
  }

  function submit() {
    if (!selectedStore) return;
    const oldLabel = currentParent?.name ?? "無上層店舖";
    const nextLabel = nextParent?.name ?? "無上層店舖";
    const ok = window.confirm(
      `確認調整「${selectedStore.name}」的上層店舖？\n\n調整前：${oldLabel}\n調整後：${nextLabel}\n\n此操作只影響查看關係。`,
    );
    if (!ok) return;

    setMessage(null);
    startTransition(async () => {
      const result = await updateStoreParentAction({
        storeId: selectedStore.id,
        parentStoreId,
      });
      if (result.success) {
        setMessage("店舖組織已更新");
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  }

  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-earth-200 bg-white px-4 py-12 text-center text-sm text-earth-400">
        尚無店舖
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-lg border border-earth-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-earth-800">組織樹狀結構</h2>
          <span className="text-xs text-earth-400">{stores.length} 間店</span>
        </div>
        <div className="space-y-2">
          {tree.map((node) => (
            <TreeBranch key={node.store.id} node={node} level={0} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-earth-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-earth-800">調整上層店舖</h2>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-earth-500">要調整的店舖</span>
            <select
              value={selectedStoreId}
              onChange={(e) => onStoreChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-800"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-earth-500">新的上層店舖</span>
            <select
              value={parentStoreId}
              onChange={(e) => setParentStoreId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-800"
            >
              <option value="__none__">無上層店舖</option>
              {options.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.slug})
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-earth-100 bg-earth-50 px-3 py-3 text-sm">
            <div className="font-medium text-earth-700">調整 preview</div>
            <div className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 text-xs">
              <span className="text-earth-400">店舖</span>
              <span className="text-earth-800">{selectedStore?.name ?? "-"}</span>
              <span className="text-earth-400">調整前</span>
              <span className="text-earth-800">{currentParent?.name ?? "無上層店舖"}</span>
              <span className="text-earth-400">調整後</span>
              <span className="text-earth-800">{nextParent?.name ?? "無上層店舖"}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={isPending || !selectedStore}
            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "更新中..." : "確認調整"}
          </button>

          {message ? (
            <p className="rounded-lg border border-earth-100 bg-white px-3 py-2 text-sm text-earth-700">
              {message}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function TreeBranch({ node, level }: { node: TreeNode; level: number }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md border border-earth-100 bg-earth-50 px-3 py-2 text-sm"
        style={{ marginLeft: `${level * 20}px` }}
      >
        <span className="font-medium text-earth-900">{node.store.name}</span>
        <span className="font-mono text-xs text-earth-400">{node.store.slug}</span>
        {node.store.isDemo ? <span className="text-xs text-amber-600">Demo</span> : null}
      </div>
      {node.children.length > 0 ? (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TreeBranch key={child.store.id} node={child} level={level + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildTree(stores: StoreOrganizationRow[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const store of stores) {
    nodes.set(store.id, { store, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const store of stores) {
    const node = nodes.get(store.id)!;
    const parent = store.parentStoreId ? nodes.get(store.parentStoreId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function collectDescendantIds(stores: StoreOrganizationRow[], storeId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const store of stores) {
    if (!store.parentStoreId) continue;
    const children = childrenByParent.get(store.parentStoreId) ?? [];
    children.push(store.id);
    childrenByParent.set(store.parentStoreId, children);
  }

  const descendants = new Set<string>();
  const stack = [...(childrenByParent.get(storeId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (descendants.has(id)) continue;
    descendants.add(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return descendants;
}
