import { ProductManager } from "@/components/products/product-manager";
import { AppShell } from "@/components/ui/shell";

export default function ProductsPage() {
  return (
    <AppShell title="Products" subtitle="Maintain the knowledge base the AI is allowed to use.">
      <ProductManager />
    </AppShell>
  );
}
