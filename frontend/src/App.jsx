import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.js';
import { ThemeProvider } from './hooks/useTheme.js';
import AppRoutes from './router.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
