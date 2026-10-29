// Worker entry point. Registers the tsx TypeScript loader through its public API
// (the hooks inherited from the parent thread do not resolve directory imports),
// then loads the TypeScript worker.
import { register } from 'tsx/esm/api';

register();
await import('./sim-worker.ts');
