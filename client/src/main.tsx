import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PublicFormPage } from './pages/PublicForm/PublicFormPage';
import { AdminLoginPage } from './pages/Admin/LoginPage';
import { AdminDashboardPage } from './pages/Admin/DashboardPage';
import { AdminFormEditorPage } from './pages/Admin/FormEditorPage';
import './styles/global.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public form — no auth */}
        <Route path="/f/:id" element={<PublicFormPage />} />

        {/* Admin */}
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/form-instances/new" element={<AdminFormEditorPage />} />
        <Route path="/admin/form-instances/:id/edit" element={<AdminFormEditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);