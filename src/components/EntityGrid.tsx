"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  FIELD_LIMITS,
  VERBS,
  validateEntityInput,
  type Entity,
  type EntityField,
  type EntityInput,
  type ValidationErrors,
} from "@/lib/entity";

const COLUMNS: { key: EntityField; label: string; width: string }[] = [
  { key: "name", label: "URL/Mutation", width: "15%" },
  { key: "description", label: "Description", width: "40%" },
  { key: "tablesAffected", label: "Tables Affected", width: "18%" },
  { key: "verb", label: "Verb", width: "8%" },
  { key: "resource", label: "Resource", width: "11%" },
];

const EMPTY_INPUT: EntityInput = {
  name: "",
  description: "",
  tablesAffected: "",
  verb: "",
  resource: "",
};

const NEW_ROW = "new";

// In production this is served from the same IIS site as the API (see
// api/Program.cs), so relative "/api/..." URLs just work - leave
// NEXT_PUBLIC_API_BASE_URL unset. For local dev, where `next dev` (port 3000)
// and `dotnet run` (port 5068) are separate origins, set it in .env.local to
// e.g. http://localhost:5068 - the API's dev CORS policy allows that origin.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type Editing = {
  id: string; // entity id, or NEW_ROW
  draft: EntityInput;
  errors: ValidationErrors & { form?: string };
  saving: boolean;
};

type Sort = { key: EntityField; dir: "asc" | "desc" };

export default function EntityGrid() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Server-side search, debounced so we don't query on every keystroke.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/entities?search=${encodeURIComponent(search)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to load entities (${res.status}).`);
        setEntities(await res.json());
        setLoadError(null);
      } catch (err) {
        if (!controller.signal.aborted) setLoadError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...entities].sort(
      (a, b) => factor * a[sort.key].localeCompare(b[sort.key], undefined, { sensitivity: "base" })
    );
  }, [entities, sort]);

  function toggleSort(key: EntityField) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function startAdd() {
    setPendingDelete(null);
    setEditing({ id: NEW_ROW, draft: { ...EMPTY_INPUT }, errors: {}, saving: false });
  }

  function startEdit(entity: Entity) {
    setPendingDelete(null);
    const { id, createdAt: _c, updatedAt: _u, ...draft } = entity;
    setEditing({ id, draft, errors: {}, saving: false });
  }

  function updateDraft(field: EntityField, value: string) {
    setEditing((e) => e && { ...e, draft: { ...e.draft, [field]: value }, errors: { ...e.errors, [field]: undefined } });
  }

  async function save() {
    if (!editing || editing.saving) return;
    const isNew = editing.id === NEW_ROW;

    // Same rules the API enforces; checked here too so errors show without a round trip.
    const check = validateEntityInput(editing.draft);
    if (!check.ok) {
      setEditing({ ...editing, errors: check.errors });
      return;
    }
    setEditing({ ...editing, saving: true });

    try {
      const res = await fetch(isNew ? `${API_BASE}/api/entities` : `${API_BASE}/api/entities/${editing.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing.draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditing((e) => e && { ...e, saving: false, errors: data.errors ?? { form: data.error ?? "Save failed." } });
        return;
      }
      const saved = data as Entity;
      setEntities((prev) => (isNew ? [saved, ...prev] : prev.map((x) => (x.id === saved.id ? saved : x))));
      setEditing(null);
    } catch {
      setEditing((e) => e && { ...e, saving: false, errors: { form: "Network error. Please try again." } });
    }
  }

  async function confirmDelete(id: string) {
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/entities/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
      setEntities((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setDeleteError("Delete failed. Please try again.");
    } finally {
      setPendingDelete(null);
    }
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") setEditing(null);
    if (e.key === "Enter" && e.currentTarget.tagName !== "TEXTAREA") {
      e.preventDefault();
      save();
    }
  }

  function renderEditRow(key: string) {
    if (!editing) return null;
    const { draft, errors, saving } = editing;
    const inputClass = (field: EntityField) =>
      `w-full rounded-sm border px-2 py-1 text-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 ${
        errors[field] ? "border-red-500" : "border-gray-300"
      }`;

    return (
      <tr key={key} className="bg-blue-50/40 align-top">
        {COLUMNS.map(({ key: field }, i) => (
          <td key={field} className="border-b border-gray-200 p-1.5">
            {field === "verb" ? (
              <select
                value={draft.verb}
                onChange={(e) => updateDraft("verb", e.target.value)}
                onKeyDown={onEditKeyDown}
                className={inputClass("verb")}
              >
                <option value="" disabled>
                  Select…
                </option>
                {VERBS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : field === "description" ? (
              <textarea
                value={draft.description}
                maxLength={FIELD_LIMITS.description}
                rows={2}
                onChange={(e) => updateDraft("description", e.target.value)}
                onKeyDown={onEditKeyDown}
                className={`${inputClass("description")} resize-y`}
              />
            ) : field === "tablesAffected" ? (
              <textarea
                value={draft.tablesAffected}
                maxLength={FIELD_LIMITS.tablesAffected}
                rows={2}
                onChange={(e) => updateDraft("tablesAffected", e.target.value)}
                onKeyDown={onEditKeyDown}
                className={`${inputClass("tablesAffected")} resize-y`}
              />
            ) : (
              <input
                value={draft[field]}
                maxLength={FIELD_LIMITS[field]}
                autoFocus={i === 0}
                onChange={(e) => updateDraft(field, e.target.value)}
                onKeyDown={onEditKeyDown}
                className={inputClass(field)}
              />
            )}
            {field === "description" && (
              <div className="mt-0.5 text-right text-xs text-gray-400">
                {draft.description.length}/{FIELD_LIMITS.description}
              </div>
            )}
            {field === "tablesAffected" && (
              <div className="mt-0.5 text-right text-xs text-gray-400">
                {draft.tablesAffected.length}/{FIELD_LIMITS.tablesAffected}
              </div>
            )}
            {errors[field] && <div className="mt-0.5 text-xs text-red-600">{errors[field]}</div>}
          </td>
        ))}
        <td className="border-b border-gray-200 p-1.5 pt-2.5 whitespace-nowrap">
          <button onClick={save} disabled={saving} className="text-blue-700 underline hover:text-blue-900 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>{" "}
          <button onClick={() => setEditing(null)} disabled={saving} className="text-blue-700 underline hover:text-blue-900">
            Cancel
          </button>
          {errors.form && <div className="mt-1 text-xs whitespace-normal text-red-600">{errors.form}</div>}
        </td>
      </tr>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={startAdd}
          disabled={editing?.id === NEW_ROW}
          title="Add row"
          aria-label="Add row"
          className="flex h-9 w-9 items-center justify-center rounded border border-gray-300 text-2xl leading-none hover:bg-gray-50 disabled:opacity-40"
        >
          +
        </button>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search</span>
          <svg
            className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-500"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-9 w-full rounded border border-gray-300 pr-2 pl-8 text-sm outline-none focus:border-blue-600"
          />
        </label>
      </div>

      {(loadError || deleteError) && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError ?? deleteError}
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr className="text-left text-gray-500">
              {COLUMNS.map((c) => (
                <th key={c.key} className="border-r border-b border-gray-200 px-2 py-2 font-normal">
                  <button onClick={() => toggleSort(c.key)} className="flex w-full items-center justify-between gap-1 hover:text-gray-800">
                    <span className="truncate">{c.label}</span>
                    <span className="text-xs" aria-hidden>
                      {sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </button>
                </th>
              ))}
              <th className="border-b border-gray-200 px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {editing?.id === NEW_ROW && renderEditRow(NEW_ROW)}

            {sorted.map((entity) =>
              editing?.id === entity.id ? (
                renderEditRow(entity.id)
              ) : (
                  <tr key={entity.id} className="hover:bg-gray-50">
                    <td className="truncate border-b border-gray-200 px-2 py-2" title={entity.name}>
                      {entity.name}
                    </td>
                    <td className="truncate border-b border-gray-200 px-2 py-2" title={entity.description}>
                      {entity.description}
                    </td>
                    <td className="truncate border-b border-gray-200 px-2 py-2" title={entity.tablesAffected}>
                      {entity.tablesAffected}
                    </td>
                    <td className="truncate border-b border-gray-200 px-2 py-2">{entity.verb}</td>
                    <td className="truncate border-b border-gray-200 px-2 py-2" title={entity.resource}>
                      {entity.resource}
                    </td>
                    <td className="border-b border-gray-200 px-2 py-2 whitespace-nowrap">
                      {pendingDelete === entity.id ? (
                        <>
                          <button onClick={() => confirmDelete(entity.id)} className="text-red-700 underline hover:text-red-900">
                            Confirm
                          </button>{" "}
                          <button onClick={() => setPendingDelete(null)} className="text-blue-700 underline hover:text-blue-900">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(entity)} className="text-blue-700 underline hover:text-blue-900">
                            Edit
                          </button>{" "}
                          <button onClick={() => setPendingDelete(entity.id)} className="text-blue-700 underline hover:text-blue-900">
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
              )
            )}

            {!loading && sorted.length === 0 && editing?.id !== NEW_ROW && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-2 py-8 text-center text-gray-500">
                  {search ? "No entities match your search." : "No entities yet. Click + to add one."}
                </td>
              </tr>
            )}
            {loading && sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-2 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
