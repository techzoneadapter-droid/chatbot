"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Product } from "@/lib/types";

const categories = ["Son noi that", "Son ngoai that", "Son lot", "Son chong tham", "Son trang tri", "Bot ba", "Phu kien", "Khac"];
const scopes: Product["interior_or_exterior"][] = ["interior", "exterior", "both", "specialty"];

interface ProductForm {
  id: string;
  name: string;
  sku: string;
  category: string;
  interior_or_exterior: Product["interior_or_exterior"];
  description: string;
  main_benefits: string;
  suitable_surfaces: string;
  suitable_projects: string;
  coverage: string;
  coverage_value: string;
  coats: string;
  available_sizes: string;
  price: string;
  price_unit: string;
  discount: string;
  warranty: string;
  technical_info: string;
  application_instructions: string;
  drying_time: string;
  color_info: string;
  faq: string;
  active: boolean;
  featured: boolean;
  sort_order: string;
  is_demo: boolean;
}

const empty: ProductForm = {
  id: "",
  name: "",
  sku: "",
  category: categories[0],
  interior_or_exterior: "both",
  description: "",
  main_benefits: "",
  suitable_surfaces: "",
  suitable_projects: "",
  coverage: "",
  coverage_value: "",
  coats: "",
  available_sizes: "",
  price: "",
  price_unit: "",
  discount: "",
  warranty: "",
  technical_info: "",
  application_instructions: "",
  drying_time: "",
  color_info: "",
  faq: "",
  active: true,
  featured: false,
  sort_order: "100",
  is_demo: false
};

function joinList(items: string[] | null | undefined) {
  return (items ?? []).join(", ");
}

function recordToText(record: Record<string, string> | null | undefined) {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function textToRecord(text: string) {
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...value] = line.split(":");
        return [key.trim(), value.join(":").trim()];
      })
      .filter(([key, value]) => key && value)
  );
}

function productToForm(product: Product): ProductForm {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? "",
    category: product.category,
    interior_or_exterior: product.interior_or_exterior,
    description: product.description,
    main_benefits: joinList(product.main_benefits),
    suitable_surfaces: joinList(product.suitable_surfaces),
    suitable_projects: joinList(product.suitable_projects),
    coverage: product.coverage ?? "",
    coverage_value: product.coverage_value?.toString() ?? "",
    coats: product.coats?.toString() ?? "",
    available_sizes: joinList(product.available_sizes),
    price: product.price?.toString() ?? "",
    price_unit: product.price_unit ?? "",
    discount: product.discount ?? "",
    warranty: product.warranty ?? "",
    technical_info: recordToText(product.technical_info),
    application_instructions: product.application_instructions ?? "",
    drying_time: product.drying_time ?? "",
    color_info: product.color_info ?? "",
    faq: recordToText(product.faq),
    active: product.active,
    featured: product.featured,
    sort_order: product.sort_order.toString(),
    is_demo: product.is_demo
  };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function nullable(value: string) {
  return value.trim() || null;
}

export function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(empty);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ includeInactive: "true" });
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    setProducts(data.products ?? []);
  }, [category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = Boolean(form.id);
  const canSave = useMemo(() => Boolean(form.name.trim() && form.category.trim() && form.description.trim()), [form]);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: form.id || undefined,
        name: form.name.trim(),
        sku: nullable(form.sku),
        category: form.category,
        interior_or_exterior: form.interior_or_exterior,
        description: form.description.trim(),
        main_benefits: splitList(form.main_benefits),
        suitable_surfaces: splitList(form.suitable_surfaces),
        suitable_projects: splitList(form.suitable_projects),
        coverage: nullable(form.coverage),
        coverage_value: nullable(form.coverage_value),
        coats: nullable(form.coats),
        available_sizes: splitList(form.available_sizes),
        price: nullable(form.price),
        price_unit: nullable(form.price_unit),
        discount: nullable(form.discount),
        warranty: nullable(form.warranty),
        technical_info: textToRecord(form.technical_info),
        application_instructions: nullable(form.application_instructions),
        drying_time: nullable(form.drying_time),
        color_info: nullable(form.color_info),
        features: splitList(form.main_benefits),
        suitable_for: splitList(form.suitable_projects),
        faq: textToRecord(form.faq),
        active: form.active,
        featured: form.featured,
        sort_order: nullable(form.sort_order),
        is_demo: form.is_demo
      })
    });
    const data = await response.json();
    setProducts(data.products ?? []);
    setForm(empty);
    setSaving(false);
  }

  async function toggle(product: Product) {
    const response = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: product.id, active: !product.active })
    });
    const data = await response.json();
    setProducts(data.products ?? []);
  }

  async function remove(id: string) {
    const response = await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    setProducts(data.products ?? []);
    if (form.id === id) setForm(empty);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="panel rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{editing ? "Edit Product" : "Add Product"}</h2>
          {editing ? (
            <button onClick={() => setForm(empty)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line" title="Cancel edit">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="space-y-3">
          <Field label="Product name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="SKU / code" value={form.sku} onChange={(value) => setForm({ ...form, sku: value })} />
          <Select label="Category" value={form.category} options={categories} onChange={(value) => setForm({ ...form, category: value })} />
          <Select label="Interior / Exterior" value={form.interior_or_exterior} options={scopes} onChange={(value) => setForm({ ...form, interior_or_exterior: value as Product["interior_or_exterior"] })} />
          <TextArea label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
          <Field label="Main benefits" value={form.main_benefits} onChange={(value) => setForm({ ...form, main_benefits: value })} />
          <Field label="Suitable surfaces" value={form.suitable_surfaces} onChange={(value) => setForm({ ...form, suitable_surfaces: value })} />
          <Field label="Suitable projects" value={form.suitable_projects} onChange={(value) => setForm({ ...form, suitable_projects: value })} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Coverage" value={form.coverage} onChange={(value) => setForm({ ...form, coverage: value })} />
            <Field label="m2/L" value={form.coverage_value} onChange={(value) => setForm({ ...form, coverage_value: value })} />
            <Field label="Coats" value={form.coats} onChange={(value) => setForm({ ...form, coats: value })} />
          </div>
          <Field label="Available sizes" value={form.available_sizes} onChange={(value) => setForm({ ...form, available_sizes: value })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Price" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
            <Field label="Price unit" value={form.price_unit} onChange={(value) => setForm({ ...form, price_unit: value })} />
          </div>
          <Field label="Discount" value={form.discount} onChange={(value) => setForm({ ...form, discount: value })} />
          <Field label="Warranty" value={form.warranty} onChange={(value) => setForm({ ...form, warranty: value })} />
          <TextArea label="Technical info" value={form.technical_info} onChange={(value) => setForm({ ...form, technical_info: value })} />
          <TextArea label="Application instructions" value={form.application_instructions} onChange={(value) => setForm({ ...form, application_instructions: value })} />
          <Field label="Drying time" value={form.drying_time} onChange={(value) => setForm({ ...form, drying_time: value })} />
          <TextArea label="Color information" value={form.color_info} onChange={(value) => setForm({ ...form, color_info: value })} />
          <TextArea label="FAQ" value={form.faq} onChange={(value) => setForm({ ...form, faq: value })} />
          <div className="grid grid-cols-3 gap-2">
            <CheckField label="Active" checked={form.active} onChange={(value) => setForm({ ...form, active: value })} />
            <CheckField label="Featured" checked={form.featured} onChange={(value) => setForm({ ...form, featured: value })} />
            <CheckField label="DEMO" checked={form.is_demo} onChange={(value) => setForm({ ...form, is_demo: value })} />
          </div>
          <Field label="Sort order" value={form.sort_order} onChange={(value) => setForm({ ...form, sort_order: value })} />
          <button disabled={!canSave || saving} onClick={save} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? "Saving..." : editing ? "Save changes" : "Add product"}
          </button>
        </div>
      </div>
      <div className="panel overflow-hidden rounded-lg">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="font-semibold">Product Knowledge Base</div>
          <div className="ml-auto flex min-w-0 flex-1 justify-end gap-2">
            <label className="relative min-w-44 max-w-64 flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-md border border-line py-2 pl-8 pr-3 text-sm" placeholder="Search" />
            </label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {products.map((product) => (
            <article key={product.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{product.name}</h3>
                  <p className="mt-1 text-sm text-muted">{product.sku ? `${product.sku} - ` : ""}{product.category}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setForm(productToForm(product))} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void toggle(product)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50" title={product.active ? "Deactivate" : "Activate"}>
                    {product.active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button onClick={() => void remove(product.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1 text-xs">
                <span className={`rounded px-2 py-1 ${product.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{product.active ? "Active" : "Inactive"}</span>
                {product.featured ? <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Featured</span> : null}
                {product.is_demo ? <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">DEMO</span> : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed">{product.description}</p>
              <div className="mt-3 text-sm text-muted">Coverage: {product.coverage ?? "Not updated"}</div>
              <div className="mt-1 text-sm text-muted">Price: {product.price === null ? "Not updated" : `${product.price.toLocaleString("vi-VN")} ${product.price_unit ?? ""}`}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {product.main_benefits.map((feature) => (
                  <span key={feature} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{feature}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-line px-3 py-2">
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-20 w-full rounded-md border border-line px-3 py-2" />
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
