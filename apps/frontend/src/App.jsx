// frontend/src/App.jsx
import { useState, useEffect } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  useParams,
  useNavigate,
  Outlet,
} from 'react-router';
import {
  WebSocketProvider,
  useWebSocket,
} from './contexts/websocketContext/index';
import DepartmentalSidebarWithProviders from './components/departmentalSidebar';
import Container from './components/layout/Container';
import UploadAnalysis from './components/analysis/uploadAnalysis';
import AnalysisList from './components/analysis/analysisList';
import { useIsMobile } from './hooks/useIsMobile';
import { ThemeProvider } from './contexts/themeContext';

function DepartmentView() {
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const { analyses, departments } = useWebSocket();
  const [filteredAnalyses, setFilteredAnalyses] = useState({});

  // Debug logging
  useEffect(() => {
    console.log('DepartmentView - departmentId:', departmentId);
    console.log('DepartmentView - analyses:', analyses);
    console.log('DepartmentView - departments:', departments);
  }, [departmentId, analyses, departments]);

  // Filter analyses based on URL parameter
  useEffect(() => {
    if (!analyses || analyses.length === 0) {
      setFilteredAnalyses({});
      return;
    }

    console.log('Filtering analyses for department:', departmentId);

    if (!departmentId || departmentId === 'all') {
      // Show all analyses when no department selected or 'all' route
      const analysesObj = {};
      analyses.forEach((analysis) => {
        analysesObj[analysis.name] = analysis;
      });
      setFilteredAnalyses(analysesObj);
      console.log('Showing all analyses:', analysesObj);
    } else {
      // Filter by specific department
      const filtered = {};
      analyses.forEach((analysis) => {
        console.log(
          `Analysis ${analysis.name} department: ${analysis.department}, looking for: ${departmentId}`,
        );
        if (analysis.department === departmentId) {
          filtered[analysis.name] = analysis;
        }
      });
      setFilteredAnalyses(filtered);
      console.log('Filtered analyses:', filtered);
    }
  }, [departmentId, analyses]);

  // Handle department selection from sidebar
  const handleDepartmentSelect = (deptId) => {
    console.log('Department selected:', deptId);
    if (!deptId) {
      navigate('/departments/all');
    } else {
      navigate(`/departments/${deptId}`);
    }
  };

  // Convert departments object to array for finding
  const departmentsArray = Array.isArray(departments)
    ? departments
    : Object.values(departments || {});
  const currentDepartment =
    departmentId && departmentId !== 'all'
      ? departmentsArray.find((d) => d.id === departmentId)
      : null;

  const currentDepartmentName = currentDepartment?.name || 'All Departments';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Departmental Sidebar */}
      <DepartmentalSidebarWithProviders
        selectedDepartment={departmentId === 'all' ? null : departmentId}
        onDepartmentSelect={handleDepartmentSelect}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        <Container>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              PWS Tago Analysis Runner
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Viewing: {currentDepartmentName}
            </p>
            {departmentId && departmentId !== 'all' && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Department ID: {departmentId} | Found{' '}
                {Object.keys(filteredAnalyses).length} analyses
              </p>
            )}
          </div>

          <UploadAnalysis
            targetDepartment={departmentId === 'all' ? null : departmentId}
            departmentName={currentDepartmentName}
          />

          <AnalysisList
            analyses={filteredAnalyses}
            showDepartmentLabels={!departmentId || departmentId === 'all'}
            departments={departmentsArray}
          />
        </Container>
      </div>
    </div>
  );
}

// Root layout component with theme provider
function RootLayout() {
  return (
    <ThemeProvider>
      <WebSocketProvider>
        <Outlet />
      </WebSocketProvider>
    </ThemeProvider>
  );
}

// Component to handle default redirect
function DepartmentRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/departments/all', { replace: true });
  }, [navigate]);

  return null;
}

// Create the router configuration
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <DepartmentRedirect />,
      },
      {
        path: 'departments/:departmentId',
        element: <DepartmentView />,
      },
      {
        path: '*',
        element: <DepartmentRedirect />,
      },
    ],
  },
]);

function App() {
  const isMobile = useIsMobile();

  // Mobile: Show "not available" message with theme support
  if (isMobile) {
    return (
      <ThemeProvider>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <img
              src="/dark-ollie.png"
              alt="Application Logo"
              className="w-48 h-34 mx-auto mb-6"
            />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Desktop Only
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              This application isn't available on mobile devices. Please access
              it from a desktop or laptop computer for the best experience.
            </p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return <RouterProvider router={router} />;
}

export default App;
