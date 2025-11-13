import { createSSEContext } from '../utils/createSSEContext.js';

const { Context: BackendContext } = createSSEContext('Backend');

export { BackendContext };
