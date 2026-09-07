import { CommentsBoard } from "@/components/comments/comments-board";
import { AppShell } from "@/components/ui/shell";

export default function CommentsPage() {
  return (
    <AppShell title="Bình luận" subtitle="Theo dõi comment, trạng thái ẩn/like/reply và thao tác thủ công.">
      <CommentsBoard />
    </AppShell>
  );
}
