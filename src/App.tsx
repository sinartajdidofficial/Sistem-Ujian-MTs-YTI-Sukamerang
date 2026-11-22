import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import ExamPage from "./pages/ExamPage";
import ResultPage from "./pages/ResultPage";
import AdminPage from "./pages/AdminPage";
import AdminExamPage from "./pages/AdminExamPage";
import { ConfirmProvider } from "./components/ConfirmDialog";

export default function App() {
  return (
    <ConfirmProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/ujian/:sessionId" element={<ExamPage />} />
          <Route path="/selesai/:sessionId" element={<ResultPage />} />
          <Route path="/guru" element={<AdminPage />} />
          <Route path="/guru/:examId" element={<AdminExamPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfirmProvider>
  );
}
