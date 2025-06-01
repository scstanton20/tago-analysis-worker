// frontend/src/App.jsx
import { WebSocketProvider } from './contexts/websocketContext/index';
import Container from './components/layout/Container';
import UploadAnalysis from './components/analysis/uploadAnalysis';
import AnalysisList from './components/analysis/analysisList';
import { useIsMobile } from './hooks/useIsMobile';

function App() {
  const isMobile = useIsMobile();

  // Mobile: Show "not available" message
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <img
            src="/dark-ollie.png"
            alt="Application Logo"
            className="w-48 h-34 mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Desktop Only
          </h1>
          <p className="text-gray-600 mb-6 leading-relaxed">
            This application isn't available on mobile devices. Please access it
            from a desktop or laptop computer for the best experience.
          </p>
        </div>
      </div>
    );
  }
  return (
    <WebSocketProvider>
      <Container>
        <h1 className="text-3xl font-bold mb-8">PWS Tago Analysis Runner</h1>
        <UploadAnalysis />
        <AnalysisList />
      </Container>
    </WebSocketProvider>
  );
}

export default App;
