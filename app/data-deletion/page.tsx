export const metadata = {
  title: "Hướng dẫn xóa dữ liệu | CHATBOT",
  description: "Hướng dẫn yêu cầu xóa dữ liệu khỏi ứng dụng CHATBOT."
};

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight">Hướng dẫn yêu cầu xóa dữ liệu</h1>
      <p className="mt-2 text-sm text-slate-500">Cập nhật ngày 08/09/2026</p>

      <div className="mt-8 space-y-7 leading-7">
        <section>
          <h2 className="text-xl font-semibold">Cách yêu cầu xóa dữ liệu</h2>
          <p className="mt-2">
            Nếu bạn muốn xóa dữ liệu liên quan tới việc sử dụng CHATBOT hoặc Facebook Page đã kết nối, hãy gửi email tới <a className="underline" href="mailto:admin@chongthamtnano.com.vn">admin@chongthamtnano.com.vn</a> với tiêu đề “Yêu cầu xóa dữ liệu CHATBOT”.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Thông tin cần cung cấp</h2>
          <p className="mt-2">
            Vui lòng cung cấp tên Facebook Page hoặc Page ID (nếu biết), địa chỉ email liên hệ và mô tả dữ liệu bạn muốn xóa. Không gửi mật khẩu Facebook, Page Access Token hoặc thông tin đăng nhập nhạy cảm qua email.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Dữ liệu có thể được xóa</h2>
          <p className="mt-2">
            Tùy trường hợp, yêu cầu có thể bao gồm cấu hình Page trong CHATBOT, dữ liệu hội thoại được lưu bởi CHATBOT, thông tin ngữ cảnh sản phẩm/FAQ do chủ Page nhập và các dữ liệu kỹ thuật liên quan tới kết nối Page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Xác minh yêu cầu</h2>
          <p className="mt-2">
            Chúng tôi có thể yêu cầu thông tin hợp lý để xác minh người gửi có quyền yêu cầu xóa dữ liệu của Page tương ứng trước khi thực hiện việc xóa.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Thời gian xử lý</h2>
          <p className="mt-2">
            Yêu cầu hợp lệ sẽ được xử lý trong thời gian hợp lý theo phạm vi dữ liệu và nghĩa vụ pháp lý áp dụng. Một số bản ghi có thể được giữ lại khi cần thiết để đáp ứng yêu cầu bảo mật, chống gian lận hoặc nghĩa vụ pháp luật.
          </p>
        </section>
      </div>
    </main>
  );
}
