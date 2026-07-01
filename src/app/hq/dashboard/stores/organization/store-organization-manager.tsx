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

interface PreviewLine {
  id: string;
  label: string;
  level: number;
  selected: boolean;
  childCount?: number;
}

export function StoreOrganizationManager({ stores }: Props) {
  const router = useRouter();
  const [selectedStoreId, setSelectedStoreId] = useState(stores[0]?.id ?? "");
  const [parentStoreId, setParentStoreId] = useState<string>(
    stores[0]?.parentStoreId ?? "__none__",
  );
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [openMenuStoreId, setOpenMenuStoreId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const selectedStore = storeById.get(selectedStoreId) ?? null;

  const tree = useMemo(() => buildTree(stores), [stores]);
  const childrenByParent = useMemo(() => buildChildrenByParent(stores), [stores]);
  const descendantIds = useMemo(
    () => collectDescendantIds(childrenByParent, selectedStoreId),
    [childrenByParent, selectedStoreId],
  );
  const options = stores.filter(
    (store) => store.id !== selectedStoreId && !descendantIds.has(store.id),
  );
  const currentLocation = getLocationLabel(storeById, selectedStore?.parentStoreId ?? null);
  const nextLocation = getLocationLabel(storeById, parentStoreId === "__none__" ? null : parentStoreId);
  const selectedChildCount = selectedStore
    ? (childrenByParent.get(selectedStore.id)?.length ?? 0)
    : 0;
  const selectedChildren = selectedStore
    ? (childrenByParent.get(selectedStore.id) ?? [])
        .map((id) => storeById.get(id))
        .filter((store): store is StoreOrganizationRow => Boolean(store))
    : [];
  const overview = getBrandOverview(stores);
  const beforePreview = useMemo(
    () => flattenTreeWithHq(buildTree(stores), selectedStoreId),
    [stores, selectedStoreId],
  );
  const afterPreview = useMemo(
    () =>
      flattenTreeWithHq(
        buildPreviewTree(stores, selectedStoreId, parentStoreId),
        selectedStoreId,
      ),
    [stores, selectedStoreId, parentStoreId],
  );

  function onStoreChange(nextStoreId: string) {
    const nextStore = storeById.get(nextStoreId);
    setSelectedStoreId(nextStoreId);
    setParentStoreId(nextStore?.parentStoreId ?? "__none__");
    setMode("view");
    setOpenMenuStoreId(null);
    setMessage(null);
  }

  function onEditStoreChange(nextStoreId: string) {
    const nextStore = storeById.get(nextStoreId);
    setSelectedStoreId(nextStoreId);
    setParentStoreId(nextStore?.parentStoreId ?? "__none__");
    setMessage(null);
  }

  function startReorganize(storeId = selectedStoreId) {
    const store = storeById.get(storeId);
    if (!store) return;
    setSelectedStoreId(store.id);
    setParentStoreId(store.parentStoreId ?? "__none__");
    setMode("edit");
    setOpenMenuStoreId(null);
    setMessage(null);
  }

  function cancelReorganize() {
    setParentStoreId(selectedStore?.parentStoreId ?? "__none__");
    setMode("view");
    setMessage(null);
  }

  function submit() {
    if (!selectedStore) return;
    const ok = window.confirm(
      `確認重新安排「${selectedStore.name}」的店舖組織？\n\n${selectedStore.name}\n將會從\n${currentLocation}\n移至\n${nextLocation}\n\n其它店舖資料不會受到影響。`,
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
        setMode("view");
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
    <div className="space-y-5">
      <section className="rounded-lg border border-earth-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-earth-800">品牌概況</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <OverviewMetric label="目前共有" value={`${stores.length} 家店`} emphasis />
          <OverviewMetric label="正式營運" value={`${overview.active} 家`} />
          <OverviewMetric label="試營運" value={`${overview.trial} 家`} />
          <OverviewMetric label="暫停／停用" value={`${overview.pausedOrInactive} 家`} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-earth-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-earth-800">品牌組織圖</h2>
          <span className="text-xs text-earth-400">點選店舖查看組織位置</span>
        </div>
        <div className="rounded-lg border border-earth-100 bg-earth-50 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-earth-900">
            <span>HQ</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-earth-500">
              下層店：{tree.length}
            </span>
          </div>
          <div className="mt-3 space-y-1">
            {tree.length === 0 ? (
              <p className="rounded-md bg-white px-3 py-2 text-sm text-earth-500">
                目前沒有下層店。未來建立新分店時，可以指定 HQ 或某間店為上層位置。
              </p>
            ) : null}
          {tree.map((node) => (
            <TreeBranch
              key={node.store.id}
              node={node}
              level={0}
              selectedStoreId={selectedStoreId}
              openMenuStoreId={openMenuStoreId}
              onSelect={onStoreChange}
              onToggleMenu={(storeId) =>
                setOpenMenuStoreId((current) => (current === storeId ? null : storeId))
              }
              onView={(storeId) => {
                onStoreChange(storeId);
                setOpenMenuStoreId(null);
              }}
              onReorganize={startReorganize}
            />
          ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-earth-200 bg-white p-4">
        {mode === "view" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">店舖資訊</h2>
              <p className="mt-1 text-xs text-earth-400">
                先理解這間店在品牌組織中的位置。
              </p>
            </div>

            <div className="rounded-lg border border-earth-100 bg-earth-50 px-3 py-3">
              <div className="text-base font-semibold text-earth-900">
                {selectedStore?.name ?? "尚未選擇店舖"}
              </div>
            </div>

            <InfoBlock label="目前位置" value={formatCurrentLocation(currentLocation)} />
            <InfoBlock label="下層店" value={`${selectedChildCount} 家`} />

            <div className="rounded-lg border border-earth-100 bg-white px-3 py-3">
              <div className="text-xs font-semibold text-earth-500">查看關係</div>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="text-xs text-earth-400">上層店：</div>
                  <div className="mt-1 font-medium text-earth-800">
                    {selectedStore?.parentStoreId
                      ? (storeById.get(selectedStore.parentStoreId)?.name ?? "未知店舖")
                      : "HQ"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-earth-400">下層店：</div>
                  <div className="mt-1 text-earth-800">
                    {selectedChildren.length > 0
                      ? selectedChildren.map((store) => store.name).join("、")
                      : "無"}
                  </div>
                </div>
              </div>
            </div>

            {selectedStore && selectedChildCount === 0 ? (
              <p className="rounded-lg border border-earth-100 bg-earth-50 px-3 py-2 text-xs leading-5 text-earth-500">
                目前沒有下層店。未來建立新分店時，可以指定這間店為上層店。
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => startReorganize()}
              disabled={!selectedStore}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              重新安排組織
            </button>

            {message ? (
              <p className="rounded-lg border border-earth-100 bg-white px-3 py-2 text-sm text-earth-700">
                {message}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">重新安排組織</h2>
              <p className="mt-1 text-xs text-earth-400">
                只調整店舖之間的查看關係，其它店舖資料不會受到影響。
              </p>
            </div>

          <label className="block">
            <span className="text-xs font-medium text-earth-500">店舖</span>
            <select
              value={selectedStoreId}
              onChange={(e) => onEditStoreChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-800"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-earth-500">新的位置</span>
            <select
              value={parentStoreId}
              onChange={(e) => setParentStoreId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-800"
            >
              <option value="__none__">HQ</option>
              {options.map((store) => (
                <option key={store.id} value={store.id}>
                  {getLocationLabel(storeById, store.id)}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-earth-100 bg-earth-50 px-3 py-3 text-sm">
            <div className="font-medium text-earth-700">變更說明</div>
            <p className="mt-2 text-sm leading-6 text-earth-800">
              <span className="font-semibold">{selectedStore?.name ?? "-"}</span>
              <br />
              將會從
              <br />
              <span className="font-semibold">{currentLocation}</span>
              <br />
              移至
              <br />
              <span className="font-semibold">{nextLocation}</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-earth-500">
              其它店舖資料不會受到影響。
            </p>
            <div className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 text-xs">
              <span className="text-earth-400">店舖</span>
              <span className="text-earth-800">{selectedStore?.name ?? "-"}</span>
              <span className="text-earth-400">目前位置</span>
              <span className="text-earth-800">{currentLocation}</span>
              <span className="text-earth-400">新的位置</span>
              <span className="text-earth-800">{nextLocation}</span>
              <span className="text-earth-400">下層店</span>
              <span className="text-earth-800">{selectedChildCount}</span>
            </div>
          </div>

          <div className="rounded-lg border border-earth-100 bg-white px-3 py-3">
            <div className="text-xs font-semibold text-earth-600">調整前</div>
            <PreviewTree lines={beforePreview} />
          </div>

          <div className="rounded-lg border border-primary-100 bg-primary-50/40 px-3 py-3">
            <div className="text-xs font-semibold text-primary-700">調整後</div>
            <PreviewTree lines={afterPreview} />
          </div>

          {selectedStore && selectedChildCount === 0 ? (
            <p className="rounded-lg border border-earth-100 bg-white px-3 py-2 text-xs leading-5 text-earth-500">
              目前沒有下層店。未來建立新分店時，可以指定這間店為上層店。
            </p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={isPending || !selectedStore}
            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "更新中..." : "更新店舖組織"}
          </button>

          <button
            type="button"
            onClick={cancelReorganize}
            disabled={isPending}
            className="w-full rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>

          {message ? (
            <p className="rounded-lg border border-earth-100 bg-white px-3 py-2 text-sm text-earth-700">
              {message}
            </p>
          ) : null}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? "rounded-lg bg-earth-900 px-4 py-3 text-white" : "rounded-lg border border-earth-100 bg-earth-50 px-4 py-3"}>
      <div className={emphasis ? "text-xs text-earth-100" : "text-xs text-earth-400"}>{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-earth-100 bg-white px-3 py-3">
      <div className="text-xs font-semibold text-earth-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-earth-800">{value}</div>
    </div>
  );
}

function TreeBranch({
  node,
  level,
  selectedStoreId,
  openMenuStoreId,
  onSelect,
  onToggleMenu,
  onView,
  onReorganize,
}: {
  node: TreeNode;
  level: number;
  selectedStoreId: string;
  openMenuStoreId: string | null;
  onSelect: (storeId: string) => void;
  onToggleMenu: (storeId: string) => void;
  onView: (storeId: string) => void;
  onReorganize: (storeId: string) => void;
}) {
  const childCount = node.children.length;
  const isSelected = node.store.id === selectedStoreId;
  const isMenuOpen = node.store.id === openMenuStoreId;
  return (
    <div>
      <div
        className={`relative flex items-center gap-2 rounded-md px-3 py-2 text-sm shadow-sm ${
          isSelected ? "bg-primary-50 ring-1 ring-primary-200" : "bg-white"
        }`}
        style={{ marginLeft: `${level * 24}px` }}
      >
        <button
          type="button"
          onClick={() => onSelect(node.store.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="shrink-0 font-mono text-earth-300">{level === 0 ? "└──" : "├──"}</span>
          <span className="truncate font-medium text-earth-900">{node.store.name}</span>
        </button>
        <span className="ml-auto rounded-full bg-earth-50 px-2 py-0.5 text-xs font-medium text-earth-500">
          下層店：{childCount}
        </span>
        {node.store.isDemo ? <span className="text-xs text-amber-600">Demo</span> : null}
        <button
          type="button"
          onClick={() => onToggleMenu(node.store.id)}
          className="rounded-md px-2 py-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
          aria-label={`${node.store.name} 更多操作`}
        >
          ⋯
        </button>
        {isMenuOpen ? (
          <div className="absolute right-2 top-9 z-10 w-36 rounded-lg border border-earth-200 bg-white py-1 text-sm shadow-lg">
            <button
              type="button"
              onClick={() => onView(node.store.id)}
              className="block w-full px-3 py-2 text-left text-earth-700 hover:bg-earth-50"
            >
              查看店舖
            </button>
            <button
              type="button"
              onClick={() => onReorganize(node.store.id)}
              className="block w-full px-3 py-2 text-left text-earth-700 hover:bg-earth-50"
            >
              重新安排組織
            </button>
          </div>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TreeBranch
              key={child.store.id}
              node={child}
              level={level + 1}
              selectedStoreId={selectedStoreId}
              openMenuStoreId={openMenuStoreId}
              onSelect={onSelect}
              onToggleMenu={onToggleMenu}
              onView={onView}
              onReorganize={onReorganize}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PreviewTree({ lines }: { lines: PreviewLine[] }) {
  return (
    <div className="mt-2 space-y-1 font-mono text-xs">
      {lines.map((line) => (
        <div
          key={line.id}
          className={line.selected ? "font-semibold text-primary-700" : "text-earth-700"}
          style={{ paddingLeft: `${line.level * 16}px` }}
        >
          <span className="text-earth-300">{line.level === 0 ? "" : line.level === 1 ? "└── " : "├── "}</span>
          <span>{line.label}</span>
          {line.childCount !== undefined ? (
            <span className="ml-2 font-sans text-[11px] text-earth-400">
              下層店：{line.childCount}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function getBrandOverview(stores: StoreOrganizationRow[]) {
  return stores.reduce(
    (overview, store) => {
      if (store.operatingStatus === "ACTIVE") {
        overview.active += 1;
      } else if (store.operatingStatus === "TRIAL") {
        overview.trial += 1;
      } else if (store.operatingStatus === "PAUSED" || store.operatingStatus === "INACTIVE") {
        overview.pausedOrInactive += 1;
      }
      return overview;
    },
    { active: 0, trial: 0, pausedOrInactive: 0 },
  );
}

function formatCurrentLocation(location: string): string {
  if (location === "HQ") return "HQ 直屬";
  const parts = location.split(" / ");
  return `${parts[parts.length - 1]}下面`;
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

function buildPreviewTree(
  stores: StoreOrganizationRow[],
  selectedStoreId: string,
  parentStoreId: string,
): TreeNode[] {
  const normalizedParentId = parentStoreId === "__none__" ? null : parentStoreId;
  return buildTree(
    stores.map((store) =>
      store.id === selectedStoreId
        ? { ...store, parentStoreId: normalizedParentId }
        : store,
    ),
  );
}

function flattenTreeWithHq(tree: TreeNode[], selectedStoreId: string): PreviewLine[] {
  const lines: PreviewLine[] = [
    {
      id: "__hq__",
      label: "HQ",
      level: 0,
      selected: false,
      childCount: tree.length,
    },
  ];

  function visit(node: TreeNode, level: number) {
    lines.push({
      id: node.store.id,
      label: node.store.name,
      level,
      selected: node.store.id === selectedStoreId,
      childCount: node.children.length,
    });
    for (const child of node.children) {
      visit(child, level + 1);
    }
  }

  for (const node of tree) {
    visit(node, 1);
  }
  return lines;
}

function getLocationLabel(
  storeById: Map<string, StoreOrganizationRow>,
  storeId: string | null,
): string {
  if (!storeId) return "HQ";
  const path: string[] = [];
  let current = storeById.get(storeId) ?? null;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentStoreId ? storeById.get(current.parentStoreId) ?? null : null;
  }
  return path.length > 0 ? `HQ / ${path.join(" / ")}` : "HQ";
}

function buildChildrenByParent(stores: StoreOrganizationRow[]) {
  const childrenByParent = new Map<string, string[]>();
  for (const store of stores) {
    if (!store.parentStoreId) continue;
    const children = childrenByParent.get(store.parentStoreId) ?? [];
    children.push(store.id);
    childrenByParent.set(store.parentStoreId, children);
  }
  return childrenByParent;
}

function collectDescendantIds(
  childrenByParent: Map<string, string[]>,
  storeId: string,
): Set<string> {
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
