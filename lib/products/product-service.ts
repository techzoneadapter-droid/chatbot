import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { store } from "@/lib/storage/local-store";
import type { Product, SalesIntent } from "@/lib/types";
import { nowIso } from "@/lib/utils/time";

export const PRODUCT_CATEGORIES = [
  "Son noi that",
  "Son ngoai that",
  "Son lot",
  "Son chong tham",
  "Son trang tri",
  "Bot ba",
  "Phu kien",
  "Khac"
] as const;

export interface ProductQuery {
  includeInactive?: boolean;
  category?: string;
  search?: string;
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    sku: product.sku ?? null,
    main_benefits: product.main_benefits ?? product.features ?? [],
    suitable_surfaces: product.suitable_surfaces ?? [],
    suitable_projects: product.suitable_projects ?? product.suitable_for ?? [],
    coverage: product.coverage ?? null,
    coverage_value: product.coverage_value ?? null,
    coats: product.coats ?? null,
    discount: product.discount ?? null,
    warranty: product.warranty ?? null,
    technical_info: product.technical_info ?? {},
    application_instructions: product.application_instructions ?? null,
    drying_time: product.drying_time ?? null,
    color_info: product.color_info ?? null,
    features: product.features ?? [],
    suitable_for: product.suitable_for ?? product.suitable_projects ?? [],
    featured: product.featured ?? false,
    sort_order: product.sort_order ?? 0,
    is_demo: product.is_demo ?? false
  };
}

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function matchesQuery(product: Product, query: ProductQuery) {
  if (!query.includeInactive && !product.active) return false;
  if (query.category && product.category !== query.category) return false;
  if (!query.search) return true;
  const text = [
    product.name,
    product.sku,
    product.category,
    product.description,
    product.interior_or_exterior,
    ...product.main_benefits,
    ...product.suitable_surfaces,
    ...product.suitable_projects,
    ...product.features,
    ...product.suitable_for
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes(query.search.toLowerCase());
}

export async function listProducts(query: ProductQuery = {}): Promise<Product[]> {
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    let request = supabase.from("products").select("*");
    if (!query.includeInactive) request = request.eq("active", true);
    if (query.category) request = request.eq("category", query.category);
    const { data, error } = await request.order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (!error && data) {
      const normalized = data.map((item) => normalizeProduct(item as Product));
      return query.search ? normalized.filter((product) => matchesQuery(product, query)) : normalized;
    }
    console.error("Supabase product listing failed; using local store", error);
  }

  return sortProducts(store.products.map(normalizeProduct).filter((product) => matchesQuery(product, query)));
}

export async function upsertProduct(product: Product) {
  const next = normalizeProduct({ ...product, updated_at: nowIso() });
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(next.id);
    const payload = uuidLike ? next : (({ id, ...rest }) => rest)(next);
    const request = uuidLike ? supabase.from("products").upsert(payload).select("*").single() : supabase.from("products").insert(payload).select("*").single();
    const { data, error } = await request;
    if (error) console.error("Supabase product upsert failed; using local store");
    else return normalizeProduct(data as Product);
  }

  const index = store.products.findIndex((item) => item.id === next.id);
  if (index >= 0) store.products[index] = next;
  else store.products.unshift(next);
  return next;
}

export async function deleteProduct(id: string) {
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) console.error("Supabase product delete failed; using local store", error);
    else return;
  }
  store.products = store.products.filter((product) => product.id !== id);
}

export async function setProductActive(id: string, active: boolean) {
  const product = store.products.find((item) => item.id === id);
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from("products").update({ active, updated_at: nowIso() }).eq("id", id);
    if (!error) return;
    console.error("Supabase product status update failed; using local store", error);
  }
  if (product) await upsertProduct({ ...product, active });
}

function intentMatchesProduct(intent: SalesIntent, product: Product) {
  if (intent === "interior_paint") return product.interior_or_exterior === "interior" || product.interior_or_exterior === "both";
  if (intent === "exterior_paint") return product.interior_or_exterior === "exterior" || product.interior_or_exterior === "both";
  if (intent === "waterproofing") return /chong tham|waterproof/i.test(`${product.category} ${product.name} ${product.description}`);
  if (intent === "technical_question") return /lot|primer|bot|technical/i.test(`${product.category} ${product.name} ${product.description}`);
  return true;
}

function messageMatchesProduct(message: string, product: Product) {
  const text = message.toLowerCase();
  const haystack = [
    product.name,
    product.sku,
    product.category,
    product.description,
    product.interior_or_exterior,
    ...product.main_benefits,
    ...product.suitable_surfaces,
    ...product.suitable_projects,
    ...product.features,
    ...product.suitable_for
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes(text) ||
    (/phong|noi that|trong nha|living|bedroom|interior/i.test(text) && intentMatchesProduct("interior_paint", product)) ||
    (/ngoai|mat tien|facade|exterior|outdoor/i.test(text) && intentMatchesProduct("exterior_paint", product)) ||
    (/chong tham|tham|waterproof|san thuong|bathroom/i.test(text) && intentMatchesProduct("waterproofing", product)) ||
    (/lot|primer|son lot/i.test(text) && /lot|primer/i.test(haystack))
  );
}

export function recommendProducts(message: string, products: Product[], intent: SalesIntent = "unknown") {
  const active = products.map(normalizeProduct).filter((product) => product.active);
  const matched = active.filter((product) => intentMatchesProduct(intent, product) && messageMatchesProduct(message, product));
  return sortProducts(matched).slice(0, 3);
}
