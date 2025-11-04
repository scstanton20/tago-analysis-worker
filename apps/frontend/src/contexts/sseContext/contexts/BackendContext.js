// frontend/src/contexts/sseContext/contexts/BackendContext.js
import { createSSEContext } from '../utils/createSSEContext.js';

const { Context: BackendContext } = createSSEContext('Backend');

export { BackendContext };
