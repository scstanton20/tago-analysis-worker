// frontend/src/modals/utils/testUtils.jsx
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import modalComponents from '../registry';

/**
 * Modal Test Utilities
 *
 * Provides helper functions and components for testing modals in isolation.
 */

/**
 * Wrapper component for rendering modals in tests
 * Includes all necessary providers (Mantine, Modals)
 *
 * Usage:
 * import { renderWithModals } from '../../modals/utils/testUtils';
 *
 * const { getByText } = renderWithModals(
 *   <YourComponent />
 * );
 */
export function ModalsTestWrapper({ children }) {
  return (
    <MantineProvider>
      <ModalsProvider
        modals={modalComponents}
        labels={{ confirm: 'Confirm', cancel: 'Cancel' }}
      >
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}

/**
 * Helper to render a component with modal providers
 * Wraps the standard render function from @testing-library/react
 *
 * @param {React.ReactElement} ui - Component to render
 * @param {Object} options - Additional render options
 * @returns {Object} Render result from @testing-library/react
 */
export function renderWithModals(ui, options = {}) {
  // Note: Requires @testing-library/react to be installed
  // If not already installed, run: pnpm add -D @testing-library/react
  try {
    // eslint-disable-next-line
    const { render } = require('@testing-library/react');
    return render(ui, {
      wrapper: ModalsTestWrapper,
      ...options,
    });
  } catch (error) {
    console.error(
      'Please install @testing-library/react to use renderWithModals:',
      'pnpm add -D @testing-library/react @testing-library/user-event',
    );
    throw error;
  }
}

/**
 * Mock modal context for unit testing modal content components
 * Provides the context object that Mantine passes to modal components
 */
export function createMockModalContext() {
  // Create mock functions that work with or without jest
  // Access jest via globalThis to avoid lint errors
  const hasJest = typeof globalThis.jest !== 'undefined';
  const closeModal = hasJest
    ? globalThis.jest.fn()
    : () => console.log('closeModal');
  const updateModal = hasJest
    ? globalThis.jest.fn()
    : () => console.log('updateModal');

  return {
    context: {
      closeModal,
      updateModal,
      closeContextModal: closeModal,
      // Add other context methods as needed
    },
    mocks: {
      closeModal,
      updateModal,
    },
  };
}

/**
 * Helper to wait for modal to open in tests
 * @param {Function} getByRole - getByRole from render result
 * @returns {Promise<HTMLElement>} Modal dialog element
 */
export async function waitForModal(getByRole) {
  try {
    // eslint-disable-next-line
    const { waitFor } = require('@testing-library/react');
    return waitFor(() => getByRole('dialog'), { timeout: 3000 });
  } catch (error) {
    console.error('Please install @testing-library/react to use waitForModal');
    throw error;
  }
}

/**
 * Helper to wait for modal to close in tests
 * @param {Function} queryByRole - queryByRole from render result
 * @returns {Promise<void>}
 */
export async function waitForModalClose(queryByRole) {
  try {
    // eslint-disable-next-line
    const { waitFor } = require('@testing-library/react');

    return waitFor(
      () => {
        // Note: expect is available in test environment
        if (!queryByRole('dialog')) return true;
        throw new Error('Modal still open');
      },
      { timeout: 3000 },
    );
  } catch (error) {
    console.error(
      'Please install @testing-library/react to use waitForModalClose',
    );
    throw error;
  }
}

/**
 * Example test setup for modal content component
 */
export const exampleModalTest = `
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockModalContext } from '../../modals/utils/testUtils';
import YourModalContent from '../components/YourModalContent';

describe('YourModalContent', () => {
  const mockAnalysis = {
    name: 'test-analysis',
    content: 'console.log("test");',
  };

  let context, mocks;

  beforeEach(() => {
    const mockContext = createMockModalContext();
    context = mockContext.context;
    mocks = mockContext.mocks;
  });

  it('renders with correct title', () => {
    render(
      <YourModalContent
        context={context}
        id="test-modal-id"
        innerProps={{ analysis: mockAnalysis }}
      />
    );

    expect(screen.getByText(/test-analysis/i)).toBeInTheDocument();
  });

  it('closes modal when cancel is clicked', async () => {
    render(
      <YourModalContent
        context={context}
        id="test-modal-id"
        innerProps={{ analysis: mockAnalysis }}
      />
    );

    await userEvent.click(screen.getByText('Cancel'));

    expect(mocks.closeModal).toHaveBeenCalledWith('test-modal-id');
  });
});
`;

/**
 * Example integration test for modal service
 */
export const exampleServiceTest = `
import { screen } from '@testing-library/react';
import { renderWithModals } from '../../modals/utils/testUtils';
import { modalService } from '../../modals/modalService';

describe('Modal Service Integration', () => {
  beforeEach(() => {
    // Render with modal providers
    renderWithModals(<div />);
  });

  it('opens modal with correct configuration', async () => {
    const mockAnalysis = { name: 'test-analysis' };

    modalService.openLogDownload(mockAnalysis, jest.fn());

    // Wait for modal to appear
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Download Logs: test-analysis/i)).toBeInTheDocument();
  });
});
`;
