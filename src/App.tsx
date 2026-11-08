import { HashRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ToastContainer from './components/ToastContainer';
import UpdateListener from './components/UpdateListener';
import SessionManager from './components/SessionManager';
import { ContextMenuProvider } from './context-menu';
import { appRoutes } from './routes';

function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UpdateListener />
      <ContextMenuProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            {appRoutes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Route>
        </Routes>
        <ToastContainer />
        <SessionManager />
      </ContextMenuProvider>
    </HashRouter>
  );
}

export default App;

