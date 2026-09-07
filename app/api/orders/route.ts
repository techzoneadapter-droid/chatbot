import { NextResponse } from "next/server";
import { createOrder, listOrders } from "@/lib/admin-data";

export async function GET() {
  return NextResponse.json({ orders: await listOrders() });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.phone || !body.address || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Thiếu số điện thoại, địa chỉ hoặc sản phẩm" }, { status: 400 });
  }
  const saved = await createOrder(
    {
      customer_id: body.customer_id ?? null,
      conversation_id: body.conversation_id ?? null,
      customer_name: body.customer_name ?? null,
      phone: String(body.phone),
      address: String(body.address),
      status: body.status ?? "PENDING_CONFIRMATION",
      source: body.source ?? "other",
      total_amount: Number(body.total_amount ?? 0) || null,
      notes: body.notes ?? null
    },
    body.items.map((item: any) => ({
      product_id: item.product_id ?? null,
      product_name: String(item.product_name),
      variant: item.variant ?? null,
      quantity: Number(item.quantity ?? 1),
      unit_price: item.unit_price ? Number(item.unit_price) : null,
      amount: item.amount ? Number(item.amount) : null
    }))
  );
  return NextResponse.json(saved);
}
