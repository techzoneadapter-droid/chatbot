import { NextResponse } from "next/server";
import { deleteProduct, listProducts, setProductActive, upsertProduct } from "@/lib/products/product-service";
import type { Product } from "@/lib/types";
import { createId } from "@/lib/utils/id";
import { nowIso } from "@/lib/utils/time";

function asArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  return {};
}

function asNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json({
    products: await listProducts({
      includeInactive: searchParams.get("includeInactive") === "true",
      category: searchParams.get("category") || undefined,
      search: searchParams.get("search") || undefined
    })
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Product>;
  if (!body.name || !body.category || !body.description) {
    return NextResponse.json({ error: "Name, category and description are required" }, { status: 400 });
  }

  const existing = body.id ? (await listProducts({ includeInactive: true })).find((product) => product.id === body.id) : null;
  const product: Product = {
    id: body.id || createId("prod"),
    name: body.name,
    sku: body.sku ?? null,
    category: body.category,
    description: body.description,
    interior_or_exterior: body.interior_or_exterior || "both",
    main_benefits: asArray(body.main_benefits ?? body.features),
    suitable_surfaces: asArray(body.suitable_surfaces),
    suitable_projects: asArray(body.suitable_projects ?? body.suitable_for),
    coverage: body.coverage || null,
    coverage_value: asNumber(body.coverage_value),
    coats: asNumber(body.coats),
    available_sizes: asArray(body.available_sizes),
    price: asNumber(body.price),
    price_unit: body.price_unit ?? null,
    discount: body.discount ?? null,
    warranty: body.warranty ?? null,
    technical_info: asRecord(body.technical_info),
    application_instructions: body.application_instructions ?? null,
    drying_time: body.drying_time ?? null,
    color_info: body.color_info ?? null,
    features: asArray(body.features ?? body.main_benefits),
    suitable_for: asArray(body.suitable_for ?? body.suitable_projects),
    faq: asRecord(body.faq),
    active: body.active ?? true,
    featured: body.featured ?? false,
    sort_order: asNumber(body.sort_order) ?? 100,
    is_demo: body.is_demo ?? false,
    created_at: body.created_at || existing?.created_at || nowIso(),
    updated_at: nowIso()
  };

  const saved = await upsertProduct(product);
  return NextResponse.json({ product: saved, products: await listProducts({ includeInactive: true }) });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; active?: boolean };
  if (!body.id || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Product id and active are required" }, { status: 400 });
  }
  await setProductActive(body.id, body.active);
  return NextResponse.json({ products: await listProducts({ includeInactive: true }) });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });
  await deleteProduct(id);
  return NextResponse.json({ products: await listProducts({ includeInactive: true }) });
}
