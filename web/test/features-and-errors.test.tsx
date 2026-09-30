/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from '../src/pages/errors/NotFoundPage';
import { ForbiddenPage } from '../src/pages/errors/ForbiddenPage';
import { ServerErrorPage } from '../src/pages/errors/ServerErrorPage';
import { ErrorBanner } from '../src/components/ErrorBanner';

describe('Error Pages & Error Banner', () => {
  it('renders 404 NotFoundPage with return link and message', () => {
    render(
      <MemoryRouter>
        <NotFoundPage message="Custom page not found message" />
      </MemoryRouter>
    );

    expect(screen.getByText('404 Error')).toBeDefined();
    expect(screen.getByText('Page not found')).toBeDefined();
    expect(screen.getByText('Custom page not found message')).toBeDefined();
    expect(screen.getByRole('link', { name: /Return to Dashboard/i })).toBeDefined();
  });

  it('renders 403 ForbiddenPage with required permission details', () => {
    render(
      <MemoryRouter>
        <ForbiddenPage requiredPermission="hr:write" />
      </MemoryRouter>
    );

    expect(screen.getByText('403 Forbidden')).toBeDefined();
    expect(screen.getByText('Access not available')).toBeDefined();
    expect(screen.getByText('hr:write')).toBeDefined();
  });

  it('renders 500 ServerErrorPage with error message and retry button', () => {
    const handleRetry = vi.fn();
    render(
      <MemoryRouter>
        <ServerErrorPage
          error={new Error('Database connectivity timeout')}
          requestId="req_test_123"
          resetError={handleRetry}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('500 Server Error')).toBeDefined();
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('req_test_123')).toBeDefined();

    const retryButton = screen.getByRole('button', { name: /Try again/i });
    fireEvent.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders ErrorBanner with code, message, and handles dismissal', () => {
    const handleDismiss = vi.fn();
    const { container } = render(
      <ErrorBanner
        error={{
          name: 'ApiFailure',
          message: 'Invalid property attributes',
          status: 422,
          response: {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid property attributes',
              requestId: 'req_test_422',
              details: [{ field: 'rentMonthly', message: 'Rent must be positive' }]
            }
          }
        }}
        onDismiss={handleDismiss}
      />
    );

    expect(screen.getByText('VALIDATION_ERROR')).toBeDefined();
    expect(screen.getByText('Invalid property attributes')).toBeDefined();
    expect(screen.getByText(/Rent must be positive/i)).toBeDefined();

    const dismissBtn = screen.getByRole('button', { name: /Dismiss error notification/i });
    fireEvent.click(dismissBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.error-banner')).toBeNull();
  });
});
