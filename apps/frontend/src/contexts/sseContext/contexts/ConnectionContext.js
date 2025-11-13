import { createSSEContext } from '../utils/createSSEContext.js';

const { Context: ConnectionContext } = createSSEContext('Connection');

export { ConnectionContext };
