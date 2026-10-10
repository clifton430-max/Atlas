import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest runs without globals, so RTL's auto-cleanup isn't registered.
afterEach(() => cleanup());
