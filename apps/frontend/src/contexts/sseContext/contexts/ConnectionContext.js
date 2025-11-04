// frontend/src/contexts/sseContext/contexts/ConnectionContext.js
import { createSSEContext } from '../utils/createSSEContext.js';

const { Context: ConnectionContext } = createSSEContext('Connection');

export { ConnectionContext };
