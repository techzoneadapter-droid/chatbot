export const metadata = {
  title: "Chính sách quyền riêng tư | CHATBOT",
  description: "Chính sách quyền riêng tư cho ứng dụng CHATBOT tích hợp Facebook Messenger và Gemini."
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight">Chính sách quyền riêng tư</h1>
      <p className="mt-2 text-sm text-slate-500">Cập nhật ngày 08/09/2026</p>

      <div className="mt-8 space-y-7 leading-7">
        <section>
          <h2 className="text-xl font-semibold">1. Phạm vi</h2>
          <p className="mt-2">
            Chính sách này áp dụng cho ứng dụng CHATBOT, một công cụ hỗ trợ chủ Facebook Page tự động trả lời tin nhắn Messenger bằng AI dựa trên thông tin do chủ Page cấu hình.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Dữ liệu có thể được xử lý</h2>
          <p className="mt-2">
            Khi chủ Page kết nối Facebook với CHATBOT, ứng dụng có thể xử lý các thông tin cần thiết để vận hành tính năng nhắn tin, bao gồm thông tin Page, mã định danh kỹ thuật, quyền truy cập được Meta cấp, nội dung tin nhắn Messenger và lịch sử hội thoại liên quan. Chủ Page cũng có thể nhập thông tin sản phẩm, giá bán, FAQ và hướng dẫn trả lời cho chatbot.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Mục đích sử dụng</h2>
          <p className="mt-2">
            Dữ liệu chỉ được sử dụng để kết nối Facebook Page, nhận và gửi tin nhắn Messenger, tạo câu trả lời AI phù hợp với Page được kết nối, duy trì ngữ cảnh hội thoại, vận hành và bảo mật dịch vụ, và chẩn đoán lỗi kỹ thuật.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Dịch vụ bên thứ ba</h2>
          <p className="mt-2">
            CHATBOT sử dụng các dịch vụ của Meta để kết nối Facebook Messenger và có thể gửi nội dung cần thiết tới Google Gemini để tạo câu trả lời AI. Việc xử lý dữ liệu bởi các nhà cung cấp này còn chịu sự điều chỉnh bởi điều khoản và chính sách riêng của họ.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Chia sẻ và bán dữ liệu</h2>
          <p className="mt-2">
            CHATBOT không bán dữ liệu cá nhân. Dữ liệu chỉ được chia sẻ với các nhà cung cấp hạ tầng hoặc dịch vụ cần thiết để vận hành chức năng mà người dùng yêu cầu, hoặc khi pháp luật bắt buộc.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Lưu trữ và bảo mật</h2>
          <p className="mt-2">
            Dữ liệu được lưu trong thời gian cần thiết để cung cấp dịch vụ, duy trì lịch sử hội thoại và đáp ứng yêu cầu kỹ thuật hoặc pháp lý. Chúng tôi áp dụng các biện pháp hợp lý để hạn chế truy cập trái phép và bảo vệ thông tin xác thực của Page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Quyền của người dùng và xóa dữ liệu</h2>
          <p className="mt-2">
            Chủ Page có thể ngắt kết nối Page khỏi CHATBOT. Người dùng có thể yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu liên quan bằng cách gửi email tới admin@chongthamtnano.com.vn. Hướng dẫn xóa dữ liệu được công bố tại /data-deletion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Liên hệ</h2>
          <p className="mt-2">
            Email liên hệ về quyền riêng tư và dữ liệu: <a className="underline" href="mailto:admin@chongthamtnano.com.vn">admin@chongthamtnano.com.vn</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
