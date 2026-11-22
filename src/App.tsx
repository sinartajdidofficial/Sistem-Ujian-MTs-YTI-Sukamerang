import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import ExamPage from "./pages/ExamPage";
import ResultPage from "./pages/ResultPage";
import AdminPage from "./pages/AdminPage";
import AdminExamPage from "./pages/AdminExamPage";
import MonitorPage from "./pages/MonitorPage";
import ProctorEntry from "./pages/ProctorEntry";
import { ConfirmProvider } from "./components/ConfirmDialog";

export default function App() {
  return (
    <ConfirmProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/ujian/:sessionId" element={<ExamPage />} />
          <Route path="/selesai/:sessionId" element={<ResultPage />} />
          {/* halaman pengawas: mandiri, dibuka lewat tautan dari guru */}
          <Route path="/pantau" element={<MonitorPage />} />
          <Route path="/guru" element={<AdminPage />} />
          {/* tautan lama /guru/pantau diterjemahkan ke /pantau#k=… */}
          <Route path="/guru/pantau" element={<ProctorEntry />} />
          <Route path="/guru/:examId" element={<AdminExamPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfirmProvider>
  );
}
