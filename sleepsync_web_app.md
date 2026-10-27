import React, { useState } from 'react';

export default function SleepSyncApp() {
  const [journalText, setJournalText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Giả lập AI Engine phân tích nhật ký và dự đoán giấc ngủ
  const mockAIEngine = (text) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const lowerText = text.toLowerCase();
        let stressScore = 30; // Base stress
        let sleepQuality = 85; // Base sleep quality
        let interventions = [];
        let schedule = [];

        // Phân tích từ khóa (Semantic Analysis cơ bản)
        const highStressWords = ['căng thẳng', 'mệt', 'họp', 'deadline', 'tức giận', 'quá tải', 'cà phê', 'buồn ngủ'];
        const lowStressWords = ['vui', 'nhẹ nhàng', 'hoàn thành', 'thoải mái', 'thành công', 'thư giãn'];

        let stressHits = highStressWords.filter(word => lowerText.includes(word)).length;
        let relaxHits = lowStressWords.filter(word => lowerText.includes(word)).length;

        stressScore = Math.min(100, Math.max(10, stressScore + (stressHits * 15) - (relaxHits * 10)));
        sleepQuality = Math.max(20, sleepQuality - (stressHits * 12) + (relaxHits * 5));

        // Logic tự động lên lịch (Auto-Scheduler)
        if (stressScore > 60) {
          interventions.push("Mức độ căng thẳng cao. Bạn cần vận động mạnh để giải phóng cortisol.");
          schedule = [
            { time: "17:30 - 18:15", activity: "🏃 Chạy bộ cường độ cao (Giúp xả stress)", type: "action" },
            { time: "20:00 - 20:30", activity: "🛀 Tắm nước ấm (Hạ thân nhiệt, kích thích buồn ngủ)", type: "relax" },
            { time: "21:30", activity: "📵 Ngắt thiết bị điện tử", type: "wind-down" },
            { time: "22:30", activity: "😴 Lên giường đi ngủ", type: "sleep" }
          ];
        } else if (stressScore > 30) {
          interventions.push("Ngày làm việc khá bận rộn. Một chút vận động nhẹ sẽ giúp não bộ tái tạo.");
          schedule = [
            { time: "17:30 - 18:00", activity: "🚶 Đi dạo công viên hoặc Yoga nhẹ nhàng", type: "action" },
            { time: "21:00", activity: "📖 Đọc sách / Nghe podcast thư giãn", type: "relax" },
            { time: "22:00", activity: "📵 Ngắt thiết bị điện tử", type: "wind-down" },
            { time: "22:45", activity: "😴 Lên giường đi ngủ", type: "sleep" }
          ];
        } else {
          interventions.push("Ngày làm việc rất tốt! Duy trì nhịp độ này nhé.");
          schedule = [
            { time: "18:00 - 18:30", activity: "🧘 Thiền hoặc dọn dẹp nhà cửa", type: "action" },
            { time: "22:00", activity: "📵 Bắt đầu thói quen chuẩn bị ngủ", type: "wind-down" },
            { time: "23:00", activity: "😴 Lên giường đi ngủ", type: "sleep" }
          ];
        }

        resolve({ stressScore, sleepQuality, interventions, schedule });
      }, 1500); // Giả lập độ trễ API 1.5s
    });
  };

  const handleAnalyze = async () => {
    if (!journalText.trim()) return;
    setIsAnalyzing(true);
    const result = await mockAIEngine(journalText);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-indigo-900 mb-2">🌙 SleepSync AI</h1>
          <p className="text-slate-600">Ghi lại cảm xúc buổi trưa, tối ưu hóa giấc ngủ ban đêm</p>
        </header>

        {/* Input Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Nhật ký nửa ngày (12:30 PM)</h2>
          <p className="text-sm text-slate-500 mb-3">Sáng nay của bạn thế nào? Có nhiều cuộc họp căng thẳng hay uống nhiều cà phê không?</p>
          <textarea
            className="w-full h-32 p-4 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none resize-none"
            placeholder="Ví dụ: Sáng nay tôi có một cuộc họp rất căng thẳng với sếp, phải uống 2 ly cà phê mới tỉnh táo được. Hiện tại tôi thấy khá mệt..."
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !journalText.trim()}
            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex justify-center items-center"
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                AI đang phân tích...
              </span>
            ) : (
              "Phân tích & Lên lịch chiều nay"
            )}
          </button>
        </div>

        {/* Results Section */}
        {analysisResult && (
          <div className="space-y-6 animate-fade-in-up">
            
            {/* Prediction Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                <h3 className="text-slate-500 font-medium mb-2">Dự đoán chất lượng giấc ngủ</h3>
                <div className={`text-4xl font-bold ${analysisResult.sleepQuality > 70 ? 'text-green-500' : analysisResult.sleepQuality > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {analysisResult.sleepQuality}%
                </div>
                <p className="text-sm text-slate-400 mt-2">Nếu không có sự can thiệp</p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                <h3 className="text-slate-500 font-medium mb-2">Chỉ số Căng thẳng (Stress)</h3>
                <div className={`text-4xl font-bold ${analysisResult.stressScore < 40 ? 'text-green-500' : analysisResult.stressScore < 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {analysisResult.stressScore}/100
                </div>
                <p className="text-sm text-slate-400 mt-2 text-center">{analysisResult.interventions[0]}</p>
              </div>
            </div>

            {/* Smart Schedule */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🗓️</span>
                <h2 className="text-xl font-semibold text-slate-800">Lịch trình giải cứu giấc ngủ (Đề xuất)</h2>
              </div>
              
              <div className="relative border-l-2 border-indigo-100 ml-4 space-y-6">
                {analysisResult.schedule.map((item, index) => (
                  <div key={index} className="pl-6 relative">
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${
                      item.type === 'action' ? 'bg-orange-400' :
                      item.type === 'relax' ? 'bg-blue-400' :
                      item.type === 'wind-down' ? 'bg-indigo-400' : 'bg-purple-600'
                    }`}></div>
                    <div className="text-sm font-bold text-indigo-600 mb-1">{item.time}</div>
                    <div className="text-slate-700 bg-slate-50 p-3 rounded-lg inline-block border border-slate-100">
                      {item.activity}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}