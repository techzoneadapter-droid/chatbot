"use client";

import { useEffect, useState } from "react";

export function OrdersTable() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setOrders(data.orders ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="border-b border-line px-4 py-3 font-semibold">Đơn hàng</div>
      {loading ? <div className="p-6 text-sm text-muted">Đang tải đơn hàng...</div> : null}
      {!loading && orders.length === 0 ? <div className="p-6 text-sm text-muted">Chưa có đơn hàng. AI sẽ tạo đơn nháp khi đủ SĐT, địa chỉ, sản phẩm và số lượng.</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-muted">
            <tr>
              <th className="px-4 py-3">Khách</th>
              <th className="px-4 py-3">SĐT</th>
              <th className="px-4 py-3">Địa chỉ</th>
              <th className="px-4 py-3">Sản phẩm</th>
              <th className="px-4 py-3">Số lượng</th>
              <th className="px-4 py-3">Giá trị</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const items = order.items ?? [];
              return (
                <tr key={order.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">{order.customer_name || "-"}</td>
                  <td className="px-4 py-3 font-medium">{order.phone}</td>
                  <td className="px-4 py-3">{order.address}</td>
                  <td className="px-4 py-3">{items.map((item: any) => item.product_name).join(", ") || "-"}</td>
                  <td className="px-4 py-3">{items.map((item: any) => item.quantity).join(", ") || "-"}</td>
                  <td className="px-4 py-3">{order.total_amount ? Number(order.total_amount).toLocaleString("vi-VN") : "Chờ xác nhận"}</td>
                  <td className="px-4 py-3">{order.status}</td>
                  <td className="px-4 py-3">{order.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
