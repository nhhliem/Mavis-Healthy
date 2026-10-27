# Chat và Voice với Gemini

Khung **Trò chuyện AI** có nút **Voice bên trái, Chat bên phải**. Trợ lý nổi Mavis bên phải được mở bằng nút ngôi sao, có gợi ý nhanh, nhập chữ/giọng nói, làm mới và đóng. Có thể kéo nút ngôi sao để đổi vị trí; vị trí được lưu trên trình duyệt.

Trợ lý nổi dùng chung hội thoại và Gemini với tab Chat/Voice. Micro trong khung nổi dùng nhận diện giọng nói của trình duyệt để gửi tin nhắn; hội thoại âm thanh trực tiếp Gemini Live nằm trong chế độ Voice. Chuyển sang Voice sẽ đóng khung nổi và dừng micro nhập tin nhắn.

## Chạy trên máy

1. Dùng Python 3.11 trở lên.
2. Tạo `.env` theo `.env.example`, điền khóa Google AI Studio. Khóa chỉ dùng trên server, không ghi vào JavaScript hoặc localStorage.
3. Chạy `python server.py`, mở `http://localhost:8080` (hoặc cổng trong biến `PORT`). Không chạy bằng máy chủ chỉ phục vụ file tĩnh hay mở trực tiếp file HTML.
4. Vào **Trò chuyện AI** để chat. Chọn **Voice**, bấm micro và cấp quyền để bắt đầu hội thoại Gemini Live. Bấm lại để kết thúc. Chuyển sang Chat hoặc ẩn trang sẽ ngắt micro và âm thanh.

Python dùng thư viện chuẩn, không cần cài thêm package. Trên Windows không có dữ liệu IANA timezone, server dùng UTC+7 khi không tìm được múi giờ.

## Deploy

Đặt `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL` trong biến môi trường của dịch vụ. `.env` được bỏ qua bởi Git và Docker. Micro trên điện thoại/máy khác cần HTTPS; localhost được trình duyệt cho phép.

## Dữ liệu và hành vi

- Chat gọi `/api/ai/chat` qua server, có lịch sử gần nhất, hồ sơ được chọn lọc, nhật ký của tài khoản hiện tại, dữ liệu đánh giá và giờ/múi giờ.
- Voice gọi `/api/ai/live-token` để nhận token ngắn hạn, dùng một lần và bị khóa theo cấu hình server. WebSocket gửi PCM16 16 kHz lên Gemini Live, phát PCM phản hồi và hiển thị bản chép lời. Không đưa khóa chính xuống trình duyệt.
- Chat và Voice chia sẻ hội thoại, lưu tối đa 40 tin nhắn trên trình duyệt, riêng theo ID tài khoản. Chưa đồng bộ lịch sử trò chuyện giữa các thiết bị.
- Không gửi mật khẩu, số điện thoại hay email trong ngữ cảnh AI. Phần lịch hiện có có thể chứa dữ liệu mẫu, được ghi rõ trong chỉ dẫn cho AI.
- Chỉ đưa vào ngữ cảnh lịch những sự kiện được nhập cho đúng tài khoản trong phiên này; không dùng các cuộc họp mẫu mặc định. Bản đánh giá hiện tại được chụp lại lúc hoàn thành và gắn với tài khoản, tránh dùng dữ liệu người trước khi chuyển tài khoản.
- Mavis tư vấn dựa trên dữ liệu được cung cấp; chưa tự sửa hồ sơ hoặc tạo sự kiện lịch từ trò chuyện.
- Lỗi API/hết hạn mức hiển thị rõ, không thay bằng bot kịch bản. Chat có nút thử lại; Voice có thể kết nối lại.

Tài liệu Google: [Generate content](https://ai.google.dev/api/generate-content), [Gemini Live](https://ai.google.dev/api/live), [Token ngắn hạn](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).

## Kiểm tra

Chạy `python -m unittest discover -s tests -v` để kiểm tra ngữ cảnh, lịch sử hội thoại, token Voice, lỗi API và chặn tải tệp riêng tư. Các bài kiểm tra này không gọi Google hay sửa dữ liệu người dùng.
